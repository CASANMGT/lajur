/** Stok & Roll: search, list, roll detail, traceability. */

import { esc, icon, fmt, badge, swatch, toast, openModal, field, printDocument, downloadFile, toCsv, promptText } from '../dom.js';
import { MM_PER_M, byId, formatDateLong, parseM, todayJakarta } from '../../domain/core.js';
import {
  ROLL_STATUS, availableMm, isSellable, partAvailable, quarantineRoll, receiveAdhocStock,
  rollAncestors, rollDescendants, rollHierarchy, rollTrail, skuStockByWarehouse,
  stockSummary, summarizeRolls,
} from '../../domain/inventory.js';
import { pageHead, statCard, warehouseOf, can, roleHint, movementRow, warehouseOptions } from './common.js';
import { settingsOf } from '../../domain/settings.js';
import { printLabelHtml } from './print.js';

const filters = { q: '', collection: '', status: 'all', available: false };
let stockView = 'list';

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
    return `<tr data-href="#/stok/${roll.id}" tabindex="0" role="link">
      <td><span class="mono strong">${esc(roll.id)}</span><div class="xs muted">${esc(roll.lot)}</div></td>
      <td>
        <div class="cell-main">
          ${swatch(sku)}
          <div class="txt">
            <strong>${esc(sku?.collectionName)} ${esc(sku?.colourName || sku?.colourCode || '')}</strong>
            <span>${esc(sku?.code)}${sku?.widthCm ? ` · ${sku.widthCm} cm` : ''}</span>
          </div>
        </div>
      </td>
      <td class="hide-sm">${esc(wh?.code ?? '—')}<div class="xs muted">${esc(roll.bin || '—')}</div></td>
      <td class="num">${fmt.m(roll.currentMm)}</td>
      <td class="num ${roll.reservedMm ? 'strong' : 'muted'}">${roll.reservedMm ? fmt.m(roll.reservedMm) : '—'}</td>
      <td class="num ${avail === 0 ? 'muted' : ''}">${isSellable(roll) ? fmt.m(avail) : '—'}</td>
      <td>${badge(status.label, status.tone)}</td>
    </tr>`;
  }).join('');
}

function treeRows(nodes, db) {
  return nodes.map((node) => {
    const roll = node.roll;
    const status = rollStatus(roll);
    const wh = roll.transit ? byId(db.warehouses, roll.transit.toWarehouseId) : byId(db.warehouses, roll.warehouseId);
    return `<div class="tree-node">
      <a class="tree-row" href="#/stok/${esc(roll.id)}">
        <span class="tree-id mono strong">${esc(roll.id)}</span>
        <span class="tree-lot xs muted">Lot ${esc(roll.lot)} · ${esc(wh?.code ?? '—')}/${esc(roll.bin || '—')}</span>
        <span class="num">${fmt.m(roll.currentMm)}</span>
        <span class="num ${node.reservedMm ? 'strong' : 'muted'}">${node.reservedMm ? fmt.m(node.reservedMm) : '—'}</span>
        <span class="num">${isSellable(roll) ? fmt.m(node.availableMm) : '—'}</span>
        <span>${badge(status.label, status.tone)}</span>
      </a>
      ${node.children.length ? `<div class="tree-children">${treeRows(node.children, db)}</div>` : ''}
    </div>`;
  }).join('');
}

function hierarchyInner(ctx) {
  const { db, ui } = ctx;
  const filtered = db.rolls.filter((r) => matches(db, r, { whId: ui.warehouseId }));
  const groups = rollHierarchy(db, { rolls: filtered });
  if (!groups.length) {
    return `<div class="empty">${icon('search')}<strong>Tidak ada roll</strong><p>Ubah kata kunci atau filter gudang.</p></div>`;
  }
  return `<div class="stack">${groups.map((group) => {
    const rootCount = group.skus.reduce((a, s) => a + s.rootCount, 0);
    const childCount = group.skus.reduce((a, s) => a + s.childCount, 0);
    return `<details class="card tree-collection" open>
      <summary>
        <span class="tree-collection-name">${esc(group.name)}</span>
        <span class="xs muted">${group.rollCount} roll · ${rootCount} induk · ${childCount} turunan</span>
        <span class="small num">${fmt.m(group.physicalMm)} fisik · ${fmt.m(group.availableMm)} tersedia</span>
      </summary>
      <div class="card-pad">
        ${group.skus.map((s) => `<div class="tree-sku">
          <div class="tree-sku-head">
            ${swatch(s.sku)}
            <div>
              <strong>${esc(s.sku?.collectionName)} ${esc(s.sku?.colourName || s.sku?.colourCode || '')}</strong>
              <div class="xs muted">${esc(s.sku?.code)} · ${s.rootCount} induk · ${s.childCount} turunan · ${fmt.m(s.physicalMm)} fisik · ${fmt.m(s.availableMm)} tersedia</div>
            </div>
            ${s.sku?.swatch ? `<span class="xs mono muted">${esc(s.sku.swatch)}</span>` : ''}
          </div>
          <div class="tree-head" aria-hidden="true">
            <span>Roll</span><span>Lot / lokasi</span><span class="num">Fisik</span><span class="num">Terpesan</span><span class="num">Tersedia</span><span>Status</span>
          </div>
          <div class="tree-nodes">${treeRows(s.nodes, db)}</div>
        </div>`).join('')}
      </div>
    </details>`;
  }).join('')}</div>`;
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
      <div class="xs muted">${esc(sku?.code)} · Lot ${esc(roll.lot)} · ${esc(wh?.code ?? '—')} / ${esc(roll.bin || '—')}</div>
      <div class="grid3">
        <div class="kv"><span>Fisik</span><strong>${fmt.m(roll.currentMm)}</strong></div>
        <div class="kv"><span>Terpesan</span><strong>${roll.reservedMm ? fmt.m(roll.reservedMm) : '—'}</strong></div>
        <div class="kv"><span>Tersedia</span><strong>${isSellable(roll) ? fmt.m(avail) : '—'}</strong></div>
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
  const threshold = settingsOf(db).lowStockMm ?? 10000;
  const lowSkus = db.skus.filter((sku) => {
    const rolls = db.rolls.filter((r) => r.skuId === sku.id && (!wh || r.warehouseId === wh) && !r.transit && ['available', 'quarantine'].includes(r.status));
    const physical = rolls.reduce((a, r) => a + r.currentMm, 0);
    const available = rolls.reduce((a, r) => a + availableMm(r), 0);
    return physical > 0 && available < threshold;
  }).length;
  return `<div class="grid grid-4" style="margin-bottom:16px">
    ${statCard({ label: 'Fisik', value: fmt.m(s.physicalMm), meta: `${s.count} roll di lokasi` })}
    ${statCard({ label: 'Tersedia', value: fmt.m(s.availableMm), meta: 'Bisa dijual / dikirim', tone: 'accent' })}
    ${statCard({ label: 'Terpesan', value: fmt.m(s.reservedMm), meta: 'Proyek & alokasi' })}
    ${statCard({ label: 'Karantina / transit', value: `${fmt.m(s.quarantineMm)} / ${fmt.m(s.incomingMm)}`, meta: 'Transit tidak dihitung stok gudang', tone: 'warn' })}
  </div>
  <p class="xs muted" style="margin:-6px 0 12px">Spare part terpisah: <strong>${fmt.pcs(partsQty)} pcs</strong> — tidak pernah dijumlahkan dengan meter kain.</p>
  ${lowSkus ? `<div class="notice notice-warn" style="margin-bottom:12px">${icon('alert')}<div><strong>${lowSkus} SKU di bawah ambang stok</strong> (${fmt.m(threshold)} tersedia). Ubah ambang di Pengaturan → Preferensi.</div></div>` : ''}`;
}

export function render(ctx) {
  if (ctx.route.id) return renderDetail(ctx);

  const { db, ui, role } = ctx;
  const collections = db.collections.filter((c) => c.id !== 'col-rel' && c.id !== 'col-motor');
  return `
    ${pageHead({
      eyebrow: 'Persediaan',
      title: 'Stok & Roll',
      sub: 'Setiap panjang adalah roll fisik. Saldo tersedia = fisik − reservasi, dan transit tidak dihitung di gudang mana pun.',
      actions: `${can(role, 'stock.add') ? `<button class="btn btn-primary" type="button" data-act="add-stock">${icon('plus')} Tambah stok</button>` : ''}
        <a class="btn" href="#/pembelian">${icon('truck')} Terima PO</a>
        ${can(role, 'stock.view') ? `<button class="btn" type="button" data-action="export">${icon('download')} CSV</button>` : ''}`,
    })}
    ${summaryStrip(ctx)}
    <div class="filterbar">
      <div class="search">
        ${icon('search')}
        <input class="input" id="roll-search" type="search" placeholder="Cari roll, lot, warna, rak…" value="${esc(filters.q)}" aria-label="Cari roll" />
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
    <div class="row" style="margin-bottom:12px">
      ${[['list', 'Daftar roll'], ['tree', 'Hierarki koleksi']].map(([key, label]) => `<button class="chip" type="button" data-stock-view="${key}" aria-pressed="${stockView === key}">${label}</button>`).join('')}
    </div>
    ${stockView === 'tree'
      ? `<div id="stock-tree">${hierarchyInner(ctx)}</div>`
      : `<section class="card">
      <div class="table-wrap desktop-table">
        <table class="data">
          <thead><tr><th>Roll / Lot</th><th>Produk & warna</th><th class="hide-sm">Gudang / Rak</th><th class="num">Fisik</th><th class="num">Terpesan</th><th class="num">Tersedia</th><th>Status</th></tr></thead>
          <tbody id="roll-rows">${rowsHtml(ctx)}</tbody>
        </table>
      </div>
      <div class="mobile-cards" id="roll-cards">${cardsHtml(ctx)}</div>
    </section>
    <p class="xs muted" style="margin-top:8px">Menampilkan <span id="roll-count">${db.rolls.filter((r) => matches(db, r, { whId: ui.warehouseId })).length}</span> roll. Swatch hanya referensi visual; cocokkan kode warna dan lot saat memotong.</p>`}
    ${partsSection(ctx)}`;
}

function partsSection(ctx) {
  const { db, ui } = ctx;
  const whId = ui.warehouseId;
  const items = db.parts.map((part) => {
    const rows = db.partStock.filter((s) => s.partId === part.id && (whId === 'all' || s.warehouseId === whId));
    const qty = rows.reduce((a, s) => a + s.qty, 0);
    const avail = rows.reduce((a, s) => a + (s.qty - (s.reserved || 0)), 0);
    return { part, rows, qty, avail };
  }).filter((x) => x.qty > 0);
  if (!items.length) return '';

  const groups = new Map();
  for (const item of items) {
    const key = item.part.categoryId ?? '__none';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const renderRows = (item, groupItems, depth = 0) => {
    const { part, rows, qty, avail } = item;
    const children = groupItems
      .filter((x) => x.part.parentPartId === part.id)
      .sort((a, b) => a.part.sku.localeCompare(b.part.sku));
    const image = part.image
      ? `<img src="${esc(part.image)}" alt="Foto ${esc(part.name)}" class="thumb zoomable" data-zoom="${esc(part.image)}" data-zoom-title="${esc(part.sku)} · ${esc(part.name)}" role="button" tabindex="0" aria-label="Perbesar foto ${esc(part.name)}" />`
      : `<span class="thumb thumb-empty">${icon('box')}</span>`;
    return `<tr>
      <td style="${depth ? `padding-left:${8 + depth * 20}px` : ''}">
        <div class="cell-main">${image}<div class="txt"><strong>${depth ? '<span class="muted" aria-hidden="true">↳ </span>' : ''}${esc(part.name)}</strong><span>${esc(part.sku)}${part.brand ? ` · ${esc(part.brand)}` : ''}</span></div></div>
      </td>
      <td class="num">${fmt.pcs(qty)} pcs</td>
      <td class="num">${fmt.pcs(avail)} pcs</td>
      <td class="small muted">${rows.map((r) => `${warehouseOf(db, r.warehouseId)?.code}: ${r.qty}`).join(' · ')}</td>
    </tr>${children.map((child) => renderRows(child, groupItems, depth + 1)).join('')}`;
  };

  const cards = [...groups.entries()].sort((a, b) => String(byId(db.categories, a[0])?.name ?? '').localeCompare(String(byId(db.categories, b[0])?.name ?? ''))).map(([categoryId, groupItems]) => {
    const ids = new Set(groupItems.map((x) => x.part.id));
    const roots = groupItems
      .filter((x) => !x.part.parentPartId || !ids.has(x.part.parentPartId))
      .sort((a, b) => a.part.sku.localeCompare(b.part.sku));
    const totalQty = groupItems.reduce((a, x) => a + x.qty, 0);
    return `<section class="card" style="margin-bottom:14px">
      <div class="card-head">
        <div><h2>${esc(byId(db.categories, categoryId)?.name ?? 'Tanpa kategori')}</h2><p>${roots.length} induk · ${groupItems.length - roots.length} child · stok dalam pcs</p></div>
        <span class="badge no-dot">${fmt.pcs(totalQty)} pcs</span>
      </div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Part</th><th class="num">Stok</th><th class="num">Tersedia</th><th>Gudang</th></tr></thead>
        <tbody>${roots.map((item) => renderRows(item, groupItems)).join('')}</tbody>
      </table></div>
    </section>`;
  }).join('');

  return `<div class="section-title"><h2>Spare part</h2><span class="small muted">Satuan pcs — induk/child per kategori · klik gambar untuk memperbesar</span></div>
    ${cards}`;
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
  const ancestors = rollAncestors(db, roll.id);
  const directChildren = db.rolls.filter((r) => r.parentRollId === roll.id);
  const descendants = rollDescendants(db, roll.id);
  const others = skuStockByWarehouse(db, roll.skuId);
  const parent = roll.parentRollId ? db.rolls.find((r) => r.id === roll.parentRollId) : null;
  const showCost = role === 'manager' || (role === 'operator' && settingsOf(db).operatorCanSeeCosts);

  return `
    <div class="page-head">
      <div>
        <a class="small strong" href="#/stok">← Kembali ke stok</a>
        <div class="row" style="margin-top:6px">
          <h1 class="mono" style="font-family:var(--font-mono);font-size:1.5rem">${esc(roll.id)}</h1>
          ${badge(status.label, status.tone)}
          ${roll.condition !== 'good' ? badge(roll.condition === 'damaged' ? 'Rusak' : 'Cacat ringan', 'warn') : ''}
        </div>
        <p class="sub">${esc(sku?.collectionName)} ${esc(sku?.colourName || sku?.colourCode || '')} · ${esc(sku?.code)} · Lot ${esc(roll.lot)}</p>
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
                <div class="strong">${esc(sku?.collectionName)} — ${esc(sku?.colourName || 'Tanpa nama warna')}</div>
                <div class="small muted">Kode warna <strong>${esc(sku?.colourCode)}</strong> · Lot <strong>${esc(roll.lot)}</strong> · ${esc(sku?.widthCm)} cm</div>
              </div>
            </div>
            ${showCost ? `<div class="right">
              <div class="xs muted">Nilai stok</div>
              <div class="strong num">${fmt.money(Math.round((roll.currentMm / 1000) * roll.costPerM))}</div>
            </div>` : ''}
          </div>
          <hr class="divider" />
          <div class="grid grid-3">
            <div><div class="xs muted">Panjang awal</div><div class="strong num">${fmt.m(roll.originalMm)}</div></div>
            <div><div class="xs muted">Panjang aktual</div><div class="strong num" style="font-size:1.25rem">${fmt.m(roll.currentMm)}</div></div>
            <div><div class="xs muted">Tersedia</div><div class="strong num">${isSellable(roll) ? fmt.m(avail) : '—'}</div></div>
            <div><div class="xs muted">Terpesan</div><div class="strong num">${roll.reservedMm ? fmt.m(roll.reservedMm) : '—'}</div></div>
            <div><div class="xs muted">Harga pokok / m</div><div class="strong num">${showCost ? fmt.money(roll.costPerM) : '—'}</div></div>
            <div><div class="xs muted">Gudang / rak</div><div class="strong">${esc(wh?.code ?? '—')} · ${esc(roll.bin || '—')}</div></div>
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
            <div class="row-between"><span class="small muted">Penerimaan</span><span class="small strong">${esc(roll.receiptRef || '—')}</span></div>
            <div class="row-between"><span class="small muted">Tanggal terima</span><span class="small">${esc(formatDateLong(roll.receivedAt))}</span></div>
            <div class="row-between"><span class="small muted">Induk</span><span class="small">${parent ? `<a class="mono" href="#/stok/${parent.id}">${esc(parent.id)}</a>` : '—'}</span></div>
            <div class="row-between"><span class="small muted">Roll akar</span><span class="small mono"><a href="#/stok/${esc(roll.rootRollId || roll.id)}">${esc(roll.rootRollId || roll.id)}</a></span></div>
            <div class="row-between"><span class="small muted">Turunan langsung</span><span class="small">${directChildren.length}</span></div>
            <div class="row-between"><span class="small muted">Total turunan</span><span class="small">${descendants.length}</span></div>
          </div>
          ${ancestors.length ? `<hr class="divider" /><div class="small muted" style="margin-bottom:6px">Jalur roll</div>
            <div class="tree-path small">${ancestors.map((a) => `<a class="mono" href="#/stok/${a.id}">${esc(a.id)}</a>`).join(' <span class="muted">→</span> ')} <span class="muted">→</span> <strong class="mono">${esc(roll.id)}</strong></div>` : ''}
          ${directChildren.length ? `<hr class="divider" /><div class="small muted" style="margin-bottom:6px">Turunan langsung (${directChildren.length})</div>
            <div class="stack-sm">${directChildren.slice(0, 8).map((c) => `<a class="row-between small" href="#/stok/${c.id}"><span class="mono">${esc(c.id)}</span><span>${fmt.m(c.currentMm)} · ${esc(ROLL_STATUS[c.status]?.label ?? c.status)}</span></a>`).join('')}${directChildren.length > 8 ? `<span class="xs muted">+${directChildren.length - 8} turunan langsung lainnya</span>` : ''}</div>` : ''}
          ${descendants.length > directChildren.length ? `<div class="xs muted" style="margin-top:8px">${descendants.length - directChildren.length} turunan lebih dalam (potongan dari potongan).</div>` : ''}
        </section>

        <section class="card card-pad">
          <h2>Ketersediaan warna ini</h2>
          <p class="xs muted" style="margin:4px 0 10px">Cek gudang lain sebelum memutuskan transfer.</p>
          <div class="stack-sm">
            ${[...others.entries()].map(([whId, s]) => `<div class="row-between">
              <span class="small">${esc(warehouseOf(db, whId)?.code)} · ${esc(warehouseOf(db, whId)?.name.replace('Gudang ', ''))}</span>
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

function openAddStock(ctx) {
  const { db } = ctx;
  const active = db.warehouses.filter((w) => w.active !== false);
  const defaultWh = ctx.ui.warehouseId === 'all' ? active[0]?.id : ctx.ui.warehouseId;
  if (!active.length) {
    toast('Tidak ada gudang aktif. Aktifkan gudang di Master Data.', { tone: 'error' });
    return;
  }
  const skuOptions = db.skus.filter((s) => s.active !== false && !s.dormant)
    .map((s) => `<option value="${s.id}" data-price="${s.buyPrice}">${esc(s.collectionName)} ${esc(s.colourName || s.colourCode)} — ${esc(s.code)}</option>`).join('');
  const partOptions = db.parts
    .map((p) => `<option value="${p.id}" data-price="${p.buyPrice}">${esc(p.sku)} · ${esc(p.name)}</option>`).join('');
  const ref = `ADH-${todayJakarta().replaceAll('-', '')}-${String(Math.floor(Math.random() * 900) + 100)}`;

  openModal({
    title: 'Tambah stok',
    description: 'Penerimaan tanpa PO untuk saldo awal, koreksi, atau barang konsinyasi. Tetap membuat dokumen, lot, roll, dan jejak audit.',
    wide: true,
    submitLabel: 'Posting penerimaan',
    body: `
      <div class="form-grid">
        ${field('Jenis', `<select class="select" name="kind"><option value="fabric">Kain (roll)</option><option value="part">Spare part (pcs)</option></select>`)}
        ${field('Gudang tujuan', `<select class="select" name="warehouse">${warehouseOptions(db, defaultWh)}</select>`)}
        ${field('Nomor dokumen', `<input class="input" name="ref" value="${ref}" required />`, { hint: 'Harus unik terhadap semua penerimaan.' })}
        ${field('Tanggal', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
      </div>

      <div data-fabric-block>
        <div class="section-title" style="margin:18px 0 6px"><h3>Detail kain</h3><span class="xs muted">Setiap panjang menjadi roll</span></div>
        <div class="form-grid">
          ${field('SKU / warna', `<select class="select" name="sku">${skuOptions}</select>`)}
          ${field('Lot / dye lot', `<input class="input" name="lot" placeholder="LOT-2611-A" />`)}
          ${field('Panjang roll (m, pisah koma)', `<input class="input" name="lengths" inputmode="decimal" placeholder="Contoh: 60, 61,2" />`, { full: true, hint: 'Jangan memasukkan rata-rata. Satu angka = satu roll fisik.' })}
          ${field('Harga pokok / m', `<input class="input" name="fabricCost" inputmode="numeric" placeholder="0" />`)}
        </div>
      </div>

      <div data-part-block hidden>
        <div class="section-title" style="margin:18px 0 6px"><h3>Detail spare part</h3><span class="xs muted">Bilangan bulat pcs</span></div>
        <div class="form-grid">
          ${field('Spare part', `<select class="select" name="part">${partOptions}</select>`)}
          ${field('Jumlah (pcs)', `<input class="input" name="qtyPcs" inputmode="numeric" placeholder="0" />`)}
          ${field('Harga pokok / pcs', `<input class="input" name="partCost" inputmode="numeric" placeholder="0" />`)}
        </div>
      </div>

      ${field('Alasan / referensi', `<input class="input" name="reason" placeholder="Saldo awal, koreksi hitung, atau barang konsinyasi" required />`, { full: true })}
      <div class="notice notice-warn" style="margin-top:12px">${icon('alert')}<div><strong>Gunakan dengan disiplin.</strong> Penerimaan langsung tidak membuat utang pemasok. Barang dari pemasok tetap harus lewat PO dan penerimaan PO.</div></div>
    `,
    onMount(form) {
      const fabric = form.querySelector('[data-fabric-block]');
      const part = form.querySelector('[data-part-block]');
      const syncKind = () => {
        const isFabric = form.kind.value === 'fabric';
        fabric.hidden = !isFabric;
        part.hidden = isFabric;
        form.fabricCost.value = form.sku.selectedOptions[0]?.dataset.price ?? '';
        form.partCost.value = form.part.selectedOptions[0]?.dataset.price ?? '';
      };
      form.kind.addEventListener('change', syncKind);
      form.sku.addEventListener('change', () => { form.fabricCost.value = form.sku.selectedOptions[0]?.dataset.price ?? ''; });
      form.part.addEventListener('change', () => { form.partCost.value = form.part.selectedOptions[0]?.dataset.price ?? ''; });
      syncKind();
    },
    onSubmit(form, close) {
      const kind = form.kind.value;
      const common = {
        warehouseId: form.warehouse.value,
        ref: form.ref.value,
        date: form.date.value,
        reason: form.reason.value,
        user: ctx.user,
      };
      let result;
      if (kind === 'fabric') {
        const lengthsMm = String(form.lengths.value).split(',').map((s) => s.trim()).filter(Boolean).map((s) => parseM(s));
        if (!lengthsMm.length) throw new Error('Isi minimal satu panjang roll.');
        result = ctx.store.update((db) => receiveAdhocStock(db, {
          ...common,
          kind: 'fabric',
          skuId: form.sku.value,
          lot: form.lot.value,
          lengthsMm,
          unitCost: Number(String(form.fabricCost.value).replace(/\D/g, '')) || 0,
        }));
      } else {
        result = ctx.store.update((db) => receiveAdhocStock(db, {
          ...common,
          kind: 'part',
          partId: form.part.value,
          qtyPcs: Number(form.qtyPcs.value),
          unitCost: Number(String(form.partCost.value).replace(/\D/g, '')) || 0,
        }));
      }
      close();
      const rolls = result.rolls?.length ?? 0;
      toast(rolls ? `${rolls} roll dicatat melalui ${result.receipt.ref}.` : `Stok part dicatat melalui ${result.receipt.ref}.`, { tone: 'success' });
      if (rolls === 1) window.location.hash = `#/stok/${result.rolls[0].id}`;
    },
  });
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
    const rowsEl = document.getElementById('roll-rows');
    const cardsEl = document.getElementById('roll-cards');
    if (rowsEl) rowsEl.innerHTML = rowsHtml(ctx);
    if (cardsEl) cardsEl.innerHTML = cardsHtml(ctx);
    const treeEl = document.getElementById('stock-tree');
    if (treeEl) treeEl.innerHTML = hierarchyInner(ctx);
    const count = ctx.db.rolls.filter((r) => matches(ctx.db, r, { whId: ctx.ui.warehouseId })).length;
    const el = document.getElementById('roll-count');
    if (el) el.textContent = String(count);
    document.querySelectorAll('tr[data-href]').forEach((tr) => {
      tr.addEventListener('click', () => { window.location.hash = tr.dataset.href.replace('#', ''); });
    });
  };

  document.querySelectorAll('[data-stock-view]').forEach((btn) => btn.addEventListener('click', () => {
    stockView = btn.dataset.stockView;
    ctx.store.emit();
  }));
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
  document.querySelector('[data-act="add-stock"]')?.addEventListener('click', () => openAddStock(ctx));
  document.querySelector('[data-action="export"]')?.addEventListener('click', () => {    const { db, ui } = ctx;
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
