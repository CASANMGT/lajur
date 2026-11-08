/** Pesanan penjualan: lihat isi, edit draf, cetak dokumen, lalu fakturkan sekali. */

import {
  esc, icon, fmt, badge, toast, confirmAction, openModal, field, printDocument,
} from '../dom.js';
import { byId, parseM } from '../../domain/core.js';
import { availableMm } from '../../domain/inventory.js';
import {
  ORDER_STATUS, cancelOrder, confirmOrder, convertOrderToInvoice, updateSalesOrder,
} from '../../domain/orders.js';
import { settingsOf } from '../../domain/settings.js';
import { pageHead, statCard, can, warehouseOptions } from './common.js';
import { openInvoice } from './sales.js';
import { printSalesOrderHtml } from './print.js';

let filter = 'all';

const creatorOf = (db, order) => byId(db.users, order.userId)?.name ?? order.createdBy ?? 'Sistem';

export function render(ctx) {
  if (ctx.route.id) return renderDetail(ctx);
  const { db, role } = ctx;
  const enabled = settingsOf(db).salesOrderEnabled !== false;
  const orders = db.orders
    .filter((o) => filter === 'all' || o.status === filter)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const stats = {
    draft: db.orders.filter((o) => o.status === 'draft').length,
    confirmed: db.orders.filter((o) => o.status === 'confirmed').length,
    converted: db.orders.filter((o) => o.status === 'converted').length,
    value: db.orders.filter((o) => ['draft', 'confirmed'].includes(o.status)).reduce((a, o) => a + o.total, 0),
  };

  return `
    ${pageHead({
      eyebrow: 'Penjualan',
      title: 'Pesanan penjualan',
      sub: 'Pesanan mencadangkan stok tetapi tidak memotongnya. Konversi ke faktur adalah satu-satunya peristiwa pengeluaran stok.',
      actions: `${enabled && can(role, 'invoice.create') ? `<button class="btn btn-primary" type="button" data-act="new-order">${icon('plus')} Buat pesanan</button>` : ''}`,
    })}
    ${!enabled ? `<div class="notice notice-warn" style="margin-bottom:14px">${icon('alert')}<div>Pesanan penjualan dinonaktifkan di <a href="#/pengaturan">Pengaturan → Preferensi</a>.</div></div>` : ''}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Draf', value: String(stats.draft), meta: 'Masih dapat diubah' })}
      ${statCard({ label: 'Dikonfirmasi', value: String(stats.confirmed), meta: 'Siap difakturkan', tone: 'accent' })}
      ${statCard({ label: 'Menjadi faktur', value: String(stats.converted), meta: 'Stok sudah keluar' })}
      ${statCard({ label: 'Nilai pesanan aktif', value: fmt.money(stats.value), meta: 'Draf + dikonfirmasi', tone: 'warn' })}
    </div>
    <div class="row" style="margin-bottom:12px">
      ${[['all', 'Semua'], ['draft', 'Draf'], ['confirmed', 'Dikonfirmasi'], ['converted', 'Menjadi faktur'], ['cancelled', 'Dibatalkan']].map(([k, label]) => `<button class="chip" type="button" data-order-status="${k}" aria-pressed="${filter === k}">${label}</button>`).join('')}
    </div>

    <section class="card">
      <div class="table-wrap desktop-table"><table class="data">
        <thead><tr><th>Pesanan</th><th>Pelanggan</th><th>Dibuat oleh</th><th>Tanggal</th><th class="num">Total</th><th>Status</th><th>Faktur</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${orders.map((o) => `<tr>
          <td class="mono strong"><a href="#/pesanan/${o.id}">${esc(o.id)}</a><div class="xs muted">${o.lines.length} baris</div></td>
          <td><a class="small" href="#/pelanggan/${o.customerId}">${esc(o.customerName)}</a></td>
          <td><span class="small">${esc(creatorOf(db, o))}</span><div class="xs muted">${esc(o.userId ?? '')}</div></td>
          <td>${esc(o.date)}</td>
          <td class="num">${fmt.money(o.total)}</td>
          <td>${badge(ORDER_STATUS[o.status].label, ORDER_STATUS[o.status].tone)}</td>
          <td>${o.invoiceId ? `<a class="mono xs" href="#/penjualan/${o.invoiceId}">${esc(o.invoiceId)}</a>` : '—'}</td>
          <td class="right"><div class="row" style="justify-content:flex-end">
            <a class="btn btn-sm btn-ghost" href="#/pesanan/${o.id}">Lihat</a>
            ${o.status === 'draft' ? `<button class="btn btn-sm" data-edit="${o.id}">Edit</button>` : ''}
            ${o.status === 'draft' ? `<button class="btn btn-sm" data-confirm="${o.id}">Konfirmasi</button>` : ''}
            ${['draft', 'confirmed'].includes(o.status) ? `<button class="btn btn-sm btn-primary" data-convert="${o.id}">Fakturkan</button>` : ''}
            ${['draft', 'confirmed'].includes(o.status) ? `<button class="btn btn-sm btn-ghost" data-cancel="${o.id}">Batal</button>` : ''}
          </div></td>
        </tr>`).join('') || `<tr><td colspan="8"><div class="empty">${icon('receipt')}<strong>Belum ada pesanan</strong><p>Buat pesanan dari pelanggan, lalu fakturkan saat siap.</p></div></td></tr>`}</tbody>
      </table></div>
      <div class="mobile-cards">
        ${orders.map((o) => `<div class="roll-card">
          <div class="top"><a class="id mono" href="#/pesanan/${o.id}">${esc(o.id)}</a>${badge(ORDER_STATUS[o.status].label, ORDER_STATUS[o.status].tone)}</div>
          <div class="small strong">${esc(o.customerName)}</div>
          <div class="xs muted">${esc(o.date)} · ${o.lines.length} baris · ${fmt.money(o.total)}</div>
          <div class="xs muted">Dibuat oleh ${esc(creatorOf(db, o))}</div>
          <div class="row" style="margin-top:4px;flex-wrap:wrap">
            <a class="btn btn-sm" href="#/pesanan/${o.id}">Lihat</a>
            ${o.status === 'draft' ? `<button class="btn btn-sm" data-edit="${o.id}">Edit</button>` : ''}
            ${o.status === 'draft' ? `<button class="btn btn-sm" data-confirm="${o.id}">Konfirmasi</button>` : ''}
            ${['draft', 'confirmed'].includes(o.status) ? `<button class="btn btn-sm btn-primary" data-convert="${o.id}">Fakturkan</button>` : ''}
          </div>
        </div>`).join('') || `<div class="empty">${icon('receipt')}<strong>Belum ada pesanan</strong><p>Buat pesanan dari pelanggan, lalu fakturkan saat siap.</p></div>`}
      </div>
    </section>`;
}

function renderDetail(ctx) {
  const { db, role } = ctx;
  const order = db.orders.find((o) => o.id === ctx.route.id);
  if (!order) {
    return `${pageHead({ title: 'Pesanan tidak ditemukan' })}<div class="notice notice-danger">${icon('alert')}<div>Pesanan ${esc(ctx.route.id)} tidak ada pada dataset ini.</div></div>`;
  }
  const customer = byId(db.customers, order.customerId);
  const project = order.projectId ? db.projects.find((p) => p.id === order.projectId) : null;
  const creator = byId(db.users, order.userId);
  const canEdit = order.status === 'draft' && can(role, 'invoice.create');
  const actionable = ['draft', 'confirmed'].includes(order.status);

  const actions = [
    `<button class="btn" type="button" data-act="print">${icon('printer')} Cetak pesanan</button>`,
    canEdit ? `<button class="btn btn-primary" type="button" data-act="edit">${icon('settings')} Edit pesanan</button>` : '',
    order.status === 'draft' && can(role, 'invoice.create') ? `<button class="btn" type="button" data-act="confirm">Konfirmasi</button>` : '',
    actionable && can(role, 'invoice.create') ? `<button class="btn btn-primary" type="button" data-act="convert">Fakturkan</button>` : '',
    actionable && can(role, 'invoice.create') ? `<button class="btn btn-ghost" type="button" data-act="cancel">Batalkan</button>` : '',
    order.invoiceId ? `<a class="btn" href="#/penjualan/${order.invoiceId}">${esc(order.invoiceId)}</a>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="page-head">
      <div>
        <a class="small strong" href="#/pesanan">← Semua pesanan</a>
        <div class="row" style="margin-top:6px"><h1 class="mono" style="font-family:var(--font-mono);font-size:1.5rem">${esc(order.id)}</h1>${badge(ORDER_STATUS[order.status].label, ORDER_STATUS[order.status].tone)}</div>
        <p class="sub">${esc(customer?.name ?? order.customerName)} · ${esc(order.date)} · dibuat oleh <strong>${esc(creator?.name ?? creatorOf(db, order))}</strong>${project ? ` · ${esc(project.name)}` : ''}</p>
      </div>
      <div class="page-actions">${actions}</div>
    </div>

    <div class="grid grid-main">
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>Isi pesanan</h2><p>Harga dan jumlah tersimpan pada baris. Stok dicadangkan, belum keluar.</p></div><span class="badge no-dot">${order.lines.length} baris</span></div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Barang</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Jumlah</th><th>Stok / roll</th></tr></thead>
            <tbody>${order.lines.map((l) => {
              const roll = l.rollId ? db.rolls.find((r) => r.id === l.rollId) : null;
              return `<tr>
                <td><strong class="small">${esc(l.description)}</strong><div class="xs muted">${l.kind === 'fabric' ? `Kain · ${l.mode === 'whole' ? 'roll utuh' : 'potong'}` : 'Spare part · pcs'}</div></td>
                <td class="num">${l.kind === 'fabric' ? fmt.m(l.qtyMm) : `${fmt.pcs(l.qtyPcs)} pcs`}</td>
                <td class="num">${fmt.money(l.unitPrice)}</td>
                <td class="num strong">${fmt.money(l.amount)}</td>
                <td>${roll ? `<a class="mono xs" href="#/stok/${roll.id}">${esc(roll.id)}</a><div class="xs muted">Lot ${esc(l.lot ?? roll.lot)} · ${esc(byId(db.warehouses, roll.warehouseId)?.code ?? '—')}</div>` : `<span class="xs muted">${esc(byId(db.warehouses, l.warehouseId)?.code ?? '—')}</span>`}</td>
              </tr>`;
            }).join('')}</tbody>
            <tfoot><tr><td colspan="3"><strong>Total pesanan</strong></td><td class="num strong">${fmt.money(order.total)}</td><td></td></tr></tfoot>
          </table></div>
        </section>

        <section class="card card-pad">
          <h2>Riwayat pesanan</h2>
          <ul class="timeline" style="margin-top:10px">
            ${(order.history ?? []).slice().reverse().map((h) => `<li><div class="t-head"><strong>${esc(h.action)}</strong><time>${esc(new Date(h.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</time></div><div class="t-body">${esc(h.by)}${h.note ? ` · ${esc(h.note)}` : ''}</div></li>`).join('') || '<li class="muted small">Belum ada riwayat.</li>'}
          </ul>
        </section>
      </div>

      <div class="stack">
        <section class="card card-pad">
          <h2>Ringkasan</h2>
          <div class="stack-sm" style="margin-top:10px">
            <div class="row-between"><span class="small muted">Pelanggan</span><a class="small" href="#/pelanggan/${order.customerId}">${esc(customer?.name ?? order.customerName)}</a></div>
            <div class="row-between"><span class="small muted">Proyek</span><span class="small">${project ? `<a href="#/proyek/${project.id}">${esc(project.name)}</a>` : '—'}</span></div>
            <div class="row-between"><span class="small muted">Dibuat oleh</span><span class="small">${esc(creator?.name ?? creatorOf(db, order))}<div class="xs muted">${esc(creator?.role ?? order.userId ?? '—')}</div></span></div>
            <div class="row-between"><span class="small muted">Dibuat</span><span class="small">${esc(new Date(order.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</span></div>
            ${order.updatedAt ? `<div class="row-between"><span class="small muted">Diubah</span><span class="small">${esc(new Date(order.updatedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</span></div>` : ''}
            <div class="row-between"><span class="small muted">Faktur</span><span class="small">${order.invoiceId ? `<a class="mono" href="#/penjualan/${order.invoiceId}">${esc(order.invoiceId)}</a>` : '—'}</span></div>
          </div>
          ${order.notes ? `<hr class="divider" /><p class="small muted">${esc(order.notes)}</p>` : ''}
        </section>

        <section class="card card-pad">
          <h2>Cadangan stok</h2>
          <p class="xs muted" style="margin-top:6px">Pesanan ini mencadangkan kain dan part. Cadangan dilepas jika dibatalkan, dan dikonsumsi satu kali saat faktur terbit.</p>
          <div class="stack-sm" style="margin-top:10px">
            ${order.lines.filter((l) => l.kind === 'fabric').map((l) => {
              const roll = db.rolls.find((r) => r.id === l.rollId);
              const held = (roll?.reservations ?? []).filter((r) => r.ref === order.id).reduce((a, r) => a + r.qtyMm, 0);
              return `<div class="row-between"><span class="small"><a class="mono" href="#/stok/${l.rollId}">${esc(l.rollId)}</a><div class="xs muted">${esc(l.description)}</div></span><span class="small num">${held ? fmt.m(held) : '—'}</span></div>`;
            }).join('') || '<p class="small muted">Tidak ada kain pada pesanan ini.</p>'}
          </div>
        </section>

        <section class="card card-pad">
          <h2>Dokumen</h2>
          <p class="small muted" style="margin-top:6px">Cetak “Pesanan Penjualan” untuk dikirim ke pelanggan. Dokumen ini bukan faktur pajak; stok baru keluar saat faktur diterbitkan.</p>
          <button class="btn btn-sm btn-block" type="button" data-act="print" style="margin-top:10px">${icon('printer')} Cetak pesanan penjualan</button>
        </section>
      </div>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Edit draf                                                                  */
/* -------------------------------------------------------------------------- */

function openEditOrder(ctx, order) {
  const { db } = ctx;
  const defaultWh = order.lines.find((l) => l.kind === 'part')?.warehouseId
    ?? (ctx.ui.warehouseId === 'all' ? db.warehouses.find((w) => w.active !== false)?.id : ctx.ui.warehouseId);
  const customers = db.customers.filter((c) => c.stage !== 'dormant' || c.id === order.customerId);
  const projects = db.projects.filter((p) => p.status !== 'cancelled' || p.id === order.projectId);
  const partIds = new Set(db.partStock.filter((s) => s.qty > 0).map((s) => s.partId));

  const rollOptions = (selected = '') => {
    const list = db.rolls.filter((r) => r.status === 'available' && !r.transit
      && (availableMm(r) > 0 || order.lines.some((l) => l.rollId === r.id)));
    return list.map((r) => {
      const sku = byId(db.skus, r.skuId);
      return `<option value="${r.id}" data-price="${sku?.sellPrice ?? 0}" data-current="${r.currentMm}" ${selected === r.id ? 'selected' : ''}>${esc(r.id)} · ${esc(sku?.code)} · ${esc(r.lot)} · ${fmt.m(availableMm(r))} tersedia</option>`;
    }).join('');
  };
  const partOptions = (selected = '') => db.parts
    .filter((p) => p.active !== false && (partIds.has(p.id) || order.lines.some((l) => l.partId === p.id)))
    .map((p) => `<option value="${p.id}" data-price="${p.sellPrice}" ${selected === p.id ? 'selected' : ''}>${esc(p.sku)} · ${esc(p.name)}</option>`)
    .join('');

  const fabricRow = (line = null) => `<div class="alloc-row" data-fab style="grid-template-columns:1.5fr .7fr .6fr .8fr 34px">
    <select class="select fab-roll" aria-label="Roll kain">${rollOptions(line?.rollId ?? '')}</select>
    <select class="select fab-mode" aria-label="Mode"><option value="cut" ${line?.mode !== 'whole' ? 'selected' : ''}>Potong</option><option value="whole" ${line?.mode === 'whole' ? 'selected' : ''}>Roll utuh</option></select>
    <input class="input fab-qty" inputmode="decimal" placeholder="meter" aria-label="Panjang" value="${line ? String((line.qtyMm ?? 0) / 1000).replace('.', ',') : ''}" ${line?.mode === 'whole' ? 'disabled' : ''} />
    <input class="input fab-price" inputmode="numeric" placeholder="harga/m" aria-label="Harga per meter" value="${line?.unitPrice ?? ''}" />
    <button class="icon-btn" type="button" data-remove aria-label="Hapus baris">${icon('x')}</button>
  </div>`;

  const partRow = (line = null) => `<div class="alloc-row" data-part style="grid-template-columns:1.6fr .6fr .8fr 34px">
    <select class="select part-id" aria-label="Spare part">${partOptions(line?.partId ?? '')}</select>
    <input class="input part-qty" inputmode="numeric" placeholder="pcs" aria-label="Jumlah pcs" value="${line?.qtyPcs ?? ''}" />
    <input class="input part-price" inputmode="numeric" placeholder="harga" aria-label="Harga satuan" value="${line?.unitPrice ?? ''}" />
    <button class="icon-btn" type="button" data-remove aria-label="Hapus baris">${icon('x')}</button>
  </div>`;

  openModal({
    title: `Edit ${order.id}`,
    description: 'Hanya draf yang dapat diubah. Reservasi stok dihitung ulang saat disimpan.',
    wide: true,
    submitLabel: 'Simpan perubahan',
    body: `
      <div class="form-grid">
        ${field('Pelanggan', `<select class="select" name="customer">${customers.map((c) => `<option value="${c.id}" ${c.id === order.customerId ? 'selected' : ''}>${esc(c.name)}${c.company ? ` — ${esc(c.company)}` : ''}</option>`).join('')}</select>`)}
        ${field('Gudang pengeluaran part', `<select class="select" name="warehouse">${warehouseOptions(db, defaultWh)}</select>`)}
        ${field('Proyek', `<select class="select" name="project"><option value="">— Tanpa proyek —</option>${projects.map((p) => `<option value="${p.id}" ${p.id === order.projectId ? 'selected' : ''}>${esc(p.id)} · ${esc(p.name)}</option>`).join('')}</select>`)}
        ${field('Tanggal pesanan', `<input class="input" type="date" name="date" value="${esc(order.date)}" />`)}
        ${field('Catatan', `<input class="input" name="notes" value="${esc(order.notes ?? '')}" placeholder="Referensi proyek / instruksi" />`, { full: true })}
      </div>
      <div class="section-title" style="margin:18px 0 6px"><h3>Kain</h3><span class="xs muted">Harga dan panjang dapat diubah</span></div>
      <div id="fab-rows">${order.lines.filter((l) => l.kind === 'fabric').map(fabricRow).join('')}</div>
      <button class="btn btn-sm" type="button" data-add-fab>${icon('plus')} Tambah kain</button>
      <div class="section-title" style="margin:18px 0 6px"><h3>Spare part</h3><span class="xs muted">Satuan pcs</span></div>
      <div id="part-rows">${order.lines.filter((l) => l.kind === 'part').map(partRow).join('')}</div>
      <button class="btn btn-sm" type="button" data-add-part>${icon('plus')} Tambah spare part</button>
      <div class="card card-pad" style="margin-top:16px;background:#fbf8f1">
        <div class="row-between"><span class="small muted">Total pesanan</span><strong id="order-total" class="num" style="font-size:1.1rem">${fmt.money(order.total)}</strong></div>
      </div>
      <div class="notice notice-info" style="margin-top:12px">${icon('alert')}<div>Menyimpan perubahan melepas cadangan lama dan mencadangkan ulang sesuai baris baru. Stok fisik belum keluar.</div></div>
    `,
    onMount(form) {
      const fabRows = form.querySelector('#fab-rows');
      const partRows = form.querySelector('#part-rows');

      const recalc = () => {
        let total = 0;
        form.querySelectorAll('[data-fab]').forEach((row) => {
          const opt = row.querySelector('.fab-roll').selectedOptions[0];
          const mode = row.querySelector('.fab-mode').value;
          const qty = mode === 'whole' ? Number(opt?.dataset.current ?? 0) : parseM(row.querySelector('.fab-qty').value);
          const price = Number(row.querySelector('.fab-price').value || opt?.dataset.price || 0);
          if (mode === 'whole') row.querySelector('.fab-qty').value = String(qty / 1000).replace('.', ',');
          total += Math.round((qty / 1000) * price);
        });
        form.querySelectorAll('[data-part]').forEach((row) => {
          const opt = row.querySelector('.part-id').selectedOptions[0];
          const qty = Number(row.querySelector('.part-qty').value || 0);
          const price = Number(row.querySelector('.part-price').value || opt?.dataset.price || 0);
          total += Math.round(qty * price);
        });
        const el = document.getElementById('order-total');
        if (el) el.textContent = fmt.money(total);
      };

      const bind = (row) => {
        row.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', recalc));
        row.querySelector('.fab-mode')?.addEventListener('change', () => {
          const whole = row.querySelector('.fab-mode').value === 'whole';
          row.querySelector('.fab-qty').disabled = whole;
          recalc();
        });
        row.querySelector('[data-remove]')?.addEventListener('click', () => { row.remove(); recalc(); });
      };
      form.querySelectorAll('[data-fab], [data-part]').forEach(bind);
      form.querySelector('[data-add-fab]').addEventListener('click', () => {
        fabRows.insertAdjacentHTML('beforeend', fabricRow());
        bind(fabRows.lastElementChild);
        recalc();
      });
      form.querySelector('[data-add-part]').addEventListener('click', () => {
        partRows.insertAdjacentHTML('beforeend', partRow());
        bind(partRows.lastElementChild);
        recalc();
      });
      recalc();
    },
    onSubmit(form, close) {
      const lines = [];
      form.querySelectorAll('[data-fab]').forEach((row) => {
        const rollId = row.querySelector('.fab-roll').value;
        if (!rollId) return;
        const mode = row.querySelector('.fab-mode').value;
        const qtyMm = mode === 'whole' ? 0 : parseM(row.querySelector('.fab-qty').value);
        const price = Number(row.querySelector('.fab-price').value || row.querySelector('.fab-roll').selectedOptions[0]?.dataset.price || 0);
        if (mode === 'whole' || qtyMm > 0) lines.push({ kind: 'fabric', rollId, mode, qtyMm, unitPrice: price || undefined });
      });
      form.querySelectorAll('[data-part]').forEach((row) => {
        const qtyPcs = Number(row.querySelector('.part-qty').value || 0);
        if (!Number.isInteger(qtyPcs) || qtyPcs <= 0) {
          if (row.querySelector('.part-qty').value) throw new Error('Jumlah spare part harus bilangan bulat.');
          return;
        }
        const price = Number(row.querySelector('.part-price').value || row.querySelector('.part-id').selectedOptions[0]?.dataset.price || 0);
        lines.push({
          kind: 'part', partId: row.querySelector('.part-id').value, qtyPcs,
          unitPrice: price || undefined, warehouseId: form.warehouse.value,
        });
      });
      if (!lines.length) throw new Error('Tambahkan minimal satu baris kain atau spare part.');
      ctx.store.update((db) => updateSalesOrder(db, {
        id: order.id,
        customerId: form.customer.value,
        projectId: form.project.value || null,
        date: form.date.value,
        lines,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast(`${order.id} diperbarui. Cadangan stok dihitung ulang.`, { tone: 'success' });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

export function mount(ctx) {
  document.querySelectorAll('[data-order-status]').forEach((btn) => btn.addEventListener('click', () => {
    filter = btn.dataset.orderStatus;
    ctx.store.emit();
  }));
  document.querySelector('[data-act="new-order"]')?.addEventListener('click', () => openInvoice(ctx, null, 'order'));

  if (ctx.route.id) {
    const order = ctx.db.orders.find((o) => o.id === ctx.route.id);
    if (!order) return;
    document.querySelectorAll('[data-act="print"]').forEach((btn) => btn.addEventListener('click', () => {
      printDocument(`Pesanan ${order.id}`, printSalesOrderHtml(ctx.db, order));
    }));
    document.querySelector('[data-act="edit"]')?.addEventListener('click', () => openEditOrder(ctx, order));
    document.querySelector('[data-act="confirm"]')?.addEventListener('click', () => {
      try {
        ctx.store.update((db) => confirmOrder(db, { id: order.id, user: ctx.user }));
        toast('Pesanan dikonfirmasi. Stok belum keluar.', { tone: 'success' });
      } catch (err) { toast(err.message, { tone: 'error' }); }
    });
    document.querySelector('[data-act="convert"]')?.addEventListener('click', async () => {
      const ok = await confirmAction({
        title: 'Fakturkan pesanan?',
        message: 'Faktur akan diterbitkan dan stok keluar satu kali. Cadangan pesanan dikonsumsi.',
        confirmLabel: 'Terbitkan faktur',
      });
      if (!ok) return;
      try {
        const result = ctx.store.update((db) => convertOrderToInvoice(db, { id: order.id, user: ctx.user }));
        window.location.hash = `#/penjualan/${result.invoice.id}`;
        toast(`Faktur ${result.invoice.id} terbit. Stok keluar satu kali.`, { tone: 'success' });
      } catch (err) {
        toast(err.message, { tone: 'error' });
      }
    });
    document.querySelector('[data-act="cancel"]')?.addEventListener('click', async () => {
      const ok = await confirmAction({ title: 'Batalkan pesanan?', message: 'Cadangan kain dan part akan dilepas. Stok fisik tidak berubah.', confirmLabel: 'Batalkan', tone: 'danger' });
      if (!ok) return;
      try {
        ctx.store.update((db) => cancelOrder(db, { id: order.id, user: ctx.user }));
        toast('Pesanan dibatalkan; cadangan stok dilepas.', { tone: 'success' });
      } catch (err) { toast(err.message, { tone: 'error' }); }
    });
    return;
  }

  document.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => {
    const order = ctx.db.orders.find((o) => o.id === btn.dataset.edit);
    if (order) openEditOrder(ctx, order);
  }));
  document.querySelectorAll('[data-confirm]').forEach((btn) => btn.addEventListener('click', () => {
    ctx.store.update((db) => confirmOrder(db, { id: btn.dataset.confirm, user: ctx.user }));
    toast('Pesanan dikonfirmasi. Stok belum keluar.', { tone: 'success' });
  }));
  document.querySelectorAll('[data-convert]').forEach((btn) => btn.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Fakturkan pesanan?',
      message: 'Faktur akan diterbitkan dan stok keluar satu kali. Pastikan roll masih tersedia.',
      confirmLabel: 'Terbitkan faktur',
    });
    if (!ok) return;
    try {
      const result = ctx.store.update((db) => convertOrderToInvoice(db, { id: btn.dataset.convert, user: ctx.user }));
      window.location.hash = `#/penjualan/${result.invoice.id}`;
      toast(`Faktur ${result.invoice.id} terbit. Stok keluar satu kali.`, { tone: 'success' });
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  }));
  document.querySelectorAll('[data-cancel]').forEach((btn) => btn.addEventListener('click', async () => {
    const ok = await confirmAction({ title: 'Batalkan pesanan?', message: 'Cadangan stok akan dilepas. Stok fisik tidak berubah.', confirmLabel: 'Batalkan', tone: 'danger' });
    if (!ok) return;
    ctx.store.update((db) => cancelOrder(db, { id: btn.dataset.cancel, user: ctx.user }));
    toast('Pesanan dibatalkan; cadangan stok dilepas.', { tone: 'success' });
  }));
}
