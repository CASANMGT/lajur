/** Sample & Deposit — dedicated customer-sample and deposit workspace. */

import {
  esc, icon, fmt, badge, toast, openModal, field, printDocument,
} from '../dom.js';
import { byId, parseM, todayJakarta } from '../../domain/core.js';
import {
  SAMPLE_BOOK_STATUS, SAMPLE_MODE, createSample, createSampleBook, depositBalance, giveSampleBook,
  linkSampleToInvoice, refundDeposit,
} from '../../domain/crm.js';
import { availableMm, sellableRolls } from '../../domain/inventory.js';
import { settingsOf } from '../../domain/settings.js';
import { pageHead, statCard, can, warehouseOf } from './common.js';
import { printSampleBookHtml } from './print.js';

let filter = { status: 'all' };

export function render(ctx) {
  const { db, role, user } = ctx;
  const samples = db.samples
    .filter((s) => filter.status === 'all' || s.status === filter.status)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const active = db.samples.filter((s) => s.status === 'active').length;
  const converted = db.samples.filter((s) => s.status === 'converted').length;
  const rate = db.samples.length ? Math.round((converted / db.samples.length) * 100) : 0;
  const deposits = db.deposits.filter((d) => d.kind === 'sample' || d.kind === 'indent');
  const openDeposit = deposits.reduce((a, d) => a + depositBalance(d), 0);
  const books = db.sampleBooks ?? [];

  return `
    ${pageHead({
      eyebrow: 'CRM',
      title: 'Sample & Deposit',
      sub: 'Sample dipotong dari roll tertentu. Deposit adalah kewajiban, bukan omzet.',
      actions: `${can(role, 'sample.create') ? `<button class="btn" type="button" data-act="new-book">${icon('layers')} Buku sample</button><button class="btn btn-primary" type="button" data-act="new-sample">${icon('spark')} Sample baru</button>` : ''}`,
    })}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Sample aktif', value: String(active), meta: `${db.samples.length} total sample`, tone: 'accent', iconName: 'spark' })}
      ${statCard({ label: 'Konversi', value: `${rate}%`, meta: `${converted} berujung pembelian` })}
      ${statCard({ label: 'Deposit terbuka', value: fmt.money(openDeposit), meta: `${deposits.filter((d) => depositBalance(d) > 0).length} saldo aktif`, tone: 'warn', iconName: 'wallet' })}
      ${statCard({ label: 'Refund tercatat', value: fmt.money(deposits.reduce((a, d) => a + d.refunded, 0)), meta: 'Tidak boleh melebihi saldo' })}
    </div>

    <div class="row" style="margin-bottom:12px">
      ${[['all', 'Semua sample'], ['active', 'Aktif'], ['converted', 'Terkonversi']].map(([k, label]) => `<button class="chip" type="button" data-sample-status="${k}" aria-pressed="${filter.status === k}">${label}</button>`).join('')}
    </div>

    <section class="card">
      <div class="card-head"><div><h2>Sample pelanggan</h2><p>Roll sumber, lot, panjang, dan hasil konversi.</p></div><span class="badge no-dot">${samples.length}</span></div>
      <div class="table-wrap desktop-table">
        <table class="data">
          <thead><tr><th>Sample</th><th>Pelanggan</th><th>Produk</th><th class="num">Qty</th><th>Roll / lot</th><th>Jenis</th><th>Hasil</th><th><span class="sr-only">Aksi</span></th></tr></thead>
          <tbody>${samples.map((s) => {
            const sku = byId(db.skus, s.skuId);
            const customer = byId(db.customers, s.customerId);
            const roll = db.rolls.find((r) => r.id === s.rollId);
            return `<tr>
              <td class="mono">${esc(s.id)}<div class="xs muted">${esc(s.date)}</div></td>
              <td><a class="small" href="#/pelanggan/${s.customerId}">${esc(customer?.name ?? '—')}</a></td>
              <td><strong class="small">${esc(sku?.collectionName)} ${esc(sku?.colourName || sku?.colourCode)}</strong><div class="xs muted">${esc(sku?.code)}</div></td>
              <td class="num">${fmt.m(s.qtyMm)}</td>
              <td><a class="mono xs" href="#/stok/${s.rollId}">${esc(s.rollId)}</a><div class="xs muted">${esc(roll?.lot ?? '')}</div></td>
              <td>${badge(SAMPLE_MODE[s.mode].label, SAMPLE_MODE[s.mode].tone)}</td>
              <td>${s.linkedInvoiceId ? `<a class="xs strong" href="#/penjualan/${s.linkedInvoiceId}">${esc(s.linkedInvoiceId)}</a>` : badge('Belum beli', 'muted')}</td>
              <td class="right">${!s.linkedInvoiceId && can(role, 'sample.create') ? `<button class="btn btn-sm" type="button" data-link="${s.id}">Kaitkan</button>` : ''}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="8"><div class="empty">${icon('spark')}<strong>Belum ada sample</strong></div></td></tr>`}</tbody>
        </table>
      </div>
      <div class="mobile-cards">
        ${samples.map((s) => {
          const sku = byId(db.skus, s.skuId);
          const customer = byId(db.customers, s.customerId);
          return `<div class="roll-card">
            <div class="top"><span class="id">${esc(s.id)}</span>${badge(SAMPLE_MODE[s.mode].label, SAMPLE_MODE[s.mode].tone)}</div>
            <div class="small strong">${esc(customer?.name ?? '')}</div>
            <div class="xs muted">${esc(sku?.collectionName)} ${esc(sku?.colourName || sku?.colourCode)} · ${fmt.m(s.qtyMm)} · ${esc(s.rollId)}</div>
            <div class="row" style="margin-top:4px">${s.linkedInvoiceId ? badge(`Terkonversi ${s.linkedInvoiceId}`, 'ok') : badge('Belum beli', 'muted')} ${!s.linkedInvoiceId && can(role, 'sample.create') ? `<button class="btn btn-sm" type="button" data-link="${s.id}">Kaitkan</button>` : ''}</div>
          </div>`;
        }).join('') || `<div class="empty">${icon('spark')}<strong>Belum ada sample</strong></div>`}
      </div>
    </section>

    <div class="section-title"><h2>Buku sample</h2><span class="small muted">Kumpulan potongan roll untuk diberikan ke pelanggan/prospek</span></div>
    <section class="card" style="margin-bottom:16px">
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Buku</th><th>Pelanggan / prospek</th><th class="num">Sample</th><th>Tanggal</th><th>Status</th><th>Diberikan</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${books.map((b) => `<tr>
          <td><strong class="small">${esc(b.name)}</strong><div class="xs muted mono">${esc(b.id)}</div></td>
          <td class="small">${esc(b.customerName)}</td>
          <td class="num">${b.items.length}</td>
          <td>${esc(b.date)}</td>
          <td>${badge(SAMPLE_BOOK_STATUS[b.status]?.label ?? b.status, SAMPLE_BOOK_STATUS[b.status]?.tone ?? 'muted')}</td>
          <td class="small">${esc(b.givenTo || '—')}${b.givenDate ? `<div class="xs muted">${esc(b.givenDate)}</div>` : ''}</td>
          <td class="right"><div class="row" style="justify-content:flex-end;flex-wrap:wrap">
            <button class="btn btn-sm" data-print-book="${b.id}">${icon('printer')} Cetak</button>
            ${b.status !== 'given' && can(role, 'sample.create') ? `<button class="btn btn-sm btn-primary" data-give-book="${b.id}">Beri</button>` : ''}
          </div></td>
        </tr>`).join('') || `<tr><td colspan="7"><div class="empty">${icon('layers')}<strong>Belum ada buku sample</strong><p>Buat buku dari beberapa potongan roll.</p></div></td></tr>`}</tbody>
      </table></div>
    </section>

    <div class="section-title"><h2>Deposit pelanggan</h2><span class="small muted">Saldo = nominal − dipakai − direfund</span></div>
    <section class="card">
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Deposit</th><th>Pelanggan</th><th>Jenis</th><th class="num">Nominal</th><th class="num">Saldo</th><th>Ledger</th><th><span class="sr-only">Aksi</span></th></tr></thead>
          <tbody>${deposits.map((d) => {
            const customer = byId(db.customers, d.customerId);
            const balance = depositBalance(d);
            return `<tr>
              <td class="mono">${esc(d.id)}<div class="xs muted">${esc(d.receivedAt)}</div></td>
              <td><a class="small" href="#/pelanggan/${d.customerId}">${esc(customer?.name ?? '—')}</a></td>
              <td>${badge(d.kind === 'sample' ? 'Sample' : 'Indent', d.kind === 'sample' ? 'copper' : 'info')}</td>
              <td class="num">${fmt.money(d.amount)}</td>
              <td class="num ${balance ? 'strong' : 'muted'}">${fmt.money(balance)}</td>
              <td class="xs muted">${d.ledger.map((l) => `${l.type} ${fmt.money(l.amount)}`).join(' · ')}</td>
              <td class="right">${balance > 0 && (d.kind === 'sample' ? can(role, 'deposit.create') : role === 'manager') ? `<button class="btn btn-sm" type="button" data-refund="${d.id}">Refund</button>` : ''}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="7"><div class="empty">${icon('wallet')}<strong>Belum ada deposit</strong></div></td></tr>`}</tbody>
        </table>
      </div>
    </section>

    <div class="notice notice-info" style="margin-top:14px">${icon('alert')}<div><strong>Aturan.</strong> Sample memotong roll sumber; deposit sample hanya dapat direfund setelah ada pembelian terkait. Deposit indent memerlukan persetujuan manajer.</div></div>`;
}

/* -------------------------------------------------------------------------- */

function openNewSample(ctx) {
  const { db } = ctx;
  const customers = db.customers.filter((c) => c.stage !== 'dormant');
  const skus = db.skus.filter((s) => s.active !== false && !s.dormant && db.rolls.some((r) => r.skuId === s.id && availableMm(r) > 0));
  if (!skus.length) {
    toast('Tidak ada roll tersedia untuk sample.', { tone: 'error' });
    return;
  }
  const wh = ctx.ui.warehouseId === 'all' ? db.warehouses.find((w) => w.active !== false)?.id : ctx.ui.warehouseId;
  const rollsFor = (skuId) => sellableRolls(db, skuId, wh)
    .map((r) => `<option value="${r.id}">${esc(r.id)} · ${esc(r.lot)} · ${fmt.m(availableMm(r))}</option>`).join('');

  openModal({
    title: 'Sample baru',
    description: 'Sample dipotong dari roll tertentu; stok fisik langsung berkurang.',
    body: `
      ${field('Pelanggan', `<select class="select" name="customer">${customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`)}
      ${field('SKU / warna', `<select class="select" name="sku">${skus.map((s) => `<option value="${s.id}">${esc(s.collectionName)} ${esc(s.colourName || s.colourCode)}</option>`).join('')}</select>`)}
      ${field('Roll sumber', `<select class="select" name="roll">${rollsFor(skus[0].id)}</select>`)}
      ${field('Panjang (m)', `<input class="input" name="qty" inputmode="decimal" value="0,5" />`)}
      ${field('Jenis', `<select class="select" name="mode"><option value="free">Gratis</option><option value="paid">Berbayar</option><option value="deposit" ${settingsOf(db).sampleDepositRequired ? 'selected' : ''}>Deposit refundable</option></select>`)}
      ${field('Nominal (Rp)', `<input class="input" name="amount" inputmode="numeric" placeholder="0" />`)}
      ${field('Catatan', `<input class="input" name="notes" />`, { full: true })}
    `,
    onMount(form) {
      form.sku.addEventListener('change', () => { form.roll.innerHTML = rollsFor(form.sku.value); });
    },
    onSubmit(form, close) {
      const amount = Number(String(form.amount.value).replace(/\D/g, '')) || 0;
      if (['paid', 'deposit'].includes(form.mode.value) && !amount) throw new Error('Nominal wajib untuk sample berbayar/deposit.');
      ctx.store.update((db) => createSample(db, {
        customerId: form.customer.value,
        skuId: form.sku.value,
        rollId: form.roll.value,
        qtyMm: parseM(form.qty.value),
        mode: form.mode.value,
        amount,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast('Sample dicatat; roll sumber berkurang.', { tone: 'success' });
    },
  });
}

function openLink(ctx, sample) {
  const invoices = ctx.db.invoices.filter((i) => i.customerId === sample.customerId && i.status === 'posted' && i.date >= sample.date);
  if (!invoices.length) {
    toast('Belum ada faktur terbit setelah tanggal sample.', { tone: 'error' });
    return;
  }
  openModal({
    title: `Kaitkan ${sample.id}`,
    body: field('Faktur', `<select class="select" name="invoice">${invoices.map((i) => `<option value="${i.id}">${esc(i.id)} · ${fmt.money(i.total)} · ${esc(i.date)}</option>`).join('')}</select>`),
    onSubmit(form, close) {
      ctx.store.update((db) => linkSampleToInvoice(db, { sampleId: sample.id, invoiceId: form.invoice.value, user: ctx.user }));
      close();
      toast('Sample dikaitkan ke pembelian.', { tone: 'success' });
    },
  });
}

function openRefund(ctx, deposit) {
  const balance = depositBalance(deposit);
  openModal({
    title: `Refund ${deposit.id}`,
    description: `Saldo ${fmt.money(balance)} · ${deposit.kind}`,
    submitLabel: 'Proses refund',
    body: `
      ${field('Nominal (Rp)', `<input class="input" name="amount" inputmode="numeric" value="${balance}" />`)}
      ${field('Alasan', `<input class="input" name="reason" placeholder="Wajib diisi" />`)}
      ${deposit.kind === 'sample' ? `<div class="notice notice-warn" style="margin-top:10px">${icon('alert')}<div>Refund sample memerlukan pembelian yang sudah dikaitkan.</div></div>` : ''}
    `,
    onSubmit(form, close) {
      ctx.store.update((db) => refundDeposit(db, {
        depositId: deposit.id,
        amount: Number(String(form.amount.value).replace(/\D/g, '')),
        reason: form.reason.value,
        user: ctx.user,
      }));
      close();
      toast('Refund dicatat pada ledger deposit.', { tone: 'success' });
    },
  });
}

function openNewBook(ctx) {
  const { db } = ctx;
  const wh = ctx.ui.warehouseId === 'all' ? null : ctx.ui.warehouseId;
  const rollList = db.rolls
    .filter((r) => r.status === 'available' && !r.transit && availableMm(r) > 0 && (!wh || r.warehouseId === wh))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!rollList.length) {
    toast('Tidak ada roll tersedia untuk sample book.', { tone: 'error' });
    return;
  }
  const rollOptions = rollList.map((r) => {
    const sku = byId(db.skus, r.skuId);
    return `<option value="${r.id}">${esc(r.id)} · ${esc(sku?.collectionName)} ${esc(sku?.colourName || sku?.colourCode)} · ${esc(r.lot)} · ${fmt.m(availableMm(r))}</option>`;
  }).join('');
  const row = () => `<div class="alloc-row" data-book-line style="grid-template-columns:1.8fr 110px 34px">
    <select class="select book-roll">${rollOptions}</select>
    <input class="input book-qty" inputmode="decimal" value="0,3" />
    <button class="icon-btn" type="button" data-remove aria-label="Hapus">${icon('x')}</button>
  </div>`;
  const customers = db.customers.filter((c) => c.stage !== 'dormant');
  openModal({
    title: 'Buku sample baru',
    description: 'Setiap potongan diambil dari roll dan menjadi sample fisik. Stok langsung berkurang.',
    wide: true,
    submitLabel: 'Buat buku sample',
    body: `
      ${field('Nama buku', `<input class="input" name="name" placeholder="Sample book Hotel Arunika" required />`, { full: true })}
      ${field('Pelanggan / prospek', `<select class="select" name="customer">${customers.map((c) => `<option value="${c.id}">${esc(c.name)}${c.company ? ` — ${esc(c.company)}` : ''}</option>`).join('')}</select>`)}
      ${field('Tanggal', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
      <div class="section-title" style="margin:16px 0 6px"><h3>Potongan sample</h3></div>
      <div id="book-rows">${row()}</div>
      <button class="btn btn-sm" type="button" data-add>${icon('plus')} Tambah potongan</button>
      ${field('Catatan', `<input class="input" name="notes" placeholder="Tujuan, warna yang dicari, instruksi" />`, { full: true })}
      ${settingsOf(db).sampleDepositRequired ? `<div class="notice notice-warn">${icon('alert')}<div>Sample gratis dinonaktifkan. Buku sample memakai mode gratis; ubah preferensi atau gunakan sample individual.</div></div>` : ''}
    `,
    onMount(form) {
      const rows = form.querySelector('#book-rows');
      const bind = (r) => {
        r.querySelector('[data-remove]').addEventListener('click', () => { if (rows.children.length > 1) r.remove(); });
      };
      bind(rows.firstElementChild);
      form.querySelector('[data-add]').addEventListener('click', () => {
        rows.insertAdjacentHTML('beforeend', row());
        bind(rows.lastElementChild);
      });
    },
    onSubmit(form, close) {
      const items = [...form.querySelectorAll('[data-book-line]')].map((r) => ({
        rollId: r.querySelector('.book-roll').value,
        qtyMm: parseM(r.querySelector('.book-qty').value),
      })).filter((i) => i.rollId && i.qtyMm > 0);
      if (!items.length) throw new Error('Tambahkan minimal satu potongan sample.');
      const book = ctx.store.update((db) => createSampleBook(db, {
        name: form.name.value,
        customerId: form.customer.value,
        date: form.date.value,
        items,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast(`Buku ${book.id} dibuat: ${book.items.length} sample dipotong dari roll.`, { tone: 'success' });
    },
  });
}

function openGiveBook(ctx, book) {
  openModal({
    title: `Beri buku ${book.name}`,
    description: 'Catat siapa yang menerima buku sample fisik.',
    submitLabel: 'Tandai diberikan',
    body: `
      ${field('Diberikan kepada', `<input class="input" name="givenTo" value="${esc(book.customerName)}" required />`)}
      ${field('Tanggal', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
      ${field('Catatan', `<input class="input" name="note" placeholder="Kontak, lokasi, hasil follow-up" />`, { full: true })}
    `,
    onSubmit(form, close) {
      ctx.store.update((db) => giveSampleBook(db, {
        id: book.id, givenTo: form.givenTo.value, date: form.date.value, note: form.note.value, user: ctx.user,
      }));
      close();
      toast('Buku sample ditandai sudah diberikan.', { tone: 'success' });
    },
  });
}

export function mount(ctx) {
  document.querySelectorAll('[data-sample-status]').forEach((btn) => btn.addEventListener('click', () => {
    filter.status = btn.dataset.sampleStatus;
    ctx.store.emit();
  }));
  document.querySelector('[data-act="new-sample"]')?.addEventListener('click', () => openNewSample(ctx));
  document.querySelector('[data-act="new-book"]')?.addEventListener('click', () => openNewBook(ctx));
  document.querySelectorAll('[data-give-book]').forEach((btn) => btn.addEventListener('click', () => {
    const book = (ctx.db.sampleBooks ?? []).find((b) => b.id === btn.dataset.giveBook);
    if (book) openGiveBook(ctx, book);
  }));
  document.querySelectorAll('[data-print-book]').forEach((btn) => btn.addEventListener('click', () => {
    const book = (ctx.db.sampleBooks ?? []).find((b) => b.id === btn.dataset.printBook);
    if (book) printDocument(`Buku sample ${book.id}`, printSampleBookHtml(ctx.db, book));
  }));
  document.querySelectorAll('[data-link]').forEach((btn) => btn.addEventListener('click', () => {
    const sample = ctx.db.samples.find((s) => s.id === btn.dataset.link);
    if (sample) openLink(ctx, sample);
  }));
  document.querySelectorAll('[data-refund]').forEach((btn) => btn.addEventListener('click', () => {
    const dep = ctx.db.deposits.find((d) => d.id === btn.dataset.refund);
    if (dep) openRefund(ctx, dep);
  }));
}
