/** Stok & Roll: search, list, roll detail, traceability. */

import { esc, icon, fmt, badge, swatch, toast, openModal, field, printDocument, downloadFile, toCsv, promptText } from '../dom.js';
import { MM_PER_M, byId, formatDateLong } from '../../domain/core.js';
import {
  ROLL_STATUS, availableMm, isSellable, partAvailable, quarantineRoll, rollChildren, rollTrail,
  skuStockByWarehouse, stockSummary, summarizeRolls,
} from '../../domain/inventory.js';
import { pageHead, statCard, warehouseOf, can, roleHint, movementRow } from './common.js';
import { printLabelHtml } from './print.js';

const filters = { q: '', collection: '', status: 'all', available: false };

function rollStatus(roll) {
  if (roll.transit) return { label: 'Transit', tone: 'info' };
  return ROLL_STATUS[roll.status] ?? { label: roll.status, tone: 'muted' };
}

function matches(db, roll, { whId }) {
  if (whId !== 'all' && roll.warehouseId !== whId) return false;
  if (filters.collection) {
    const sku = byId(db.skus, roll.skuId);
    if (sku?.collectionId !== filters.collection) return false;
  }
  if (filters.status === 'transit' && !roll.transit) return false;
  if (filters.status === 'available' && (roll.status !== 'available' || roll.transit)) return false;
  if (filters.status === 'quarantine' && roll.status !== 'quarantine') return false;
  if (filters.status === 'sold' && !['sold', 'consumed'].includes(roll.status)) return false;
  if (filters.available && availableMm(roll) <= 0) return false;
  const q = filters.q.trim().toLowerCase();
  if (!q) return true;
  const sku = byId(db.skus, roll.skuId);
  const wh = byId(db.warehouses, roll.warehouseId) ?? byId(db.warehouses, roll.transit?.toWarehouseId);
  return [
    roll.id, roll.lot, roll.bin, roll.receiptRef, sku?.code, sku?.colourCode, sku?.colourName,
    sku?.collectionName, wh?.code, wh?.name,
  ].some((v) => String(v ?? '').toLowerCase().includes(q));
}

function rowsHtml(ctx) {
  const { db, ui } = ctx;
  const list = db.rolls
    .filter((r) => matches(db, r, { whId: ui.warehouseId }))
    .sort((a, b) => b.id.localeCompare(a.id));

  if (!list.length) {
    return `<tr><td colspan="9">${''}</td></tr>`;
  }
  return list.map((roll) => {
    const sku = byId(db.skus, roll.skuId);
    const status = rollStatus(roll);
    const wh = roll.transit ? byId(db.warehouses, roll.transit.toWarehouseId) : byId(db.warehouses, roll.warehouseId);
    const avail = availableMm(roll);
    return `<tr data-href="#/stok/${roll.id}" tabindex="0" role="link" aria-label="Roll ${roll.id}">
      <td><span class="mono strong">${esc(roll.id)}</span><div class="xs muted">${esc(roll.lot)}</div></td>
      <td>
        <div class="cell-main">
          ${swatch(sku)}
          <div class="txt">
            <strong>${esc(sku?.collectionName)} ${esc(sku?.colourName || sku?.colourCode || '')}</strong>
            <span>${esc(sku?.code)}${sku?.widthCm ? ` Â· ${sku.widthCm} cm` : ''}</span>
          </div>
        </div>
      </td>
      <td class="hide-sm">${esc(wh?.code ?? 'â€”')}<div class="xs muted">${esc(roll.bin || 'â€”')}</div></td>
      <td class="num">${fmt.m(roll.currentMm)}</td>
      <td class="num ${roll.reservedMm ? 'strong' : 'muted'}">${roll.reservedMm ? fmt.m(roll.reservedMm) : 'â€”'}</td>
      <td class="num ${avail === 0 ? 'muted' : ''}">${isSellable(roll) ? fmt.m(avail) : 'â€”'}</td>
      <td>${badge(status.label, status.tone)}</td>
    </tr>`;
  }).join('');
}

function cardsHtml(ctx) {
  const { db, ui } = ctx;
  const list = db.rolls
    .filter((r) => matches(db, r, { whId: ui.warehouseId }))
    .sort((a, b) => b.id.localeCompare(a.id));
  if (!list.length) return `<div class="empty">${icon('search')}<strong>Tidak ada roll</strong><p>Ubah kata kunci atau filter gudang.</p></div>`;
  return list.map((roll) => {
    const sku = byId(db.skus, roll.skuId);
    const status = rollStatus(roll);
    const wh = roll.transit ? byId(db.warehouses, roll.transit.toWarehouseId) : byId(db.warehouses, roll.warehouseId);
    const avail = availableMm(roll);
    return `<a class="roll-card" href="#/stok/${roll.id}" style="color:inherit;text-decoration:none">
      <div class="top">
        <span class="id">${esc(roll.id)}</span>
        ${badge(status.label, status.tone)}
      </div>
      <div class="name">${swatch(sku)}<span>${esc(sku?.collectionName)} ${esc(sku?.colourName || sku?.colourCode || '')}</span></div>
      <div class="xs muted">${esc(sku?.code)} Â· Lot ${esc(roll.lot)} Â· ${esc(wh?.code ?? 'â€”')} / ${esc(roll.bin || 'â€”')}</div>
      <div class="grid3">
        <div class="kv"><span>Fisik</span><strong>${fmt.m(roll.currentMm)}</strong></div>
        <div class="kv"><span>Terpesan</span><strong>${roll.reservedMm ? fmt.m(roll.reservedMm) : 'â€”'}</strong></div>
        <div class="kv"><span>Tersedia</span><strong>${isSellable(roll) ? fmt.m(avail) : 'â€”'}</strong></div>
      </div>
    </a>`;
  }).join('');
}

function summaryStrip(ctx) {
  const { db, ui } = ctx;
  const wh = ui.warehouseId === 'all' ? null : ui.warehouseId;
  const s = stockSummary(db, { warehouseId: wh });
  const partsQty = db.partStock
    .filter((p) => !wh || p.warehouseId === wh)
    .reduce((a, p) => a + p.qty, 0);
  return `<div class="grid grid-4" style="margin-bottom:16px">
    ${statCard({ label: 'Fisik', value: fmt.m(s.physicalMm), meta: `${s.count} roll di lokasi` })}
    ${statCard({ label: 'Tersedia', value: fmt.m(s.availableMm), meta: 'Bisa dijual / dikirim', tone: 'accent' })}
    ${statCard({ label: 'Terpesan', value: fmt.m(s.reservedMm), meta: 'Proyek & alokasi' })}
    ${statCard({ label: 'Karantina / transit', value: `${fmt.m(s.quarantineMm)} / ${fmt.m(s.incomingMm)}`, meta: 'Transit tidak dihitung stok gudang', tone: 'warn' })}
  </div>
  <p class="xs muted" style="margin:-6px 0 12px">Spare part terpisah: <strong>${fmt.pcs(partsQty)} pcs</strong> â€” tidak pernah dijumlahkan dengan meter kain.</p>`;
}

export function render(ctx) {
  if (ctx.route.id) return renderDetail(ctx);

  const { db, ui, role } = ctx;
  const collections = db.collections.filter((c) => c.id !== 'col-rel' && c.id !== 'col-motor');
  return `
    ${pageHead({
      eyebrow: 'Persediaan',
      title: 'Stok & Roll',
      sub: 'Setiap panjang adalah roll fisik. Saldo tersedia = fisik âˆ’ reservasi, dan transit tidak dihitung di gudang mana pun.',
      actions: `${can(role, 'stock.view') ? `<button class="btn" type="button" data-action="export">${icon('download')} Ekspor CSV</button>` : ''}
        <a class="btn btn-primary" href="#/pembelian">${icon('truck')} Terima stok</a>`,
    })}
    ${summaryStrip(ctx)}
    <div class="filterbar">
      <div class="search">
        ${icon('search')}
        <input class="input" id="roll-search" type="search" placeholder="Cari roll, lot, warna, rakâ€¦" value="${esc(filters.q)}" aria-label="Cari roll" />
      </div>
      <div class="field"><label for="f-collection">Koleksi</label>
        <select class="select" id="f-collection">
          <option value="">Semua koleksi</option>
          ${collections.map((c) => `<option value="${c.id}" ${filters.collection === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label for="f-status">Status</label>
        <select class="select" id="f-status">
          <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Semua status</option>
          <option value="available" ${filters.status === 'available' ? 'selected' : ''}>Tersedia</option>
          <option value="quarantine" ${filters.status === 'quarantine' ? 'selected' : ''}>Karantina</option>
          <option value="transit" ${filters.status === 'transit' ? 'selected' : ''}>Transit</option>
          <option value="sold" ${filters.status === 'sold' ? 'selected' : ''}>Terjual / terpakai</option>
        </select>
      </div>
      <label class="checkline" style="min-height:42px"><input type="checkbox" id="f-available" ${filters.available ? 'checked' : ''} /> Hanya ada stok</label>
      <button class="btn btn-ghost" type="button" data-action="reset-filter">Reset</button>
    </div>
    <section class="card">
      <div class="table-wrap desktop-table">
        <table class="data">
          <thead><tr><th>Roll / Lot</th><th>Produk & warna</th><th class="hide-sm">Gudang / Rak</th><th class="num">Fisik</th><th class="num">Terpesan</th><th class="num">Tersedia</th><th>Status</th></tr></thead>
          <tbody id="roll-rows">${rowsHtml(ctx)}</tbody>
        </table>
      </div>
      <div class="mobile-cards" id="roll-cards">${cardsHtml(ctx)}</div>
    </section>
    <p class="xs muted" style="margin-top:8px">Menampilkan <span id="roll-count">${db.rolls.filter((r) => matches(db, r, { whId: ui.warehouseId })).length}</span> roll. Swatch hanya referensi visual; cocokkan kode warna dan lot saat memotong.</p>
    ${partsSection(ctx)}`;
}

function partsSection(ctx) {
  const { db, ui } = ctx;
  const whId = ui.warehouseId;
  const parts = db.parts.filter((p) => {
    const qty = db.partStock
      .filter((s) => s.partId === p.id && (whId === 'all' || s.warehouseId === whId))
      .reduce((a, s) => a + s.qty, 0);
    return qty > 0;
  });
  if (!parts.length) return '';
  return `<div class="section-title"><h2>Spare part</h2><span class="small muted">Satuan pcs â€” terpisah dari meter</span></div>
    <section class="card">
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>SKU</th><th>Nama</th><th class="num">Stok</th><th class="num">Tersedia</th><th>Gudang</th></tr></thead>
          <tbody>${parts.map((p) => {
            const rows = db.partStock.filter((s) => s.partId === p.id && (whId === 'all' || s.warehouseId === whId));
            const qty = rows.reduce((a, s) => a + s.qty, 0);
            const avail = rows.reduce((a, s) => a + (s.qty - (s.reserved || 0)), 0);
            return `<tr>
              <td class="mono">${esc(p.sku)}</td>
              <td>${esc(p.name)}</td>
              <td class="num">${fmt.pcs(qty)} pcs</td>
              <td class="num">${fmt.pcs(avail)} pcs</td>
              <td class="small muted">${rows.map((r) => `${warehouseOf(db, r.warehouseId)?.code}: ${r.qty}`).join(' Â· ')}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </section>`;
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                     */
/* -------------------------------------------------------------------------- */

function renderDetail(ctx) {
  const { db, role, route } = ctx;
  const roll = db.rolls.find((r) => r.id === route.id);
  if (!roll) return `${pageHead({ title: 'Roll tidak ditemukan' })}<div class="notice notice-danger">${icon('alert')}<div>Roll ${esc(route.id)} tidak ada pada dataset ini.</div></div>`;

  const sku = byId(db.skus, roll.skuId);
  const status = rollStatus(roll);
  const wh = roll.transit ? warehouseOf(db, roll.transit.toWarehouseId) : warehouseOf(db, roll.warehouseId);
  const avail = availableMm(roll);
  const trail = rollTrail(db, roll.id);
  const children = rollChildren(db, roll.id);
  const others = skuStockByWarehouse(db, roll.skuId);
  const parent = roll.parentRollId ? db.rolls.find((r) => r.id === roll.parentRollId) : null;

  return `
    <div class="page-head">
      <div>
        <a class="small strong" href="#/stok">â† Kembali ke stok</a>
        <div class="row" style="margin-top:6px">
          <h1 class="mono" style="font-family:var(--font-mono);font-size:1.5rem">${esc(roll.id)}</h1>
          ${badge(status.label, status.tone)}
          ${roll.condition !== 'good' ? badge(roll.condition === 'damaged' ? 'Rusak' : 'Cacat ringan', 'warn') : ''}
        </div>
        <p class="sub">${esc(sku?.collectionName)} ${esc(sku?.colourName || sku?.colourCode || '')} Â· ${esc(sku?.code)} Â· Lot ${esc(roll.lot)}</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" data-action="print-label">${icon('printer')} Cetak label</button>
        ${isSellable(roll) && can(role, 'invoice.create') ? `<a class="btn btn-primary" href="#/penjualan?new=1&roll=${roll.id}">${icon('cut')} Jual / potong</a>` : ''}
        ${can(role, 'stock.quarantine') && !roll.transit && ['available'].includes(roll.status) ? `<button class="btn btn-danger" type="button" data-action="quarantine">${icon('alert')} Karantina</button>` : ''}
      </div>
    </div>

    <div class="grid grid-main">
      <div class="stack">
        <section class="card card-pad">
          <div class="row-between" style="align-items:flex-start">
            <div class="row">
              ${swatch(sku, 'lg')}
              <div>
                <div class="strong">${esc(sku?.collectionName)} â€” ${esc(sku?.colourName || 'Tanpa nama warna')}</div>
                <div class="small muted">Kode warna <strong>${esc(sku?.colourCode)}</strong> Â· Lot <strong>${esc(roll.lot)}</strong> Â· ${esc(sku?.widthCm)} cm</div>
              </div>
            </div>
            <div class="right">
              <div class="xs muted">Nilai stok</div>
              <div class="strong num">${fmt.money(Math.round((roll.currentMm / 1000) * roll.costPerM))}</div>
            </div>
          </div>
          <hr class="divider" />
          <div class="grid grid-3">
            <div><div class="xs muted">Panjang awal</div><div class="strong num">${fmt.m(roll.originalMm)}</div></div>
            <div><div class="xs muted">Panjang aktual</div><div class="strong num" style="font-size:1.25rem">${fmt.m(roll.currentMm)}</div></div>
            <div><div class="xs muted">Tersedia</div><div class="strong num">${isSellable(roll) ? fmt.m(avail) : 'â€”'}</div></div>
            <div><div class="xs muted">Terpesan</div><div class="strong num">${roll.reservedMm ? fmt.m(roll.reservedMm) : 'â€”'}</div></div>
            <div><div class="xs muted">Harga pokok / m</div><div class="strong num">${fmt.money(roll.costPerM)}</div></div>
            <div><div class="xs muted">Gudang / rak</div><div class="strong">${esc(wh?.code ?? 'â€”')} Â· ${esc(roll.bin || 'â€”')}</div></div>
          </div>
          ${roll.reservedMm ? `<div class="notice notice-warn" style="margin-top:12px">${icon('clock')}<div><strong>${fmt.m(roll.reservedMm)} terpesan.</strong> ${esc((roll.reservations ?? []).map((r) => `${r.ref} (${fmt.m(r.qtyMm)})`).join(', '))}</div></div>` : ''}
          ${roll.transit ? `<div class="notice notice-info" style="margin-top:12px">${icon('truck')}<div><strong>Dalam perjalanan</strong> dari ${esc(warehouseOf(db, roll.transit.fromWarehouseId)?.name)} ke ${esc(warehouseOf(db, roll.transit.toWarehouseId)?.name)}. Tidak dihitung sebagai stok di gudang mana pun.</div></div>` : ''}
        </section>

        <section class="card">
          <div class="card-head"><div><h2>Riwayat pergerakan</h2><p>Roll, dokumen, pelaku, dan waktu.</p></div><span class="badge no-dot">${trail.length} entri</span></div>
          <div class="card-pad"><ul class="timeline">${trail.map((m) => movementRow(db, m)).join('') || '<li class="muted small">Belum ada mutasi.</li>'}</ul></div>
        </section>
      </div>

      <div class="stack">
        <section class="card card-pad">
          <h2>Asal & turunan</h2>
          <div class="stack-sm" style="margin-top:10px">
            <div class="row-between"><span class="small muted">Penerimaan</span><span class="small strong">${esc(roll.receiptRef || 'â€”')}</span></div>
            <div class="row-between"><span class="small muted">Tanggal terima</span><span class="small">${esc(formatDateLong(roll.receivedAt))}</span></div>
            <div class="row-between"><span class="small muted">Induk</span><span class="small">${parent ? `<a class="mono" href="#/stok/${parent.id}">${esc(parent.id)}</a>` : 'â€”'}</span></div>
            <div class="row-between"><span class="small muted">Roll akar</span><span class="small mono">${esc(roll.rootRollId || roll.id)}</span></div>
          </div>
          ${children.length ? `<hr class="divider" /><div class="small muted" style="margin-bottom:6px">Turunan (${children.length})</div>
            <div class="stack-sm">${children.slice(0, 8).map((c) => `<a class="row-between small" href="#/stok/${c.id}"><span class="mono">${esc(c.id)}</span><span>${fmt.m(c.currentMm)} Â· ${esc(ROLL_STATUS[c.status]?.label ?? c.status)}</span></a>`).join('')}</div>` : ''}
        </section>

        <section class="card card-pad">
          <h2>Ketersediaan warna ini</h2>
          <p class="xs muted" style="margin:4px 0 10px">Cek gudang lain sebelum memutuskan transfer.</p>
          <div class="stack-sm">
            ${[...others.entries()].map(([whId, s]) => `<div class="row-between">
              <span class="small">${esc(warehouseOf(db, whId)?.code)} Â· ${esc(warehouseOf(db, whId)?.name.replace('Gudang ', ''))}</span>
              <span class="small num ${s.availableMm ? 'strong' : 'muted'}">${fmt.m(s.availableMm)} tersedia</span>
            </div>`).join('') || '<p class="small muted">Tidak ada stok warna ini di gudang lain.</p>'}
          </div>
          ${wh ? `<a class="btn btn-sm btn-block" style="margin-top:12px" href="#/transfer?new=1&sku=${roll.skuId}&from=${wh.id}">${icon('transfer')} Minta dari gudang ini</a>` : ''}
        </section>

        <section class="card card-pad">
          <h2>Catatan operasional</h2>
          <p class="small muted" style="margin-top:6px">${esc(roll.notes || 'Tidak ada catatan khusus.')}</p>
          <hr class="divider" />
          <div class="xs muted">Dibuat ${esc(new Date(roll.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</div>
        </section>
      </div>
    </div>`;
}

export function mount(ctx) {
  if (ctx.route.id) {
    document.querySelector('[data-action="print-label"]')?.addEventListener('click', () => {
      const roll = ctx.db.rolls.find((r) => r.id === ctx.route.id);
      const sku = byId(ctx.db.skus, roll.skuId);
      const wh = warehouseOf(ctx.db, roll.transit?.toWarehouseId ?? roll.warehouseId);
      printDocument(`Label ${roll.id}`, printLabelHtml(roll, sku, wh));
    });
    document.querySelector('[data-action="quarantine"]')?.addEventListener('click', async () => {
      const reason = await promptText({
        title: 'Karantina roll',
        label: 'Alasan karantina',
        value: 'Kain cacat / perlu pemeriksaan',
        hint: 'Roll tidak bisa dijual selama karantina.',
        submitLabel: 'Karantina',
        tone: 'danger',
      });
      if (!reason) return;
      try {
        ctx.store.update((db) => {
          quarantineRoll(db, { rollId: ctx.route.id, user: ctx.user, reason, ref: 'KARANTINA-MANUAL' });
        });
        toast('Roll dipindahkan ke karantina. Stok tersedia berkurang.', { tone: 'success' });
      } catch (err) {
        toast(err.message, { tone: 'error' });
      }
    });
    document.querySelectorAll('tr[data-href]').forEach((tr) => {
      tr.addEventListener('click', () => { window.location.hash = tr.dataset.href.replace('#', ''); });
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') window.location.hash = tr.dataset.href.replace('#', '');
      });
    });
    return;
  }

  const rerenderList = () => {
    document.getElementById('roll-rows').innerHTML = rowsHtml(ctx);
    document.getElementById('roll-cards').innerHTML = cardsHtml(ctx);
    const count = ctx.db.rolls.filter((r) => matches(ctx.db, r, { whId: ctx.ui.warehouseId })).length;
    const el = document.getElementById('roll-count');
    if (el) el.textContent = String(count);
    document.querySelectorAll('tr[data-href]').forEach((tr) => {
      tr.addEventListener('click', () => { window.location.hash = tr.dataset.href.replace('#', ''); });
    });
  };

  const search = document.getElementById('roll-search');
  let timer = 0;
  search?.addEventListener('input', (e) => {
    filters.q = e.target.value;
    clearTimeout(timer);
    timer = window.setTimeout(rerenderList, 120);
  });
  document.getElementById('f-collection')?.addEventListener('change', (e) => { filters.collection = e.target.value; rerenderList(); });
  document.getElementById('f-status')?.addEventListener('change', (e) => { filters.status = e.target.value; rerenderList(); });
  document.getElementById('f-available')?.addEventListener('change', (e) => { filters.available = e.target.checked; rerenderList(); });
  document.querySelector('[data-action="reset-filter"]')?.addEventListener('click', () => {
    Object.assign(filters, { q: '', collection: '', status: 'all', available: false });
    window.location.hash = '#/stok';
    // Force a full view re-render via store emit.
    ctx.store.emit();
  });
  document.querySelector('[data-action="export"]')?.addEventListener('click', () => {
    const { db, ui } = ctx;
    const list = db.rolls.filter((r) => matches(db, r, { whId: ui.warehouseId }));
    const rows = [
      ['Roll', 'SKU', 'Koleksi', 'Kode warna', 'Nama warna', 'Lot', 'Gudang', 'Rak', 'Fisik (mm)', 'Terpesan (mm)', 'Tersedia (mm)', 'Status', 'Harga pokok/m'],
      ...list.map((r) => {
        const sku = byId(db.skus, r.skuId);
        return [r.id, sku?.code, sku?.collectionName, sku?.colourCode, sku?.colourName ?? '', r.lot,
          byId(db.warehouses, r.warehouseId)?.code ?? '', r.bin, r.currentMm, r.reservedMm ?? 0, availableMm(r),
          r.transit ? 'transit' : r.status, r.costPerM];
      }),
    ];
    downloadFile(`lajur-stok-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), 'text/csv');
  });
}
