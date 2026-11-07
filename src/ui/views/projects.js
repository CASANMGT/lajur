/** Proyek: kebutuhan material, reservasi, faktur/keluar stok, serah terima. */

import {
  esc, icon, fmt, badge, toast, openModal, field, confirmAction, printDocument,
} from '../dom.js';
import { byId, formatDateLong, parseM, todayJakarta } from '../../domain/core.js';
import {
  PROJECT_STATUS, autoAllocateProject, cancelProject, createProject, handoverProject, issueProject,
  projectMaterialCost, projectProgress, projectShortage, requireProject, reserveProject,
} from '../../domain/projects.js';
import { availableMm } from '../../domain/inventory.js';
import { pageHead, statCard, warehouseOf, can, warehouseOptions } from './common.js';
import { printInstructionsHtml } from './print.js';

export function render(ctx) {
  if (ctx.route.id) return renderDetail(ctx);

  const { db, role } = ctx;
  const rows = db.projects.map((p) => ({
    p,
    customer: byId(db.customers, p.customerId),
    short: projectShortage(db, p),
    cost: projectMaterialCost(db, p),
    overdue: p.targetDate < todayJakarta() && !['handover', 'cancelled'].includes(p.status),
  })).sort((a, b) => (a.p.targetDate < b.p.targetDate ? -1 : 1));

  const active = rows.filter((r) => !['handover', 'cancelled'].includes(r.p.status));
  const shortageCount = active.filter((r) => r.short.length).length;
  const overdueCount = rows.filter((r) => r.overdue).length;

  return `
    ${pageHead({
      eyebrow: 'Proyek',
      title: 'Material & serah terima',
      sub: 'Draf â†’ reservasi â†’ faktur/keluar stok â†’ serah terima. Faktur adalah satu-satunya peristiwa pengurangan stok.',
      actions: `${can(role, 'project.create') ? `<button class="btn btn-primary" type="button" data-act="new-project">${icon('plus')} Proyek baru</button>` : ''}`,
    })}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Proyek aktif', value: String(active.length), meta: 'Belum serah terima', tone: 'accent', iconName: 'layers' })}
      ${statCard({ label: 'Kekurangan material', value: String(shortageCount), meta: 'Perlu alokasi / pembelian', tone: 'warn' })}
      ${statCard({ label: 'Lewat target', value: String(overdueCount), meta: 'Perlu keputusan', tone: 'warn' })}
      ${statCard({ label: 'Nilai material aktif', value: fmt.money(active.reduce((a, r) => a + r.cost, 0)), meta: 'Harga pokok alokasi' })}
    </div>

    <section class="card">
      <div class="table-wrap desktop-table">
        <table class="data">
          <thead><tr><th>Proyek</th><th>Pelanggan</th><th class="hide-sm">Target</th><th>Status</th><th>Material</th><th class="num">HPP</th></tr></thead>
          <tbody>${rows.map(({ p, customer, short, cost, overdue }) => `<tr data-href="#/proyek/${p.id}" tabindex="0" role="link">
            <td><strong>${esc(p.name)}</strong><div class="xs muted mono">${esc(p.id)} Â· ${esc(p.location)}</div></td>
            <td>${esc(customer?.name ?? 'â€”')}</td>
            <td class="hide-sm ${overdue ? 'strong' : ''}">${esc(p.targetDate)}${overdue ? ` <span class="badge badge-danger no-dot">lewat</span>` : ''}</td>
            <td>${badge(PROJECT_STATUS[p.status].label, PROJECT_STATUS[p.status].tone)}</td>
            <td>${short.length ? badge(`${short.length} kurang`, 'warn') : badge('Siap', 'ok')}</td>
            <td class="num">${fmt.money(cost)}</td>
          </tr>`).join('') || `<tr><td colspan="6"><div class="empty">${icon('layers')}<strong>Belum ada proyek</strong></div></td></tr>`}</tbody>
        </table>
      </div>
      <div class="mobile-cards">
        ${rows.map(({ p, customer, short, cost, overdue }) => `<a class="roll-card" href="#/proyek/${p.id}" style="color:inherit;text-decoration:none">
          <div class="top"><span class="id">${esc(p.id)}</span>${badge(PROJECT_STATUS[p.status].label, PROJECT_STATUS[p.status].tone)}</div>
          <div class="small strong">${esc(p.name)}</div>
          <div class="xs muted">${esc(customer?.name ?? '')} Â· target ${esc(p.targetDate)}${overdue ? ' Â· lewat' : ''}</div>
          <div class="grid3">
            <div class="kv"><span>Material</span><strong>${short.length ? `${short.length} kurang` : 'Siap'}</strong></div>
            <div class="kv"><span>HPP</span><strong>${fmt.money(cost)}</strong></div>
            <div class="kv"><span>Kebutuhan</span><strong>${p.requirements.length}</strong></div>
          </div>
        </a>`).join('')}
      </div>
    </section>`;
}

function renderDetail(ctx) {
  const { db, role, route } = ctx;
  const p = requireProject(db, route.id);
  const customer = byId(db.customers, p.customerId);
  const short = projectShortage(db, p);
  const progress = projectProgress(p);
  const cost = projectMaterialCost(db, p);
  const invoice = p.invoiceId ? db.invoices.find((i) => i.id === p.invoiceId) : null;

  const actions = [];
  if (p.status === 'draft' && can(role, 'project.reserve')) actions.push(`<button class="btn" data-act="allocate">${icon('search')} Alokasikan otomatis</button>`);
  if (p.status === 'draft' && !short.length && can(role, 'project.reserve')) actions.push(`<button class="btn btn-primary" data-act="reserve">${icon('layers')} Reservasi material</button>`);
  if (p.status === 'reserved' && can(role, 'project.issue')) actions.push(`<button class="btn btn-primary" data-act="issue">${icon('receipt')} Fakturkan & keluarkan stok</button>`);
  if (p.status === 'issued' && can(role, 'project.handover')) actions.push(`<button class="btn btn-primary" data-act="handover">${icon('check')} Serah terima</button>`);
  if (['draft', 'reserved'].includes(p.status)) actions.push(`<button class="btn btn-ghost" data-act="cancel">Batalkan</button>`);
  actions.push(`<button class="btn" data-act="print">${icon('printer')} Instruksi</button>`);

  return `
    <div class="page-head">
      <div>
        <a class="small strong" href="#/proyek">â† Semua proyek</a>
        <div class="row" style="margin-top:6px">
          <h1>${esc(p.name)}</h1>
          ${badge(PROJECT_STATUS[p.status].label, PROJECT_STATUS[p.status].tone)}
        </div>
        <p class="sub">${esc(customer?.name ?? '')} Â· ${esc(p.location || 'Tanpa lokasi')} Â· target ${esc(formatDateLong(p.targetDate))}</p>
      </div>
      <div class="page-actions">${actions.join('')}</div>
    </div>

    <div class="flow" style="margin-bottom:16px">
      ${progress.map((s) => `<div class="flow-step ${s.state === 'done' ? 'done' : s.state === 'current' ? 'current' : ''}">
        <strong>${esc(s.label)}</strong>${s.state === 'done' ? 'Selesai' : s.state === 'current' ? 'Sekarang' : 'Menunggu'}
      </div>`).join('')}
    </div>

    ${short.length && p.status !== 'handover' ? `<div class="notice notice-warn" style="margin-bottom:14px">${icon('alert')}<div><strong>${short.length} kebutuhan belum lengkap.</strong> Lengkapi alokasi sebelum reservasi atau faktur.</div></div>` : ''}
    ${p.status === 'issued' ? `<div class="notice notice-info" style="margin-bottom:14px">${icon('check')}<div><strong>Stok sudah keluar lewat faktur ${esc(p.invoiceId)}.</strong> Serah terima tidak mengurangi stok lagi.</div></div>` : ''}

    <div class="grid grid-main">
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>Kebutuhan & alokasi</h2><p>Roll tertentu, lot tertentu â€” bukan saldo rata-rata.</p></div><span class="badge no-dot">${p.requirements.length} baris</span></div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Barang</th><th class="num">Butuh</th><th class="num">Dialokasikan</th><th>Roll sumber</th><th>Status</th></tr></thead>
              <tbody>${p.requirements.map((req) => {
                const isFabric = req.kind === 'fabric';
                const sku = isFabric ? byId(db.skus, req.skuId) : null;
                const part = isFabric ? null : byId(db.parts, req.partId);
                const allocated = isFabric ? req.allocations.reduce((a, x) => a + x.qtyMm, 0) : req.qtyPcs;
                const need = isFabric ? req.qtyMm : req.qtyPcs;
                const ok = isFabric ? allocated >= need : true;
                return `<tr>
                  <td><strong>${esc(isFabric ? `${sku?.collectionName} ${sku?.colourName || sku?.colourCode}` : part?.name)}</strong><div class="xs muted">${esc(isFabric ? sku?.code : part?.sku)}</div></td>
                  <td class="num">${isFabric ? fmt.m(need) : `${fmt.pcs(need)} pcs`}</td>
                  <td class="num">${isFabric ? fmt.m(allocated) : `${fmt.pcs(allocated)} pcs`}</td>
                  <td>${isFabric ? (req.allocations.map((a) => `<a class="mono xs" href="#/stok/${a.rollId}">${esc(a.rollId)}</a> <span class="xs">${fmt.m(a.qtyMm)}</span>`).join('<br>') || '<span class="muted">â€”</span>') : `<span class="xs muted">${esc(warehouseOf(db, req.warehouseId)?.code ?? 'â€”')}</span>`}</td>
                  <td>${ok ? badge('Siap', 'ok') : badge(`Kurang ${isFabric ? fmt.m(need - allocated) : `${need - allocated} pcs`}`, 'warn')}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        </section>

        <section class="card card-pad">
          <div class="row-between"><h2>Instruksi potong & packing</h2><span class="badge no-dot">Tercetak</span></div>
          <p class="small" style="white-space:pre-wrap;margin-top:10px">${esc(p.instructions || 'Belum ada instruksi.')}</p>
          <hr class="divider" />
          <div class="xs muted">Catatan proyek</div>
          <p class="small" style="margin-top:4px">${esc(p.notes || 'â€”')}</p>
        </section>

        <section class="card">
          <div class="card-head"><div><h2>Dokumen terkait</h2><p>Faktur adalah bukti stok keluar.</p></div></div>
          <div class="card-pad">
            ${invoice ? `<div class="row-between">
              <div><a class="mono strong" href="#/penjualan/${invoice.id}">${esc(invoice.id)}</a><div class="xs muted">${esc(invoice.status)} Â· ${fmt.money(invoice.total)}</div></div>
              ${badge(invoice.status === 'posted' ? 'Terbit' : invoice.status, invoice.status === 'posted' ? 'ok' : 'muted')}
            </div>` : '<p class="small muted">Belum ada faktur. Stok belum keluar.</p>'}
            ${p.history?.length ? `<hr class="divider" /><ul class="timeline">${p.history.slice(-4).reverse().map((h) => `<li><div class="t-head"><strong>${esc(h.action)}</strong><time>${esc(new Date(h.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</time></div><div class="t-body">${esc(h.by ?? '')}${h.note ? ` Â· ${esc(h.note)}` : ''}</div></li>`).join('')}</ul>` : ''}
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="card card-pad">
          <h2>Ringkasan</h2>
          <div class="stack-sm" style="margin-top:10px">
            <div class="row-between"><span class="small muted">Pelanggan</span><a class="small" href="#/pelanggan/${p.customerId}">${esc(customer?.name)}</a></div>
            <div class="row-between"><span class="small muted">Target</span><span class="small">${esc(p.targetDate)}</span></div>
            <div class="row-between"><span class="small muted">HPP material</span><span class="small num">${fmt.money(cost)}</span></div>
            <div class="row-between"><span class="small muted">Kekurangan</span><span class="small">${short.length ? `${short.length} baris` : 'Tidak ada'}</span></div>
          </div>
          <div class="notice notice-info" style="margin-top:12px">${icon('alert')}<div>Pemenuhan sebagian di luar cakupan demo: proyek difakturkan sebagai satu dokumen.</div></div>
        </section>

        <section class="card card-pad">
          <div class="row-between"><h2>Lampiran & foto</h2><label class="btn btn-sm" style="cursor:pointer">${icon('upload')} Tambah<input type="file" accept="image/*,.pdf" data-attach hidden /></label></div>
          <p class="xs muted" style="margin-top:6px">Demo menyimpan nama berkas saja; isi berkas tidak diunggah.</p>
          <div class="stack-sm" style="margin-top:10px">
            ${(p.attachments ?? []).length ? p.attachments.map((a) => `<div class="row-between"><span class="small">${esc(a.name)}</span><span class="xs muted">${esc(a.type || '')}</span></div>`).join('') : '<p class="small muted">Belum ada lampiran.</p>'}
          </div>
        </section>

        <section class="card card-pad">
          <h2>Ketersediaan gudang lain</h2>
          <div class="stack-sm" style="margin-top:8px">
            ${p.requirements.filter((r) => r.kind === 'fabric').flatMap((req) => {
              const sku = byId(db.skus, req.skuId);
              return db.warehouses.map((wh) => {
                const qty = db.rolls.filter((r) => r.skuId === req.skuId && r.warehouseId === wh.id && !r.transit && r.status === 'available').reduce((a, r) => a + availableMm(r), 0);
                return qty > 0 ? `<div class="row-between"><span class="small">${esc(sku?.code)} Â· ${esc(wh.code)}</span><span class="small num">${fmt.m(qty)}</span></div>` : '';
              });
            }).join('') || '<p class="small muted">Tidak ada alternatif.</p>'}
          </div>
        </section>
      </div>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

export function openCreate(ctx) {
  const { db } = ctx;
  const customers = db.customers.filter((c) => c.stage !== 'dormant');
  const skuOptions = db.skus.filter((s) => s.active).map((s) => `<option value="${s.id}">${esc(s.collectionName)} ${esc(s.colourName || s.colourCode)} â€” ${esc(s.code)}</option>`).join('');
  const partOptions = db.parts.map((p) => `<option value="${p.id}">${esc(p.sku)} Â· ${esc(p.name)}</option>`).join('');
  const defaultWh = ctx.ui.warehouseId === 'all' ? 'wh-jkt' : ctx.ui.warehouseId;

  openModal({
    title: 'Proyek baru',
    description: 'Setelah dibuat, alokasikan roll dan reservasi material sebelum difakturkan.',
    wide: true,
    submitLabel: 'Simpan proyek',
    body: `
      <div class="form-grid">
        ${field('Pelanggan', `<select class="select" name="customer">${customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`)}
        ${field('Nama proyek', `<input class="input" name="name" placeholder="Contoh: Hotel Arunika â€” 24 kamar" required />`)}
        ${field('Lokasi', `<input class="input" name="location" placeholder="Kota / gedung" />`)}
        ${field('Target selesai', `<input class="input" type="date" name="targetDate" value="${new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)}" />`)}
        ${field('Instruksi potong / packing', `<textarea class="textarea" name="instructions" placeholder="Contoh: potong kelipatan 2,4 m; beri label per kamar."></textarea>`, { full: true })}
        ${field('Catatan', `<input class="input" name="notes" placeholder="Referensi desain, PIC, dsb." />`, { full: true })}
        ${field('Gudang alokasi', `<select class="select" name="warehouse">${warehouseOptions(db, defaultWh)}</select>`)}
      </div>
      <div class="section-title" style="margin:18px 0 6px"><h3>Kebutuhan material</h3></div>
      <div id="req-rows">
        <div class="alloc-row" data-req style="grid-template-columns:1fr 100px .8fr 34px">
          <select class="select req-kind" aria-label="Jenis"><option value="fabric">Kain</option><option value="part">Spare part</option></select>
          <input class="input req-qty" inputmode="decimal" placeholder="meter" aria-label="Jumlah" />
          <select class="select req-product" aria-label="Produk">${skuOptions}</select>
          <button class="icon-btn" type="button" data-remove aria-label="Hapus">${icon('x')}</button>
        </div>
      </div>
      <button class="btn btn-sm" type="button" data-add-req>${icon('plus')} Tambah kebutuhan</button>
      <div class="notice notice-info" style="margin-top:14px">${icon('alert')}<div>Kebutuhan kain wajib dialokasikan ke roll tertentu; spare part memakai pcs.</div></div>
    `,
    onMount(form) {
      const rows = form.querySelector('#req-rows');
      const bind = (row) => {
        row.querySelector('.req-kind').addEventListener('change', (e) => {
          const fabric = e.target.value === 'fabric';
          row.querySelector('.req-product').innerHTML = fabric ? skuOptions : partOptions;
          row.querySelector('.req-qty').placeholder = fabric ? 'meter' : 'pcs';
        });
        row.querySelector('[data-remove]').addEventListener('click', () => { if (rows.children.length > 1) row.remove(); });
      };
      form.querySelectorAll('[data-req]').forEach(bind);
      form.querySelector('[data-add-req]').addEventListener('click', () => {
        rows.insertAdjacentHTML('beforeend', `<div class="alloc-row" data-req style="grid-template-columns:1fr 100px .8fr 34px">
          <select class="select req-kind" aria-label="Jenis"><option value="fabric">Kain</option><option value="part">Spare part</option></select>
          <input class="input req-qty" inputmode="decimal" placeholder="meter" aria-label="Jumlah" />
          <select class="select req-product" aria-label="Produk">${skuOptions}</select>
          <button class="icon-btn" type="button" data-remove aria-label="Hapus">${icon('x')}</button>
        </div>`);
        bind(rows.lastElementChild);
      });
    },
    onSubmit(form, close) {
      const requirements = [...form.querySelectorAll('[data-req]')].map((row) => {
        const kind = row.querySelector('.req-kind').value;
        const raw = row.querySelector('.req-qty').value;
        return kind === 'fabric'
          ? { kind, skuId: row.querySelector('.req-product').value, qtyMm: parseM(raw) }
          : { kind, partId: row.querySelector('.req-product').value, qtyPcs: Number(raw), warehouseId: form.warehouse.value };
      }).filter((r) => (r.qtyMm ?? r.qtyPcs) > 0);
      if (!requirements.length) throw new Error('Tambahkan minimal satu kebutuhan material.');
      const project = ctx.store.update((db) => createProject(db, {
        customerId: form.customer.value,
        name: form.name.value,
        location: form.location.value,
        targetDate: form.targetDate.value,
        notes: form.notes.value,
        instructions: form.instructions.value,
        requirements,
        user: ctx.user,
      }));
      close();
      window.location.hash = `#/proyek/${project.id}`;
      toast('Proyek dibuat. Lanjutkan dengan alokasi roll.', { tone: 'success' });
    },
  });
}

function openAllocate(ctx, project) {
  const defaultWh = ctx.ui.warehouseId === 'all' ? 'wh-jkt' : ctx.ui.warehouseId;
  openModal({
    title: 'Alokasikan material',
    description: 'FIFO dari gudang terpilih. Alokasi belum mereservasi stok.',
    submitLabel: 'Alokasikan',
    body: field('Gudang sumber', `<select class="select" name="warehouse">${warehouseOptions(ctx.db, defaultWh)}</select>`),
    onSubmit(form, close) {
      ctx.store.update((db) => autoAllocateProject(db, { id: project.id, warehouseId: form.warehouse.value, user: ctx.user }));
      close();
      toast('Alokasi dihitung ulang dari roll yang tersedia.', { tone: 'success' });
    },
  });
}

export function mount(ctx) {
  if (ctx.route.id) {
    const p = requireProject(ctx.db, ctx.route.id);
    const on = (name, fn) => document.querySelector(`[data-act="${name}"]`)?.addEventListener('click', fn);
    on('allocate', () => openAllocate(ctx, p));
    on('reserve', () => {
      try {
        ctx.store.update((db) => reserveProject(db, { id: p.id, user: ctx.user }));
        toast('Materi direservasi. Stok tersedia berkurang untuk dokumen lain.', { tone: 'success' });
      } catch (err) { toast(err.message, { tone: 'error' }); }
    });
    on('issue', async () => {
      const ok = await confirmAction({
        title: 'Fakturkan & keluarkan stok?',
        message: 'Faktur akan diterbitkan dan stok keluar satu kali. Setelah ini stok tidak bisa dikembalikan lewat serah terima.',
        confirmLabel: 'Terbitkan faktur',
      });
      if (!ok) return;
      try {
        const result = ctx.store.update((db) => issueProject(db, { id: p.id, user: ctx.user }));
        toast(`Faktur ${result.invoice.id} terbit. Stok keluar satu kali.`, { tone: 'success' });
      } catch (err) { toast(err.message, { tone: 'error' }); }
    });
    on('handover', async () => {
      const ok = await confirmAction({ title: 'Catat serah terima?', message: 'Serah terima hanya mengubah status proyek. Stok tidak dikurangi lagi.', confirmLabel: 'Serah terima' });
      if (!ok) return;
      ctx.store.update((db) => handoverProject(db, { id: p.id, user: ctx.user }));
      toast('Serah terima dicatat.', { tone: 'success' });
    });
    on('cancel', async () => {
      const ok = await confirmAction({ title: 'Batalkan proyek?', message: 'Reservasi akan dilepas. Tindakan ini tidak mengubah stok fisik.', confirmLabel: 'Batalkan proyek', tone: 'danger' });
      if (!ok) return;
      ctx.store.update((db) => cancelProject(db, { id: p.id, user: ctx.user, note: 'Dibatalkan dari demo' }));
      toast('Proyek dibatalkan.', { tone: 'success' });
    });
    on('print', () => printDocument(`Instruksi ${p.name}`, printInstructionsHtml(ctx.db, p)));

    document.querySelector('[data-attach]')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      ctx.store.update((db) => {
        const project = db.projects.find((x) => x.id === p.id);
        project.attachments = project.attachments ?? [];
        project.attachments.push({ name: file.name, type: file.type, size: file.size, at: new Date().toISOString() });
      });
      toast('Metadata lampiran disimpan. Berkas tidak diunggah di demo.', { tone: 'success' });
    });
    document.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => {
      window.location.hash = tr.dataset.href.replace('#', '');
    }));
    return;
  }

  document.querySelector('[data-act="new-project"]')?.addEventListener('click', () => openCreate(ctx));
  document.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => {
    window.location.hash = tr.dataset.href.replace('#', '');
  }));
}
