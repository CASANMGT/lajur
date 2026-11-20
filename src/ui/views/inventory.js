/** Stok & Roll: search, list, roll detail, traceability. */

import { esc, icon, fmt, badge, swatch, toast, openModal, field, printDocument, downloadFile, toCsv, promptText } from '../dom.js';
import { MM_PER_M, byId, formatDateLong, parseM, todayJakarta } from '../../domain/core.js';
import {
  ROLL_STATUS, availableMm, isSellable, partAvailable, quarantineRoll, receiveAdhocStock,
  rollAncestors, rollDescendants, rollHierarchy, rollTrail, skuStockByWarehouse,
  stockOfferLines, stockSummary, summarizeRolls,
} from '../../domain/inventory.js';
import { pageHead, statCard, warehouseOf, can, roleHint, movementRow, warehouseOptions } from './common.js';
import { settingsOf } from '../../domain/settings.js';
import { STOCK_SYNC_META, stockPlanUrl, stockSyncSummary, syncImportedStock } from '../../domain/stock-sync.js';
import { buildStockPlanFromRows } from '../../domain/stock-plan.js';
import { exportBackup } from '../../data/backup.js';
import { readExcelRows } from '../excel.js';
import { printStockTagsHtml } from './print.js';

const filters = { q: '', collection: '', status: 'all', available: true };
let stockView = 'collections';

const CLOSED_ROLL = new Set(['sold', 'consumed', 'void']);
const isClosedRoll = (roll) => CLOSED_ROLL.has(roll.status);

function rollStatus(roll) {
  if (roll.transit) return { label: 'Transit', tone: 'info' };
  return ROLL_STATUS[roll.status] ?? { label: roll.status, tone: 'muted' };
}

/** Available stock first (most available on top), sold/consumed at the bottom. */
function byAvailability(a, b) {
  const closed = Number(isClosedRoll(a)) - Number(isClosedRoll(b));
  if (closed) return closed;
  return availableMm(b) - availableMm(a) || String(b.id).localeCompare(String(a.id));
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
    roll.id, roll.barcode, roll.lot, roll.bin, roll.receiptRef, sku?.code, sku?.colourCode, sku?.colourName,
    sku?.collectionName, sku?.clothType, wh?.code, wh?.name,
  ].some((v) => String(v ?? '').toLowerCase().includes(q));
}

function rowsHtml(ctx) {
  const { db, ui } = ctx;
  const list = db.rolls
    .filter((r) => matches(db, r, { whId: ui.warehouseId }))
    .sort(byAvailability);

  if (!list.length) {
    return `<tr><td colspan="7"><div class="empty">${icon('search')}<strong>Tidak ada roll</strong><p>Ubah kata kunci atau filter gudang.</p></div></td></tr>`;
  }
  const available = list.filter((r) => !isClosedRoll(r));
  const sold = list.filter(isClosedRoll);
  const groupRow = (label, count, mm, tone) => `<tr class="group-row"><td colspan="7"><span class="group-title ${tone}">${label}</span><span class="xs muted">${count} roll · ${fmt.m(mm)} ${tone === 'sold' ? 'tercatat' : 'tersedia'}</span></td></tr>`;
  const total = (rows) => rows.reduce((a, r) => a + (isClosedRoll(r) ? r.currentMm : availableMm(r)), 0);
  const body = [];
  if (available.length) {
    if (sold.length) body.push(groupRow('Stok tersedia', available.length, total(available), 'available'));
    body.push(...available.map(rowHtml).filter(Boolean));
  }
  if (sold.length) {
    body.push(groupRow('Terjual / habis', sold.length, total(sold), 'sold'));
    body.push(...sold.map(rowHtml).filter(Boolean));
  }
  return body.join('');

  function rowHtml(roll) {
    const sku = byId(db.skus, roll.skuId);
    const status = rollStatus(roll);
    const wh = roll.transit ? byId(db.warehouses, roll.transit.toWarehouseId) : byId(db.warehouses, roll.warehouseId);
    const avail = availableMm(roll);
    return `<tr data-href="#/stok/${roll.id}" tabindex="0" role="link">
      <td><span class="mono strong">${esc(roll.id)}</span><div class="xs muted">${esc(roll.lot)}</div><div class="xs mono muted">${esc(roll.barcode || roll.id)}</div></td>
      <td>
        <div class="cell-main">
          ${swatch(sku)}
          <div class="txt">
            <strong>${esc(sku?.collectionName)} ${esc(sku?.colourName || sku?.colourCode || '')}</strong>
            <span>${esc(sku?.motive || sku?.clothType || '')}${sku?.motive || sku?.clothType ? ' · ' : ''}${esc(sku?.code)}${sku?.widthCm ? ` · ${sku.widthCm} cm` : ''}</span>
          </div>
        </div>
      </td>
      <td class="hide-sm">${esc(wh?.code ?? '—')}<div class="xs muted">${esc(roll.bin || '—')}</div></td>
      <td class="num">${fmt.m(roll.currentMm)}</td>
      <td class="num ${roll.reservedMm ? 'strong' : 'muted'}">${roll.reservedMm ? fmt.m(roll.reservedMm) : '—'}</td>
      <td class="num ${avail === 0 ? 'muted' : ''}">${isSellable(roll) ? fmt.m(avail) : '—'}</td>
      <td>${badge(status.label, status.tone)}</td>
    </tr>`;
  }
}

function treeRows(nodes, db) {
  return nodes.map((node) => {
    const roll = node.roll;
    const status = rollStatus(roll);
    const wh = roll.transit ? byId(db.warehouses, roll.transit.toWarehouseId) : byId(db.warehouses, roll.warehouseId);
    return `<div class="tree-node">
      <a class="tree-row" href="#/stok/${esc(roll.id)}">
        <span class="tree-id mono strong">${esc(roll.id)}</span>
        <span class="tree-lot xs muted">Lot ${esc(roll.lot)} · ${esc(roll.barcode || roll.id)} · ${esc(wh?.code ?? '-')}/${esc(roll.bin || '-')}</span>
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
          ${s.availableNodes.length ? `<div class="tree-head" aria-hidden="true">
            <span>Roll</span><span>Lot / lokasi</span><span class="num">Fisik</span><span class="num">Terpesan</span><span class="num">Tersedia</span><span>Status</span>
          </div>
          <div class="tree-nodes">${treeRows(s.availableNodes, db)}</div>` : ''}
          ${s.soldNodes.length ? `<details class="tree-sold">
            <summary><span class="group-title sold">Terjual / habis</span><span class="xs muted">${s.soldNodes.length} induk · ${fmt.m(s.soldNodes.reduce((a, n) => a + n.subtreePhysicalMm, 0))} tercatat</span></summary>
            <div class="tree-head" aria-hidden="true">
              <span>Roll</span><span>Lot / lokasi</span><span class="num">Fisik</span><span class="num">Terpesan</span><span class="num">Tersedia</span><span>Status</span>
            </div>
            <div class="tree-nodes">${treeRows(s.soldNodes, db)}</div>
          </details>` : ''}
        </div>`).join('')}
      </div>
    </details>`;
  }).join('')}</div>`;
}

function collectionsInner(ctx) {
  const { db, ui } = ctx;
  const filtered = db.rolls.filter((r) => matches(db, r, { whId: ui.warehouseId }));
  const groups = rollHierarchy(db, { rolls: filtered })
    .map((group) => ({ ...group, skus: group.skus.filter((s) => s.availableMm > 0) }))
    .filter((group) => group.skus.length > 0 && group.availableMm > 0);
  if (!groups.length) {
    return `<div class="empty">${icon('search')}<strong>Tidak ada koleksi dengan stok</strong><p>Ubah kata kunci atau filter status.</p></div>`;
  }
  return `<div class="stack">${groups.map((group) => {
    const rolls = group.skus.reduce((a, s) => a + s.rollCount, 0);
    return `<details class="card collection-card">
      <summary class="collection-summary">
        <span class="tree-collection-name">${esc(group.name)}</span>
        <span class="xs muted">${group.skus.length} motif · ${rolls} roll</span>
        <span class="small num">${fmt.m(group.availableMm)} tersedia</span>
      </summary>
      <div class="card-pad collection-body">
        ${group.skus.map((s) => `<details class="motif-card">
          <summary class="motif-summary">
            ${swatch(s.sku)}
            <span class="motif-title">
              <strong>${esc(s.sku?.colourName || s.sku?.colourCode || 'Tanpa warna')}</strong>
              <span class="xs muted">${esc(s.sku?.code)} · Warna ${esc(s.sku?.colourCode || '—')} · ${esc(s.sku?.widthCm ?? '—')} cm</span>
            </span>
            <span class="small num">${fmt.m(s.availableMm)} · ${s.rollCount} roll</span>
          </summary>
          <div class="tree-head" aria-hidden="true">
            <span>Roll / lot</span><span>Lot / lokasi</span><span class="num">Fisik</span><span class="num">Terpesan</span><span class="num">Tersedia</span><span>Status</span>
          </div>
          <div class="tree-nodes">${treeRows(s.availableNodes, db)}</div>
        </details>`).join('')}
      </div>
    </details>`;
  }).join('')}</div>`;
}

function topStockStats(ctx) {
  const { db, ui } = ctx;
  const wh = ui.warehouseId === 'all' ? null : ui.warehouseId;
  const lines = stockOfferLines(db, { warehouseId: wh });
  if (!lines.length) return '';
  const collectionMap = new Map();
  for (const line of lines) {
    const key = line.collectionName || 'Tanpa koleksi';
    const row = collectionMap.get(key) ?? { name: key, availableMm: 0, rolls: 0, motifs: 0 };
    row.availableMm += line.availableMm;
    row.rolls += line.rolls.length;
    row.motifs += 1;
    collectionMap.set(key, row);
  }
  const collections = [...collectionMap.values()].sort((a, b) => b.availableMm - a.availableMm).slice(0, 6);
  const motifs = [...lines].sort((a, b) => b.availableMm - a.availableMm).slice(0, 6);
  const maxCollection = collections[0]?.availableMm || 1;
  const maxMotif = motifs[0]?.availableMm || 1;
  const bar = (value, max) => `<span class="stock-bar"><span style="width:${Math.max(2, Math.round((value / max) * 100))}%"></span></span>`;
  return `<div class="grid grid-2 stock-top">
    <section class="card card-pad">
      <div class="card-head" style="padding:0 0 8px;border:0"><div><h2>Top koleksi</h2><p>Berdasarkan meter tersedia.</p></div><span class="badge no-dot">${collections.length}</span></div>
      <div class="stock-top-list">${collections.map((row) => `<div class="stock-top-row">
        <div class="stock-top-label"><strong>${esc(row.name)}</strong><span class="xs muted">${row.motifs} motif · ${row.rolls} roll</span></div>
        <span class="small num">${fmt.m(row.availableMm)}</span>
        ${bar(row.availableMm, maxCollection)}
      </div>`).join('')}</div>
    </section>
    <section class="card card-pad">
      <div class="card-head" style="padding:0 0 8px;border:0"><div><h2>Top motif</h2><p>Motif/warna dengan stok terbanyak.</p></div><span class="badge no-dot">${motifs.length}</span></div>
      <div class="stock-top-list">${motifs.map((line) => `<div class="stock-top-row">
        <div class="stock-top-label"><strong>${esc(line.collectionName)} · ${esc(line.colourName || '—')}</strong><span class="xs muted">${esc(line.code)} · ${line.rolls.length} roll · ${esc(line.widthCm ?? '—')} cm</span></div>
        <span class="small num">${fmt.m(line.availableMm)}</span>
        ${bar(line.availableMm, maxMotif)}
      </div>`).join('')}</div>
    </section>
  </div>`;
}

function cardsHtml(ctx) {
  const { db, ui } = ctx;
  const list = db.rolls
    .filter((r) => matches(db, r, { whId: ui.warehouseId }))
    .sort(byAvailability);
  if (!list.length) return `<div class="empty">${icon('search')}<strong>Tidak ada roll</strong><p>Ubah kata kunci atau filter gudang.</p></div>`;
  const available = list.filter((r) => !isClosedRoll(r));
  const sold = list.filter(isClosedRoll);
  const head = (label, count, mm, tone) => `<div class="stock-group-head"><span class="group-title ${tone}">${label}</span><span class="xs muted">${count} roll · ${fmt.m(mm)}</span></div>`;
  const card = (roll) => {
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
  };
  const out = [];
  if (available.length) {
    if (sold.length) out.push(head('Stok tersedia', available.length, available.reduce((a, r) => a + availableMm(r), 0), 'available'));
    out.push(...available.map(card));
  }
  if (sold.length) {
    out.push(head('Terjual / habis', sold.length, sold.reduce((a, r) => a + r.currentMm, 0), 'sold'));
    out.push(...sold.map(card));
  }
  return out.join('');
}

function summaryStrip(ctx) {
  const { db, ui } = ctx;
  const wh = ui.warehouseId === 'all' ? null : ui.warehouseId;
  const s = stockSummary(db, { warehouseId: wh });
  const partsQty = db.partStock
    .filter((p) => !wh || p.warehouseId === wh)
    .reduce((a, p) => a + p.qty, 0);
  const threshold = settingsOf(db).lowStockMm ?? 10000;
  const availableRolls = db.rolls.filter((roll) => (!wh || roll.warehouseId === wh) && availableMm(roll) > 0);
  const availableCollectionIds = new Set(availableRolls.map((roll) => byId(db.skus, roll.skuId)?.collectionId).filter(Boolean));
  const availableMotifIds = new Set(availableRolls.map((roll) => roll.skuId).filter(Boolean));
  const lowSkus = db.skus.filter((sku) => {
    const rolls = db.rolls.filter((r) => r.skuId === sku.id && (!wh || r.warehouseId === wh) && !r.transit && ['available', 'quarantine'].includes(r.status));
    const physical = rolls.reduce((a, r) => a + r.currentMm, 0);
    const available = rolls.reduce((a, r) => a + availableMm(r), 0);
    return physical > 0 && available < threshold;
  }).length;
  return `<div class="grid grid-4" style="margin-bottom:16px">
    ${statCard({ label: 'Fisik', value: fmt.m(s.physicalMm), meta: `${s.count} roll di lokasi` })}
    ${statCard({ label: 'Tersedia', value: fmt.m(s.availableMm), meta: 'Bisa dijual / dikirim', tone: 'accent' })}
    ${statCard({ label: 'Roll tersedia', value: availableRolls.length.toLocaleString('id-ID'), meta: `${availableMotifIds.size} motif`, iconName: 'spool' })}
    ${statCard({ label: 'Koleksi berstok', value: String(availableCollectionIds.size), meta: `${availableMotifIds.size} motif aktif`, iconName: 'layers' })}
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
  const synced = db.meta?.stockSync;
  const canSync = role === 'manager' && !synced;
  return `
    ${pageHead({
      eyebrow: 'Persediaan',
      title: 'Stok & Roll',
      sub: 'Setiap panjang adalah roll fisik. Saldo tersedia = fisik − reservasi, dan transit tidak dihitung di gudang mana pun.',
      actions: `${can(role, 'stock.add') ? `<button class="btn btn-primary" type="button" data-act="add-stock">${icon('plus')} Tambah stok manual</button>` : ''}
        <a class="btn" href="#/pembelian">${icon('truck')} Terima PO</a>
        ${can(role, 'stock.view') ? `<button class="btn" type="button" data-act="print-tags">${icon('printer')} Tag A4</button><button class="btn" type="button" data-act="share-stock">${icon('phone')} Info stok WA</button><button class="btn" type="button" data-action="export">${icon('download')} CSV</button>` : ''}
        ${canSync ? `<button class="btn" type="button" data-act="sync-stock">${icon('upload')} Sinkron stok 13 Nov</button>` : ''}
        ${role === 'manager' ? `<button class="btn" type="button" data-act="import-stock">${icon('upload')} Impor Excel</button>` : ''}`,
    })}
    ${synced
      ? `<div class="notice notice-teal" style="margin-bottom:12px">${icon('checkCircle')}<div><strong>Stok ${esc(synced.date)} sudah disinkronkan.</strong> ${Number(synced.rolls).toLocaleString('id-ID')} roll · ${Number(synced.metres).toLocaleString('id-ID')} m · ${synced.samples} sample · ${synced.archivedRolls} roll lama diarsipkan. Sumber: ${esc(synced.source)}.</div></div>`
      : canSync
        ? `<div class="notice notice-warn" style="margin-bottom:12px">${icon('upload')}<div><strong>Stok Excel 13 Nov 2026 siap disinkronkan.</strong> ${STOCK_SYNC_META.skus} SKU · ${Number(STOCK_SYNC_META.rolls).toLocaleString('id-ID')} roll · ${Number(STOCK_SYNC_META.metres).toLocaleString('id-ID')} m · ${STOCK_SYNC_META.samples} sample. Tinjau ringkasan sebelum mengganti stok.</div></div>`
        : ''}
    ${summaryStrip(ctx)}
    ${topStockStats(ctx)}
    <div class="filterbar">
      <div class="search">
        ${icon('search')}
        <input class="input" id="roll-search" type="search" placeholder="Cari roll, barcode, lot, warna, rak…" value="${esc(filters.q)}" aria-label="Cari roll atau barcode" />
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
      ${[['collections', 'Koleksi'], ['tree', 'Hierarki koleksi'], ['list', 'Daftar roll']].map(([key, label]) => `<button class="chip" type="button" data-stock-view="${key}" aria-pressed="${stockView === key}">${label}</button>`).join('')}
    </div>
    ${stockView === 'collections'
      ? `<div id="stock-collections">${collectionsInner(ctx)}</div>`
      : stockView === 'tree'
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
  const cutHistory = db.movements
    .filter((m) => (m.rollId === roll.id || m.parentRollId === roll.id)
      && m.beforeMm != null && m.afterMm != null && m.afterMm < m.beforeMm)
    .slice()
    .sort((a, b) => String(b.at ?? b.date).localeCompare(String(a.at ?? a.date)));
  const totalCutMm = cutHistory.reduce((a, m) => a + (Number(m.qtyMm) || 0), 0);
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
        <p class="sub">${esc(sku?.collectionName)} · ${esc(sku?.motive || sku?.clothType || '')} · ${esc(sku?.colourName || sku?.colourCode || '')} · Lot ${esc(roll.lot)} · QR <span class="mono">${esc(roll.barcode || roll.id)}</span></p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" data-action="print-label">${icon('printer')} Tag stok / QR</button>
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
            <div><div class="xs muted">Total dipotong</div><div class="strong num">${fmt.m(totalCutMm)}</div></div>
            <div><div class="xs muted">Sisa roll (stok aktual)</div><div class="strong num" style="font-size:1.25rem">${fmt.m(roll.currentMm)}</div></div>
            <div><div class="xs muted">Tersedia</div><div class="strong num">${isSellable(roll) ? fmt.m(avail) : '—'}</div></div>
            <div><div class="xs muted">Terpesan</div><div class="strong num">${roll.reservedMm ? fmt.m(roll.reservedMm) : '—'}</div></div>
            <div><div class="xs muted">Harga pokok / m</div><div class="strong num">${showCost ? fmt.money(roll.costPerM) : '—'}</div></div>
            <div><div class="xs muted">Gudang / rak</div><div class="strong">${esc(wh?.code ?? '—')} · ${esc(roll.bin || '—')}</div></div>
          </div>
          ${roll.reservedMm ? `<div class="notice notice-warn" style="margin-top:12px">${icon('clock')}<div><strong>${fmt.m(roll.reservedMm)} terpesan.</strong> ${esc((roll.reservations ?? []).map((r) => `${r.ref} (${fmt.m(r.qtyMm)})`).join(', '))}</div></div>` : ''}
          ${roll.transit ? `<div class="notice notice-info" style="margin-top:12px">${icon('truck')}<div><strong>Dalam perjalanan</strong> dari ${esc(warehouseOf(db, roll.transit.fromWarehouseId)?.name)} ke ${esc(warehouseOf(db, roll.transit.toWarehouseId)?.name)}. Tidak dihitung sebagai stok di gudang mana pun.</div></div>` : ''}
        </section>

        <section class="card">
          <div class="card-head"><div><h2>Riwayat potong & sisa roll</h2><p>Setiap potongan, referensi dokumen, dan sisa meter setelah potong.</p></div><span class="badge no-dot">${cutHistory.length} potong</span></div>
          <div class="card-pad">
            <div class="row-between" style="margin-bottom:10px"><span class="small muted">Sisa saat ini</span><strong class="num">${fmt.m(roll.currentMm)}</strong></div>
            ${cutHistory.length ? `<div class="table-wrap"><table class="data">
              <thead><tr><th>Tanggal</th><th class="num">Potong</th><th class="num">Sebelum</th><th class="num">Sisa setelah</th><th>Referensi</th><th>Oleh / catatan</th></tr></thead>
              <tbody>${cutHistory.map((m) => `<tr>
                <td class="small">${esc(formatDateLong(m.date))}<div class="xs muted">${esc(String(m.at ?? '').slice(0, 10))}</div></td>
                <td class="num strong">${fmt.m(m.qtyMm)}</td>
                <td class="num">${m.beforeMm != null ? fmt.m(m.beforeMm) : '—'}</td>
                <td class="num strong">${m.afterMm != null ? fmt.m(m.afterMm) : '—'}</td>
                <td class="small mono">${esc(m.ref || '—')}</td>
                <td class="small">${esc(m.userName || m.userId || '—')}<div class="xs muted">${esc(m.note || '')}</div></td>
              </tr>`).join('')}</tbody>
            </table></div>` : `<div class="empty" style="padding:18px">${icon('cut')}<strong>Belum ada potongan</strong><p>Roll masih utuh ${fmt.m(roll.currentMm)}.</p></div>`}
          </div>
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
          ${field('Panjang roll (m, pisah koma)', `<input class="input" name="lengths" inputmode="decimal" placeholder="60, 61,2" />`, { full: true, hint: 'Default koleksi 60 m × 300 cm. Jangan memasukkan rata-rata. Satu angka = satu roll fisik.' })}
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

function openPrintTags(ctx, roll = null) {
  const db = ctx.db;
  const collections = db.collections.filter((c) => (db.skus ?? []).some((s) => s.collectionId === c.id));
  const orderRolls = (list) => [...list].sort((a, b) => {
    if (roll) {
      if (a.id === roll.id) return -1;
      if (b.id === roll.id) return 1;
    }
    const skuA = byId(db.skus, a.skuId);
    const skuB = byId(db.skus, b.skuId);
    return String(skuA?.collectionName ?? '').localeCompare(String(skuB?.collectionName ?? ''))
      || String(skuA?.colourName || skuA?.colourCode || '').localeCompare(String(skuB?.colourName || skuB?.colourCode || ''))
      || a.id.localeCompare(b.id);
  });
  const allRolls = orderRolls(db.rolls ?? []);
  const preselected = new Set(roll ? [roll.id] : []);
  const choices = allRolls.map((item) => {
    const sku = byId(db.skus, item.skuId);
    const status = rollStatus(item);
    const search = [
      item.id, item.barcode, item.lot, sku?.collectionName, sku?.motive, sku?.colourName, sku?.colourCode, sku?.code,
    ].map((value) => String(value ?? '').toLowerCase()).join(' ');
    return `<label class="roll-pick" data-search="${esc(search)}">
      <input type="checkbox" name="rollIds" value="${esc(item.id)}" ${preselected.has(item.id) ? 'checked' : ''} />
      <span class="roll-pick-main">
        <strong class="mono">${esc(item.id)}</strong>
        <span>${esc(sku?.collectionName ?? '—')} ${esc(sku?.colourName || sku?.colourCode || '')} · ${esc(sku?.code ?? '')}</span>
        <span class="xs muted">Lot ${esc(item.lot)} · ${esc(item.barcode || item.id)}</span>
      </span>
      <span class="roll-pick-meta"><strong>${fmt.m(availableMm(item))}</strong> tersedia<span>${esc(status.label)}</span></span>
    </label>`;
  }).join('');
  openModal({
    title: 'Cetak tag stok A4',
    description: 'Pilih satu atau beberapa roll, lalu cetak. Setiap lembar A4 memuat 8 tag (2 kolom × 4 baris).',
    submitLabel: 'Cetak A4',
    wide: true,
    body: `<div class="form-grid">
      ${field('Cakupan', `<select class="select" name="scope">
        <option value="selected">Roll terpilih</option>
        <option value="collection">Semua roll dalam koleksi</option>
        <option value="available">Semua roll tersedia</option>
      </select>`)}
      ${field('Koleksi / motif', `<select class="select" name="collection">${collections.map((c) => `<option value="${c.id}">${esc(c.name)} · ${esc(c.motive || c.clothType)}</option>`).join('')}</select>`, { hint: 'Dipakai untuk cakupan “semua roll dalam koleksi”.' })}
      ${field('Ulangi tiap tag', `<input class="input" type="number" name="copies" min="1" max="40" value="1" />`, { hint: 'Jumlah salinan per roll. A4 menampung 8 tag.' })}
      ${field('PIC cetak', `<input class="input" name="pic" value="${esc(ctx.user?.name ?? '')}" placeholder="Nama PIC" />`)}
      ${field('Tanggal cetak', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
      ${field('Roll terjual/habis', `<label class="checkline"><input type="checkbox" name="includeSold" /> Sertakan roll yang sudah habis/terjual</label>`, { full: true })}
      <div class="span-2">
        <div class="field">
          <label for="tag-roll-search">Pilih roll</label>
          <div class="roll-picker-tools">
            <input class="input" id="tag-roll-search" name="rollSearch" type="search" placeholder="Cari roll, warna, lot, barcode…" />
            <button class="btn btn-sm" type="button" data-pick-visible>Pilih terlihat</button>
            <button class="btn btn-sm btn-ghost" type="button" data-pick-clear>Kosongkan</button>
          </div>
          <div class="roll-picker" data-roll-picker>${choices || '<p class="xs muted" style="padding:8px">Belum ada roll.</p>'}</div>
          <p class="xs muted" data-roll-summary></p>
        </div>
      </div>
    </div>`,
    onMount(form) {
      const picker = form.querySelector('[data-roll-picker]');
      const tools = form.querySelector('.roll-picker-tools');
      const summary = form.querySelector('[data-roll-summary]');
      const rows = Array.from(picker.querySelectorAll('.roll-pick'));
      const collectionField = form.collection.closest('.field');
      const soldField = form.includeSold.closest('.field');
      const checked = () => Array.from(picker.querySelectorAll('input[name="rollIds"]:checked'));
      const collectionRolls = () => {
        const skuIds = new Set((db.skus ?? []).filter((s) => s.collectionId === form.collection.value).map((s) => s.id));
        return (db.rolls ?? []).filter((item) => skuIds.has(item.skuId)
          && (form.includeSold.checked || availableMm(item) > 0));
      };
      const refresh = () => {
        const scope = form.scope.value;
        const manual = scope === 'selected';
        picker.hidden = !manual;
        tools.hidden = !manual;
        collectionField.style.display = scope === 'collection' ? '' : 'none';
        soldField.style.display = manual ? 'none' : '';
        const copies = Math.max(1, Math.min(40, Number(form.copies.value) || 1));
        if (manual) {
          const count = checked().length;
          summary.textContent = count
            ? `${count} roll dipilih × ${copies} salinan = ${count * copies} tag · ${Math.ceil((count * copies) / 8)} halaman A4.`
            : 'Belum ada roll dipilih. Centang roll di daftar atau pakai “Pilih terlihat”.';
        } else {
          const count = scope === 'collection' ? collectionRolls().length : (db.rolls ?? []).filter((item) => availableMm(item) > 0).length;
          summary.textContent = `${count} roll akan dicetak × ${copies} salinan = ${count * copies} tag · ${Math.ceil((count * copies) / 8)} halaman A4.`;
        }
      };
      const filterRows = () => {
        const query = form.rollSearch.value.trim().toLowerCase();
        for (const row of rows) row.hidden = Boolean(query) && !row.dataset.search.includes(query);
      };
      form.scope.addEventListener('change', refresh);
      form.collection.addEventListener('change', refresh);
      form.copies.addEventListener('input', refresh);
      form.includeSold.addEventListener('change', refresh);
      form.rollSearch.addEventListener('input', filterRows);
      picker.addEventListener('change', refresh);
      form.querySelector('[data-pick-visible]').addEventListener('click', () => {
        for (const row of rows) {
          if (!row.hidden) row.querySelector('input').checked = true;
        }
        refresh();
      });
      form.querySelector('[data-pick-clear]').addEventListener('click', () => {
        for (const row of rows) row.querySelector('input').checked = false;
        refresh();
      });
      refresh();
    },
    onSubmit(form, close) {
      const scope = form.scope.value;
      let rolls = [];
      if (scope === 'selected') {
        const ids = Array.from(form.querySelectorAll('input[name="rollIds"]:checked')).map((input) => input.value);
        const byIdMap = new Map((db.rolls ?? []).map((item) => [item.id, item]));
        rolls = orderRolls(ids.map((id) => byIdMap.get(id)).filter(Boolean));
      } else if (scope === 'collection') {
        const skuIds = new Set((db.skus ?? []).filter((s) => s.collectionId === form.collection.value).map((s) => s.id));
        rolls = orderRolls((db.rolls ?? []).filter((item) => skuIds.has(item.skuId)
          && (form.includeSold.checked || availableMm(item) > 0)));
      } else {
        rolls = orderRolls((db.rolls ?? []).filter((item) => availableMm(item) > 0));
      }
      if (!rolls.length) throw new Error('Pilih minimal satu roll untuk dicetak.');
      const copies = Math.max(1, Math.min(40, Number(form.copies.value) || 1));
      printDocument('Tag stok A4', printStockTagsHtml(db, rolls, {
        copies,
        pic: String(form.pic?.value ?? '').trim(),
        date: form.date?.value || todayJakarta(),
      }), { plain: true });
      close();
      toast(`${rolls.length} roll × ${copies} salinan disiapkan · ${Math.ceil((rolls.length * copies) / 8)} halaman A4.`, { tone: 'success' });
    },
  });
}

async function openStockSync(ctx) {
  if (ctx.role !== 'manager') {
    toast('Sinkron stok hanya dapat dilakukan manajer.', { tone: 'error' });
    return;
  }
  let plan;
  try {
    const response = await fetch(stockPlanUrl(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    plan = await response.json();
  } catch (err) {
    toast(`Rencana stok tidak dapat dimuat: ${err.message}`, { tone: 'error' });
    return;
  }
  const summary = stockSyncSummary(ctx.db, plan);
  openModal({
    title: `Sinkron stok ${summary.date}`,
    description: 'Tinjau ringkasan sebelum mengganti stok tersedia. Stok lama diarsipkan, bukan dihapus.',
    submitLabel: 'Sinkronkan sekarang',
    wide: true,
    body: `<div class="stack-sm">
      <div class="notice notice-warn">${icon('alert')}<div><strong>Stok tersedia akan diganti.</strong> ${summary.currentRolls} roll lama akan diarsipkan (status void). Invoice, proyek, dan riwayat pergerakan tetap tersimpan.</div></div>
      <div class="grid grid-3" style="margin:10px 0">
        ${statCard({ label: 'SKU', value: String(summary.skus), meta: `${summary.collections} koleksi` })}
        ${statCard({ label: 'Roll', value: Number(summary.rolls).toLocaleString('id-ID'), meta: `${Number(summary.metres).toLocaleString('id-ID')} m`, tone: 'accent' })}
        ${statCard({ label: 'Buku sample', value: String(summary.samples), meta: `${Number(summary.sampleMetres).toLocaleString('id-ID')} m sample` })}
      </div>
      <div class="meta">
        <div><span>Sumber</span><strong>${esc(summary.source)}</strong></div>
        <div><span>Gudang</span><strong>${esc(summary.warehouse)}</strong></div>
        <div><span>Lot / penerimaan</span><strong class="mono">STOK-13NOV2026</strong></div>
        <div><span>Harga</span><strong>Rp 0 (isi setelah sinkron)</strong></div>
        <div><span>Dikecualikan</span><strong>BIAYA, FOLDER</strong></div>
        <div><span>PROFLEX BEIGE</span><strong>200 m sesuai rincian roll</strong></div>
      </div>
      <label class="checkline"><input type="checkbox" name="confirm" required /> Saya sudah memeriksa ringkasan dan ingin mengganti stok tersedia dengan data 13 Nov 2026.</label>
    </div>`,
    onSubmit(form, close) {
      if (!form.confirm.checked) throw new Error('Centang konfirmasi sebelum sinkron.');
      const result = ctx.store.update((db) => syncImportedStock(db, {
        plan,
        warehouseId: plan.warehouseId,
        user: ctx.user,
      }));
      close();
      toast(`Sinkron selesai: ${result.rolls.toLocaleString('id-ID')} roll · ${result.metres.toLocaleString('id-ID')} m · ${result.samples} sample.`, { tone: 'success' });
    },
  });
}

async function openStockImport(ctx) {
  if (ctx.role !== 'manager') {
    toast('Impor stok hanya dapat dilakukan manajer.', { tone: 'error' });
    return;
  }
  let rows = null;
  let plan = null;
  openModal({
    title: 'Impor stok dari Excel',
    description: 'Upload stok lama/baru, pilih tanggal stok, baca file, lalu sinkronkan. Unduh backup dulu jika perlu.',
    submitLabel: 'Sinkronkan',
    wide: true,
    body: `<div class="form-grid">
      ${field('Tanggal stok', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`, { hint: 'Tanggal data stok pada file Excel.' })}
      ${field('File Excel', `<input class="input" type="file" name="file" accept=".xlsx,.xls" />`, { hint: 'Format kolom: NAMA WARNA + STOK_PER_ROLL. Maksimal 10 MB.' })}
      <div class="span-2 row" style="margin:4px 0">
        <button class="btn btn-sm" type="button" data-read-excel>${icon('upload')} Baca Excel</button>
        <button class="btn btn-sm btn-ghost" type="button" data-download-backup>${icon('download')} Unduh backup database</button>
      </div>
      <div class="span-2" data-import-status></div>
      <div class="span-2" data-import-summary></div>
      <label class="checkline span-2"><input type="checkbox" name="confirm" /> Saya sudah memeriksa pratinjau dan ingin mengganti stok tersedia.</label>
    </div>`,
    onMount(form) {
      const status = form.querySelector('[data-import-status]');
      const summary = form.querySelector('[data-import-summary]');
      const show = (html, tone = 'info') => {
        status.className = `notice notice-${tone}`;
        status.innerHTML = `${icon(tone === 'warn' ? 'alert' : tone === 'teal' ? 'checkCircle' : 'upload')}<div>${html}</div>`;
      };
      const draw = () => {
        if (!plan) {
          summary.innerHTML = '';
          return;
        }
        const s = stockSyncSummary(ctx.db, plan);
        summary.innerHTML = `<div class="grid grid-3" style="margin:8px 0">
          ${statCard({ label: 'SKU', value: String(s.skus), meta: `${s.collections} koleksi` })}
          ${statCard({ label: 'Roll', value: Number(s.rolls).toLocaleString('id-ID'), meta: `${Number(s.metres).toLocaleString('id-ID')} m`, tone: 'accent' })}
          ${statCard({ label: 'Sample', value: String(s.samples), meta: `${Number(s.sampleMetres).toLocaleString('id-ID')} m` })}
        </div>
        <div class="xs muted">Sumber: ${esc(plan.source)} · tanggal ${esc(plan.date)} · ${s.currentRolls} roll lama akan diarsipkan.</div>`;
      };
      const build = () => {
        if (!rows) return;
        try {
          plan = buildStockPlanFromRows(rows, {
            date: form.date.value,
            source: form.file.files?.[0]?.name ?? 'Upload Excel',
          });
          draw();
          show(`File terbaca. Siap disinkronkan sebagai stok ${esc(plan.date)}.`, 'teal');
        } catch (err) {
          plan = null;
          draw();
          show(`File belum dapat dibaca: ${esc(err.message)}`, 'warn');
        }
      };
      const read = async () => {
        const file = form.file.files?.[0];
        if (!file) {
          show('Pilih file Excel terlebih dahulu.', 'warn');
          return;
        }
        const months = { JANUARI: 1, FEBRUARI: 2, MARET: 3, APRIL: 4, MEI: 5, JUNI: 6, JULI: 7, AGUSTUS: 8, SEPTEMBER: 9, OKTOBER: 10, NOVEMBER: 11, DESEMBER: 12 };
        const dateMatch = file.name.toUpperCase().match(/(\d{1,2})\s+(JANUARI|FEBRUARI|MARET|APRIL|MEI|JUNI|JULI|AGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DESEMBER)\s+(\d{4})/);
        if (dateMatch) {
          const day = String(dateMatch[1]).padStart(2, '0');
          const month = String(months[dateMatch[2]]).padStart(2, '0');
          form.date.value = `${dateMatch[3]}-${month}-${day}`;
        }
        show('Membaca file Excel…', 'info');
        try {
          rows = await readExcelRows(file);
          build();
        } catch (err) {
          rows = null;
          plan = null;
          draw();
          show(`Gagal membaca Excel: ${esc(err.message)}`, 'warn');
        }
      };
      form.file.addEventListener('change', read);
      form.date.addEventListener('change', () => { if (rows) build(); });
      form.querySelector('[data-read-excel]').addEventListener('click', read);
      form.querySelector('[data-download-backup]').addEventListener('click', () => {
        const backup = exportBackup(ctx.db);
        downloadFile(`lavishome-backup-${backup.dataset}-${todayJakarta()}.json`, JSON.stringify(backup, null, 2));
        toast('Backup database diunduh.', { tone: 'success' });
      });
      show('Pilih file Excel, lalu klik “Baca Excel” untuk melihat pratinjau.', 'info');
    },
    onSubmit(form, close) {
      if (!plan) throw new Error('Baca file Excel dan periksa pratinjau terlebih dahulu.');
      if (!form.confirm.checked) throw new Error('Centang konfirmasi sebelum sinkron.');
      const result = ctx.store.update((db) => syncImportedStock(db, {
        plan,
        warehouseId: plan.warehouseId,
        user: ctx.user,
      }));
      close();
      toast(`Sinkron ${result.date} selesai: ${result.rolls.toLocaleString('id-ID')} roll · ${result.metres.toLocaleString('id-ID')} m.`, { tone: 'success' });
    },
  });
}

export function openStockShare(ctx, { customerId = null } = {}) {
  const { db } = ctx;
  const customers = (db.customers ?? []).filter((c) => c.stage !== 'dormant');
  if (!customers.length) {
    toast('Belum ada pelanggan dengan nomor WhatsApp.', { tone: 'error' });
    return;
  }
  const warehouseId = ctx.ui.warehouseId && ctx.ui.warehouseId !== 'all' ? ctx.ui.warehouseId : null;
  const lines = stockOfferLines(db, { warehouseId });
  const totalFor = (name) => lines.filter((line) => line.collectionName === name).reduce((sum, line) => sum + line.availableMm, 0);
  const collectionNames = [...new Set(lines.map((line) => line.collectionName))]
    .sort((a, b) => totalFor(b) - totalFor(a) || a.localeCompare(b));
  if (!collectionNames.length) {
    toast('Belum ada stok tersedia untuk dibagikan.', { tone: 'error' });
    return;
  }
  const initialCollection = collectionNames[0];
  const selectedValues = (select) => Array.from(select?.selectedOptions ?? []).map((option) => option.value).filter(Boolean);
  const motifsFor = (names) => lines
    .filter((line) => !names.length || names.includes(line.collectionName))
    .sort((a, b) => a.collectionName.localeCompare(b.collectionName) || b.availableMm - a.availableMm || a.colourName.localeCompare(b.colourName));
  const buildMessage = (customer, collectionNamesSelected, motifIds = []) => {
    const visible = lines.filter((line) => (
      (!collectionNamesSelected.length || collectionNamesSelected.includes(line.collectionName))
      && (!motifIds.length || motifIds.includes(line.skuId))
    ));
    const scope = motifIds.length
      ? `${motifIds.length} motif${collectionNamesSelected.length ? ` · ${collectionNamesSelected.join(', ')}` : ''}`
      : collectionNamesSelected.length
        ? `${collectionNamesSelected.join(', ')} · semua motif`
        : 'semua koleksi';
    if (!visible.length) return `Halo ${customer?.name ?? 'Bapak/Ibu'}, stok ${scope} sedang tidak tersedia. Kami akan menghubungi kembali setelah restock.`;
    return [
      `Halo ${customer?.name ?? 'Bapak/Ibu'}, berikut stok ${scope} yang tersedia${warehouseId ? ` di ${warehouseOf(db, warehouseId)?.name ?? warehouseId}` : ''}:`,
      '',
      ...visible.map((line) => `• ${line.collectionName} (${line.clothType}) — ${line.colourName} ${line.widthCm} cm: ${(line.availableMm / MM_PER_M).toLocaleString('id-ID')} m (${line.rolls.length} roll) · ${fmt.money(line.sellPrice)}/m`),
      '',
      'Harga dapat berubah; balas WA ini untuk sample, penawaran, atau cek warna fisik. — Lavishome',
    ].join('\n');
  };
  const initial = customers.find((c) => c.id === customerId) ?? customers[0];
  const users = customers.map((c) => `<option value="${c.id}" data-wa="${esc(c.whatsapp || c.phone || '')}" ${c.id === initial.id ? 'selected' : ''}>${esc(c.name)}${c.company ? ` - ${esc(c.company)}` : ''} · WA ${esc(c.whatsapp || c.phone || '—')}</option>`).join('');
  const collectionOptions = collectionNames.map((name) => `<option value="${esc(name)}" ${name === initialCollection ? 'selected' : ''}>${esc(name)}</option>`).join('');
  const openModalBody = `<div class="form-grid">
      ${field('Pelanggan', `<select class="select" name="customer">${users}</select>`, { full: true })}
      ${field('Koleksi', `<select class="select" name="collection" multiple size="6">${collectionOptions}</select>`, { hint: 'Bisa pilih beberapa koleksi (Ctrl/Cmd + klik).' })}
      ${field('Motif / warna', `<select class="select" name="motif" multiple size="8"></select>`, { hint: 'Bisa pilih beberapa motif. Kosongkan untuk semua motif dari koleksi terpilih.' })}
      <div class="span-2" data-stock-summary></div>
      ${field('Pesan stok', `<textarea class="textarea" name="message" rows="11"></textarea>`, { full: true, hint: 'Bisa diedit sebelum dikirim.' })}
      <div class="span-2 row" style="margin-top:10px">
        <button class="btn" type="button" data-copy-wa>Salin pesan</button>
        <a class="btn btn-primary" data-open-wa href="#" target="_blank" rel="noopener">Buka WhatsApp</a>
      </div>
    </div>`;
  openModal({
    title: 'Info stok via WhatsApp',
    description: 'Pilih koleksi → motif → lihat jumlah roll tersedia, lalu salin atau buka WhatsApp.',
    submitLabel: 'Selesai',
    wide: true,
    body: openModalBody,
    onMount(form) {
      const customer = () => customers.find((c) => c.id === form.customer.value) ?? initial;
      const phone = (c) => String(c.whatsapp || c.phone || '').replace(/\D/g, '').replace(/^0/, '62');
      const summaryBox = form.querySelector('[data-stock-summary]');
      const motifOptions = (names, selected = []) => motifsFor(names).map((line) => `<option value="${esc(line.skuId)}" ${selected.includes(line.skuId) ? 'selected' : ''}>${esc(line.collectionName)} · ${esc(line.colourName || '—')} · ${esc(line.widthCm)} cm · ${(line.availableMm / MM_PER_M).toLocaleString('id-ID')} m</option>`).join('');
      const currentCollections = () => selectedValues(form.collection);
      const currentMotifs = () => selectedValues(form.motif);
      const updateSummary = () => {
        const names = currentCollections();
        const motifIds = currentMotifs();
        const visible = lines.filter((line) => (
          (!names.length || names.includes(line.collectionName))
          && (!motifIds.length || motifIds.includes(line.skuId))
        ));
        const metres = visible.reduce((a, line) => a + line.availableMm, 0);
        const rolls = visible.reduce((a, line) => a + line.rolls.length, 0);
        const label = motifIds.length
          ? `${names.length ? `${names.join(', ')} · ` : ''}${motifIds.length} motif dipilih`
          : names.length ? `${names.join(', ')} · semua motif` : 'Semua koleksi';
        summaryBox.innerHTML = `<div class="notice notice-teal">${icon('box')}<div><strong>${esc(label)}</strong> — ${rolls} roll · ${(metres / MM_PER_M).toLocaleString('id-ID')} m tersedia.</div></div>`;
      };
      const update = () => {
        const c = customer();
        form.message.value = buildMessage(c, currentCollections(), currentMotifs());
        form.querySelector('[data-open-wa]').href = phone(c)
          ? `https://wa.me/${phone(c)}?text=${encodeURIComponent(form.message.value)}`
          : '#';
        updateSummary();
      };
      const syncMotifs = () => {
        const previous = currentMotifs();
        form.motif.innerHTML = motifOptions(currentCollections(), previous);
        const available = new Set([...form.motif.options].map((option) => option.value));
        for (const option of form.motif.options) option.selected = previous.includes(option.value) && available.has(option.value);
        update();
      };
      form.motif.innerHTML = motifOptions(currentCollections());
      form.customer.addEventListener('change', update);
      form.collection.addEventListener('change', syncMotifs);
      form.motif.addEventListener('change', update);
      form.message.addEventListener('input', () => {
        const p = phone(customer());
        form.querySelector('[data-open-wa]').href = p ? `https://wa.me/${p}?text=${encodeURIComponent(form.message.value)}` : '#';
      });
      form.querySelector('[data-copy-wa]').addEventListener('click', async () => {
        const text = form.message.value;
        try {
          await navigator.clipboard.writeText(text);
          toast('Pesan stok disalin. Tempel di WhatsApp.', { tone: 'success' });
        } catch {
          form.message.select();
          document.execCommand('copy');
          toast('Pesan stok disalin.', { tone: 'success' });
        }
      });
      form.querySelector('[data-open-wa]').addEventListener('click', (e) => {
        if (!phone(customer())) {
          e.preventDefault();
          toast('Pelanggan belum punya nomor WhatsApp.', { tone: 'error' });
        }
      });
      update();
    },
    onSubmit(form, close) { close(); },
  });
}

export function mount(ctx) {
  if (ctx.route.id) {
    document.querySelector('[data-action="print-label"]')?.addEventListener('click', () => {
      const roll = ctx.db.rolls.find((r) => r.id === ctx.route.id);
      if (roll) openPrintTags(ctx, roll);
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
    Object.assign(filters, { q: '', collection: '', status: 'all', available: true });
    window.location.hash = '#/stok';
    // Force a full view re-render via store emit.
    ctx.store.emit();
  });
  document.querySelector('[data-act="print-tags"]')?.addEventListener('click', () => openPrintTags(ctx));
  document.querySelector('[data-act="share-stock"]')?.addEventListener('click', () => openStockShare(ctx));
  document.querySelectorAll('[data-act="sync-stock"]').forEach((button) => button.addEventListener('click', () => openStockSync(ctx)));
  document.querySelectorAll('[data-act="import-stock"]').forEach((button) => button.addEventListener('click', () => openStockImport(ctx)));
  document.querySelector('[data-act="add-stock"]')?.addEventListener('click', () => openAddStock(ctx));
  if (ctx.route.query?.add && can(ctx.role, 'stock.add')) {
    history.replaceState(null, '', '#/stok');
    openAddStock(ctx);
  }
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
    downloadFile(`lavishome-stok-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), 'text/csv');
  });
}
