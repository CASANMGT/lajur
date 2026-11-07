/** Pelanggan: CRM, sample, deposit, riwayat. */

import {
  esc, icon, fmt, badge, swatch, toast, openModal, field, confirmAction, amountCell,
} from '../dom.js';
import { byId, parseM, todayJakarta } from '../../domain/core.js';
import {
  CRM_STAGE, SAMPLE_MODE, createCustomer, createDeposit, createSample, customerReceivable,
  depositBalance, linkSampleToInvoice, logActivity, refundDeposit, updateCustomer,
} from '../../domain/crm.js';
import { invoiceOutstanding, invoiceStatusLabel } from '../../domain/sales.js';
import { availableMm, sellableRolls } from '../../domain/inventory.js';
import { PROJECT_STATUS } from '../../domain/projects.js';
import { settingsOf } from '../../domain/settings.js';
import { pageHead, statCard, can } from './common.js';

export function render(ctx) {
  if (ctx.route.id) return renderDetail(ctx);

  const { db, role } = ctx;
  const rows = db.customers.map((c) => {
    const projects = db.projects.filter((p) => p.customerId === c.id && p.status !== 'cancelled');
    const samples = db.samples.filter((s) => s.customerId === c.id);
    const receivable = customerReceivable(db, c.id);
    const deposit = db.deposits.filter((d) => d.customerId === c.id).reduce((a, d) => a + depositBalance(d), 0);
    return { c, projects, samples, receivable, deposit };
  }).sort((a, b) => b.receivable - a.receivable || a.c.name.localeCompare(b.c.name));

  const pipeline = rows.filter((r) => ['prospek', 'sample', 'negosiasi'].includes(r.c.stage));

  return `
    ${pageHead({
      eyebrow: 'CRM',
      title: 'Pelanggan',
      sub: 'Profil, proyek, sample, deposit, piutang, dan riwayat aktivitas dalam satu tempat.',
      actions: `${can(role, 'customer.create') ? `<button class="btn btn-primary" type="button" data-act="new-customer">${icon('plus')} Pelanggan baru</button>` : ''}`,
    })}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Total pelanggan', value: String(db.customers.length), meta: `${pipeline.length} dalam pipeline`, iconName: 'users' })}
      ${statCard({ label: 'Piutang', value: fmt.money(rows.reduce((a, r) => a + r.receivable, 0)), meta: 'Saldo faktur terbit', tone: 'warn' })}
      ${statCard({ label: 'Deposit terbuka', value: fmt.money(rows.reduce((a, r) => a + r.deposit, 0)), meta: 'Kewajiban ke pelanggan', tone: 'warn' })}
      ${statCard({ label: 'Sample aktif', value: String(db.samples.filter((s) => s.status === 'active').length), meta: `${db.samples.filter((s) => s.status === 'converted').length} terkonversi`, iconName: 'spark' })}
    </div>

    <section class="card">
      <div class="table-wrap desktop-table">
        <table class="data">
          <thead><tr><th>Pelanggan</th><th>Stage</th><th class="hide-sm">Aksi berikutnya</th><th class="num">Piutang</th><th class="num">Deposit</th></tr></thead>
          <tbody>${rows.map(({ c, projects, samples, receivable, deposit }) => `<tr data-href="#/pelanggan/${c.id}" tabindex="0" role="link">
            <td><strong>${esc(c.name)}</strong><div class="xs muted">${esc(c.company || c.city || '')} · ${projects.length} proyek · ${samples.length} sample</div></td>
            <td>${badge(CRM_STAGE[c.stage]?.label ?? c.stage, CRM_STAGE[c.stage]?.tone ?? 'muted')}</td>
            <td class="hide-sm">${esc(c.nextAction || '—')}<div class="xs muted">${esc(c.followUpDate || '')}</div></td>
            <td class="num ${receivable ? 'strong' : 'muted'}">${receivable ? fmt.money(receivable) : '—'}</td>
            <td class="num">${deposit ? fmt.money(deposit) : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="mobile-cards">
        ${rows.map(({ c, projects, receivable, deposit }) => `<a class="roll-card" href="#/pelanggan/${c.id}" style="color:inherit;text-decoration:none">
          <div class="top"><span class="small strong">${esc(c.name)}</span>${badge(CRM_STAGE[c.stage]?.label ?? c.stage, CRM_STAGE[c.stage]?.tone ?? 'muted')}</div>
          <div class="xs muted">${esc(c.company || '')} · ${projects.length} proyek</div>
          <div class="grid3">
            <div class="kv"><span>Piutang</span><strong>${fmt.money(receivable)}</strong></div>
            <div class="kv"><span>Deposit</span><strong>${fmt.money(deposit)}</strong></div>
            <div class="kv"><span>Follow-up</span><strong class="xs">${esc(c.followUpDate || '—')}</strong></div>
          </div>
        </a>`).join('')}
      </div>
    </section>`;
}

function renderDetail(ctx) {
  const { db, role, route } = ctx;
  const c = db.customers.find((x) => x.id === route.id);
  if (!c) return `${pageHead({ title: 'Tidak ditemukan' })}<div class="notice notice-danger">${icon('alert')}<div>Pelanggan ${esc(route.id)} tidak ada.</div></div>`;

  const projects = db.projects.filter((p) => p.customerId === c.id);
  const invoices = db.invoices.filter((i) => i.customerId === c.id);
  const samples = db.samples.filter((s) => s.customerId === c.id);
  const deposits = db.deposits.filter((d) => d.customerId === c.id);
  const receivable = customerReceivable(db, c.id);
  const openDeposit = deposits.reduce((a, d) => a + depositBalance(d), 0);

  const actions = [];
  if (can(role, 'customer.edit')) actions.push(`<button class="btn" data-act="edit">${icon('settings')} Edit</button>`);
  if (can(role, 'sample.create')) actions.push(`<button class="btn" data-act="new-sample">${icon('spark')} Kirim sample</button>`);
  if (can(role, 'deposit.create')) actions.push(`<button class="btn btn-primary" data-act="new-deposit">${icon('wallet')} Terima deposit</button>`);
  if (can(role, 'customer.edit')) actions.push(`<button class="btn" data-act="log">${icon('plus')} Catat aktivitas</button>`);

  return `
    <div class="page-head">
      <div>
        <a class="small strong" href="#/pelanggan">← Semua pelanggan</a>
        <div class="row" style="margin-top:6px"><h1>${esc(c.name)}</h1>${badge(CRM_STAGE[c.stage]?.label ?? c.stage, CRM_STAGE[c.stage]?.tone ?? 'muted')}</div>
        <p class="sub">${esc(c.company || '')} ${c.city ? `· ${esc(c.city)}` : ''} · PIC sales ${esc(byId(db.users, c.salespersonId)?.name ?? '—')}</p>
      </div>
      <div class="page-actions">${actions.join('')}</div>
    </div>

    <div class="grid grid-main">
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>Proyek</h2><p>Riwayat proyek dan status material.</p></div><span class="badge no-dot">${projects.length}</span></div>
          ${projects.length ? `<div class="table-wrap"><table class="data">
            <thead><tr><th>Proyek</th><th>Target</th><th>Status</th></tr></thead>
            <tbody>${projects.map((p) => `<tr data-href="#/proyek/${p.id}" tabindex="0" role="link">
              <td><strong>${esc(p.name)}</strong><div class="xs muted">${esc(p.id)} · ${esc(p.location)}</div></td>
              <td>${esc(p.targetDate)}</td>
              <td>${badge(PROJECT_STATUS[p.status]?.label ?? p.status, PROJECT_STATUS[p.status]?.tone ?? 'muted')}</td>
            </tr>`).join('')}</tbody>
          </table></div>` : `<div class="empty" style="padding:24px">${icon('layers')}<strong>Belum ada proyek</strong></div>`}
        </section>

        <section class="card">
          <div class="card-head"><div><h2>Faktur & pembayaran</h2><p>Saldo dihitung dari pembayaran dan kredit.</p></div><span class="badge no-dot">${invoices.length}</span></div>
          ${invoices.length ? `<div class="table-wrap"><table class="data">
            <thead><tr><th>Faktur</th><th>Tanggal</th><th class="num">Total</th><th class="num">Sisa</th><th>Status</th></tr></thead>
            <tbody>${invoices.map((inv) => `<tr data-href="#/penjualan/${inv.id}" tabindex="0" role="link">
              <td class="mono">${esc(inv.id)}</td><td>${esc(inv.date)}</td>
              <td class="num">${fmt.money(inv.total)}</td><td class="num">${fmt.money(invoiceOutstanding(inv))}</td>
              <td>${badge(invoiceStatusLabel(inv), invoiceOutstanding(inv) ? 'warn' : 'ok')}</td>
            </tr>`).join('')}</tbody>
          </table></div>` : `<div class="empty" style="padding:24px">${icon('receipt')}<strong>Belum ada faktur</strong></div>`}
        </section>

        <section class="card">
          <div class="card-head"><div><h2>Sample</h2><p>Dari roll mana, untuk siapa, dan apakah berujung pembelian.</p></div><span class="badge no-dot">${samples.length}</span></div>
          ${samples.length ? `<div class="table-wrap"><table class="data">
            <thead><tr><th>Sample</th><th>Roll / lot</th><th class="num">Qty</th><th>Jenis</th><th>Hasil</th><th><span class="sr-only">Aksi</span></th></tr></thead>
            <tbody>${samples.map((s) => {
              const sku = byId(db.skus, s.skuId);
              const roll = db.rolls.find((r) => r.id === s.rollId);
              const linked = s.linkedInvoiceId;
              return `<tr>
                <td><strong>${esc(sku?.collectionName)} ${esc(sku?.colourName || sku?.colourCode)}</strong><div class="xs muted">${esc(s.id)} · ${esc(s.date)}</div></td>
                <td><a class="mono xs" href="#/stok/${s.rollId}">${esc(s.rollId)}</a><div class="xs muted">${esc(roll?.lot ?? '')}</div></td>
                <td class="num">${fmt.m(s.qtyMm)}</td>
                <td>${badge(SAMPLE_MODE[s.mode].label, SAMPLE_MODE[s.mode].tone)}</td>
                <td>${linked ? `<a class="xs strong" href="#/penjualan/${linked}">${esc(linked)}</a>` : badge('Belum beli', 'muted')}</td>
                <td class="right">${!linked && can(role, 'sample.create') ? `<button class="btn btn-sm" data-act="link-sample" data-id="${s.id}">Kaitkan</button>` : ''}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>` : `<div class="empty" style="padding:24px">${icon('spark')}<strong>Belum ada sample</strong></div>`}
        </section>

        <section class="card">
          <div class="card-head"><div><h2>Deposit</h2><p>Kewajiban, bukan pendapatan. Refund dan pemakaian tidak boleh dobel.</p></div></div>
          <div class="card-pad">
            ${deposits.length ? `<div class="stack">
              ${deposits.map((d) => `<div>
                <div class="row-between">
                  <div><strong class="small">${esc(d.id)}</strong> · ${badge(d.kind === 'sample' ? 'Sample' : 'Indent', d.kind === 'sample' ? 'copper' : 'info')}
                    <div class="xs muted">${esc(d.note)} · diterima ${esc(d.receivedAt)}</div>
                  </div>
                  <div class="right">
                    <div class="strong num">${fmt.money(depositBalance(d))}</div>
                    <div class="xs muted">dari ${fmt.money(d.amount)}</div>
                  </div>
                </div>
                <div class="row" style="margin-top:6px">
                  ${depositBalance(d) > 0 && can(role, 'deposit.create') ? `<button class="btn btn-sm" data-act="refund" data-id="${d.id}">Refund</button>` : ''}
                  <span class="xs muted">${d.ledger.map((l) => `${l.type} ${fmt.money(l.amount)}`).join(' · ')}</span>
                </div>
              </div>`).join('')}
            </div>` : '<p class="small muted">Belum ada deposit.</p>'}
          </div>
        </section>

        <section class="card card-pad">
          <h2>Aktivitas</h2>
          <ul class="timeline" style="margin-top:10px">
            ${(c.activities ?? []).map((a) => `<li><div class="t-head"><strong>${esc(a.type)}</strong><time>${esc(a.date)}</time></div><div class="t-body">${esc(a.note)} · ${esc(a.by)}</div></li>`).join('') || '<li class="muted small">Belum ada aktivitas.</li>'}
          </ul>
        </section>
      </div>

      <div class="stack">
        <section class="card card-pad">
          <div class="row">
            <div class="stat" style="flex:1;border:0;padding:0;box-shadow:none"><div class="label">Piutang</div><div class="value" style="font-size:1.25rem">${fmt.money(receivable)}</div></div>
            <div class="stat" style="flex:1;border:0;padding:0;box-shadow:none"><div class="label">Deposit</div><div class="value" style="font-size:1.25rem">${fmt.money(openDeposit)}</div></div>
          </div>
          <hr class="divider" />
          <div class="stack-sm">
            <div class="row-between"><span class="small muted">Telepon</span><span class="small">${esc(c.phone || '—')}</span></div>
            <div class="row-between"><span class="small muted">Email</span><span class="small">${esc(c.email || '—')}</span></div>
            <div class="row-between"><span class="small muted">Alamat</span><span class="small right">${esc(c.address || '—')}</span></div>
            <div class="row-between"><span class="small muted">Kota</span><span class="small">${esc(c.city || '—')}</span></div>
            <div class="row-between"><span class="small muted">Aksi berikutnya</span><span class="small">${esc(c.nextAction || '—')}</span></div>
            <div class="row-between"><span class="small muted">Follow-up</span><span class="small">${esc(c.followUpDate || '—')}</span></div>
          </div>
          ${c.notes ? `<hr class="divider" /><p class="small muted">${esc(c.notes)}</p>` : ''}
        </section>

        <section class="card card-pad">
          <h2>Kebijakan deposit</h2>
          <ul class="small muted" style="padding-left:16px;margin:8px 0 0;line-height:1.6">
            <li>Deposit masuk sebagai kewajiban, bukan omzet.</li>
            <li>Refund sample butuh pembelian yang dikaitkan.</li>
            <li>Nilai yang sudah dipakai tidak bisa direfund lagi.</li>
          </ul>
        </section>
      </div>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

function openEdit(ctx, c) {
  openModal({
    title: 'Edit pelanggan',
    submitLabel: 'Simpan',
    wide: true,
    body: `<div class="form-grid">
      ${field('Nama', `<input class="input" name="name" value="${esc(c.name)}" required />`)}
      ${field('Perusahaan', `<input class="input" name="company" value="${esc(c.company)}" />`)}
      ${field('Telepon', `<input class="input" name="phone" value="${esc(c.phone)}" />`)}
      ${field('Email', `<input class="input" name="email" value="${esc(c.email)}" />`)}
      ${field('Alamat', `<input class="input" name="address" value="${esc(c.address)}" />`, { full: true })}
      ${field('Kota', `<input class="input" name="city" value="${esc(c.city)}" />`)}
      ${field('Stage', `<select class="select" name="stage">${Object.entries(CRM_STAGE).map(([k, v]) => `<option value="${k}" ${c.stage === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`)}
      ${field('Aksi berikutnya', `<input class="input" name="nextAction" value="${esc(c.nextAction)}" />`, { full: true })}
      ${field('Tanggal follow-up', `<input class="input" type="date" name="followUpDate" value="${esc(c.followUpDate)}" />`)}
      ${field('Catatan', `<input class="input" name="notes" value="${esc(c.notes)}" />`)}
    </div>`,
    onSubmit(form, close) {
      ctx.store.update((db) => updateCustomer(db, {
        id: c.id,
        user: ctx.user,
        patch: {
          name: form.name.value.trim(),
          company: form.company.value,
          phone: form.phone.value,
          email: form.email.value,
          address: form.address.value,
          city: form.city.value,
          stage: form.stage.value,
          nextAction: form.nextAction.value,
          followUpDate: form.followUpDate.value,
          notes: form.notes.value,
        },
      }));
      close();
      toast('Profil pelanggan diperbarui.', { tone: 'success' });
    },
  });
}

function openSample(ctx, c) {
  const { db } = ctx;
  const availableSkus = db.skus.filter((s) => s.active && db.rolls.some((r) => r.skuId === s.id && availableMm(r) > 0));
  const skuOptions = availableSkus.map((s) => `<option value="${s.id}">${esc(s.collectionName)} ${esc(s.colourName || s.colourCode)} — ${esc(s.code)}</option>`).join('');
  const firstSku = availableSkus[0]?.id;
  const rollsFor = (skuId) => sellableRolls(db, skuId, ctx.ui.warehouseId === 'all' ? 'wh-jkt' : ctx.ui.warehouseId)
    .map((r) => `<option value="${r.id}">${esc(r.id)} · lot ${esc(r.lot)} · ${fmt.m(availableMm(r))}</option>`).join('');

  openModal({
    title: 'Kirim sample',
    description: 'Sample dipotong dari roll tertentu sehingga stok fisik berkurang.',
    body: `
      ${field('SKU / warna', `<select class="select" name="sku">${skuOptions}</select>`)}
      ${field('Roll sumber', `<select class="select" name="roll">${rollsFor(firstSku)}</select>`)}
      ${field('Panjang sample (m)', `<input class="input" name="qty" inputmode="decimal" value="0,5" />`)}
      ${field('Jenis sample', `<select class="select" name="mode"><option value="free">Gratis</option><option value="paid">Berbayar</option><option value="deposit" ${settingsOf(db).sampleDepositRequired ? 'selected' : ''}>Deposit refundable</option></select>`)}
      ${field('Nominal (Rp)', `<input class="input" name="amount" inputmode="numeric" placeholder="0" />`, { hint: 'Wajib untuk berbayar / deposit.' })}
      ${field('Catatan', `<input class="input" name="notes" placeholder="Warna yang diminta, ruangan, dsb." />`)}
    `,
    onMount(form) {
      form.sku.addEventListener('change', () => {
        form.roll.innerHTML = rollsFor(form.sku.value);
      });
    },
    onSubmit(form, close) {
      const mode = form.mode.value;
      const amount = Number(String(form.amount.value).replace(/\D/g, '')) || 0;
      if ((mode === 'paid' || mode === 'deposit') && !amount) throw new Error('Nominal wajib untuk sample berbayar atau deposit.');
      ctx.store.update((db) => createSample(db, {
        customerId: c.id,
        skuId: form.sku.value,
        rollId: form.roll.value,
        qtyMm: parseM(form.qty.value),
        mode,
        amount,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast('Sample dicatat; roll sumber berkurang.', { tone: 'success' });
    },
  });
}

function openDeposit(ctx, c) {
  openModal({
    title: 'Terima deposit',
    description: 'Deposit dicatat sebagai kewajiban dan dialokasikan ke faktur saat tersedia.',
    body: `
      ${field('Nominal (Rp)', `<input class="input" name="amount" inputmode="numeric" placeholder="0" />`)}
      ${field('Tanggal', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
      ${field('Catatan', `<input class="input" name="note" placeholder="Contoh: DP indent Luna-02" />`)}
    `,
    onSubmit(form, close) {
      const amount = Number(String(form.amount.value).replace(/\D/g, ''));
      ctx.store.update((db) => createDeposit(db, {
        customerId: c.id,
        kind: 'indent',
        amount,
        date: form.date.value,
        note: form.note.value,
        user: ctx.user,
      }));
      close();
      toast('Deposit dicatat sebagai kewajiban.', { tone: 'success' });
    },
  });
}

function openRefund(ctx, c, deposit) {
  const balance = depositBalance(deposit);
  const sample = deposit.sampleId ? ctx.db.samples.find((s) => s.id === deposit.sampleId) : null;
  const linked = sample?.linkedInvoiceId;
  openModal({
    title: `Refund ${deposit.id}`,
    description: `Saldo deposit ${fmt.money(balance)}.`,
    submitLabel: 'Proses refund',
    body: `
      ${deposit.kind === 'sample' && !linked ? `<div class="notice notice-danger" style="margin-bottom:10px">${icon('alert')}<div>Belum ada pembelian terkait. Refund sample diblokir sampai sample dikaitkan ke faktur.</div></div>` : ''}
      ${field('Nominal (Rp)', `<input class="input" name="amount" inputmode="numeric" value="${String(balance)}" />`)}
      ${field('Alasan', `<input class="input" name="reason" placeholder="Wajib diisi" />`)}
      <div class="notice notice-info" style="margin-top:10px">${icon('alert')}<div>Refund tidak boleh melebihi saldo dan tidak boleh tumpang tindih dengan pemakaian deposit.</div></div>
    `,
    onSubmit(form, close) {
      const amount = Number(String(form.amount.value).replace(/\D/g, ''));
      ctx.store.update((db) => refundDeposit(db, {
        depositId: deposit.id,
        amount,
        reason: form.reason.value,
        user: ctx.user,
      }));
      close();
      toast('Refund dicatat pada ledger deposit.', { tone: 'success' });
    },
  });
}

function openLinkSample(ctx, c, sample) {
  const invoices = ctx.db.invoices.filter((i) => i.customerId === c.id && i.status === 'posted' && i.date >= sample.date);
  if (!invoices.length) {
    toast('Belum ada faktur terbit setelah tanggal sample untuk dikaitkan.', { tone: 'error' });
    return;
  }
  openModal({
    title: `Kaitkan sample ${sample.id}`,
    description: 'Konversi sample ke pembelian yang benar-benar terjadi.',
    body: field('Faktur', `<select class="select" name="invoice">${invoices.map((i) => `<option value="${i.id}">${esc(i.id)} · ${esc(i.date)} · ${fmt.money(i.total)}</option>`).join('')}</select>`),
    onSubmit(form, close) {
      ctx.store.update((db) => linkSampleToInvoice(db, { sampleId: sample.id, invoiceId: form.invoice.value, user: ctx.user }));
      close();
      toast('Sample dikaitkan ke faktur; konversi tercatat.', { tone: 'success' });
    },
  });
}

function openActivity(ctx, c) {
  openModal({
    title: 'Catat aktivitas',
    body: `
      ${field('Jenis', `<select class="select" name="type"><option value="telepon">Telepon</option><option value="kunjungan">Kunjungan</option><option value="whatsapp">WhatsApp</option><option value="catatan">Catatan</option></select>`)}
      ${field('Catatan', `<textarea class="textarea" name="note" placeholder="Ringkasan percakapan dan kesepakatan"></textarea>`)}
    `,
    onSubmit(form, close) {
      ctx.store.update((db) => logActivity(db, { customerId: c.id, type: form.type.value, note: form.note.value, user: ctx.user }));
      close();
      toast('Aktivitas dicatat.', { tone: 'success' });
    },
  });
}

export function openCreate(ctx) {
  openModal({
    title: 'Pelanggan baru',
    submitLabel: 'Simpan pelanggan',
    wide: true,
    body: `<div class="form-grid">
      ${field('Nama', `<input class="input" name="name" required />`)}
      ${field('Perusahaan', `<input class="input" name="company" />`)}
      ${field('Telepon', `<input class="input" name="phone" />`)}
      ${field('Email', `<input class="input" name="email" />`)}
      ${field('Kota', `<input class="input" name="city" />`)}
      ${field('Stage', `<select class="select" name="stage">${Object.entries(CRM_STAGE).map(([k, v]) => `<option value="${k}" ${k === 'prospek' ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`)}
      ${field('Alamat', `<input class="input" name="address" />`, { full: true })}
      ${field('Aksi berikutnya', `<input class="input" name="nextAction" />`, { full: true })}
      ${field('Follow-up', `<input class="input" type="date" name="followUpDate" />`)}
    </div>`,
    onSubmit(form, close) {
      const customer = ctx.store.update((db) => createCustomer(db, {
        name: form.name.value,
        company: form.company.value,
        phone: form.phone.value,
        email: form.email.value,
        address: form.address.value,
        city: form.city.value,
        stage: form.stage.value,
        nextAction: form.nextAction.value,
        followUpDate: form.followUpDate.value,
        salespersonId: ctx.user.id,
      }, ctx.user));
      close();
      window.location.hash = `#/pelanggan/${customer.id}`;
      toast('Pelanggan dibuat.', { tone: 'success' });
    },
  });
}

/* -------------------------------------------------------------------------- */

export function mount(ctx) {
  if (ctx.route.id) {
    const c = ctx.db.customers.find((x) => x.id === ctx.route.id);
    if (!c) return;
    document.querySelector('[data-act="edit"]')?.addEventListener('click', () => openEdit(ctx, c));
    document.querySelector('[data-act="new-sample"]')?.addEventListener('click', () => openSample(ctx, c));
    document.querySelector('[data-act="new-deposit"]')?.addEventListener('click', () => openDeposit(ctx, c));
    document.querySelector('[data-act="log"]')?.addEventListener('click', () => openActivity(ctx, c));
    document.querySelectorAll('[data-act="refund"]').forEach((btn) => btn.addEventListener('click', () => {
      const deposit = ctx.db.deposits.find((d) => d.id === btn.dataset.id);
      if (deposit) openRefund(ctx, c, deposit);
    }));
    document.querySelectorAll('[data-act="link-sample"]').forEach((btn) => btn.addEventListener('click', () => {
      const sample = ctx.db.samples.find((s) => s.id === btn.dataset.id);
      if (sample) openLinkSample(ctx, c, sample);
    }));
    document.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => {
      window.location.hash = tr.dataset.href.replace('#', '');
    }));
    return;
  }

  document.querySelector('[data-act="new-customer"]')?.addEventListener('click', () => openCreate(ctx));
  document.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => {
    window.location.hash = tr.dataset.href.replace('#', '');
  }));
}
