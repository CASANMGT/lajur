/** Shared view helpers. */

import { esc, icon } from '../dom.js';
import { byId } from '../../domain/core.js';

export function pageHead({ eyebrow = '', title, sub = '', actions = '' }) {
  return `<div class="page-head">
    <div>
      ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}
      <h1>${esc(title)}</h1>
      ${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>`;
}

export function statCard({ label, value, meta = '', tone = '', iconName = '' }) {
  return `<div class="stat ${tone}">
    <div class="label">${iconName ? icon(iconName) : ''}${esc(label)}</div>
    <div class="value">${value}</div>
    ${meta ? `<div class="meta">${meta}</div>` : ''}
  </div>`;
}

export function warehouseOptions(db, selected, { includeAll = false } = {}) {
  const all = includeAll
    ? `<option value="all" ${selected === 'all' ? 'selected' : ''}>Semua gudang</option>`
    : '';
  return `${all}${db.warehouses
    .map((w) => `<option value="${w.id}" ${selected === w.id ? 'selected' : ''}>${esc(w.code)} Â· ${esc(w.name)}</option>`)
    .join('')}`;
}

export function skuOf(db, id) {
  return byId(db.skus, id);
}

export function skuLabel(db, id) {
  const sku = skuOf(db, id);
  if (!sku) return id ?? 'â€”';
  return `${sku.collectionName} ${sku.colourName || sku.colourCode} (${sku.code})`;
}

export function warehouseOf(db, id) {
  return byId(db.warehouses, id);
}

export function customerOf(db, id) {
  return byId(db.customers, id);
}

const CAPS = {
  operator: [
    'transfer.create', 'transfer.submit', 'transfer.dispatch', 'transfer.receive',
    'opname.start', 'opname.count', 'po.receive', 'stock.view', 'stock.quarantine',
  ],
  sales: [
    'invoice.create', 'invoice.post', 'invoice.pay', 'return.create',
    'project.create', 'project.reserve', 'project.issue', 'project.handover',
    'customer.create', 'customer.edit', 'sample.create', 'deposit.create', 'deposit.apply',
    'stock.view',
  ],
  manager: ['*'],
};

export function can(role, capability) {
  if (role === 'manager') return true;
  return (CAPS[role] ?? []).includes(capability);
}

export function roleHint(role, capability, text) {
  if (can(role, capability)) return '';
  return `<div class="notice notice-info" style="margin-bottom:12px">${icon('alert')}<div><strong>Peran demo.</strong> ${esc(text)}</div></div>`;
}

export function barChart(series) {
  const max = Math.max(...series.map((s) => s.revenue), 1);
  return `<div class="bar-chart" role="img" aria-label="Grafik penjualan ${series.length} bulan terakhir">
    ${series.map((s) => `
      <div class="bar" title="${esc(s.label)}: ${new Intl.NumberFormat('id-ID').format(s.revenue)}">
        <i style="height:${Math.max(3, Math.round((s.revenue / max) * 100))}%"></i>
        <span>${esc(s.label)}</span>
      </div>`).join('')}
  </div>`;
}

export function movementRow(db, m) {
  const roll = m.rollId ? db.rolls.find((r) => r.id === m.rollId) : null;
  const sku = m.skuId ? byId(db.skus, m.skuId) : null;
  const part = m.partId ? byId(db.parts, m.partId) : null;
  const qty = m.qtyMm !== null && m.qtyMm !== undefined
    ? `${m.qtyMm > 0 ? '+' : ''}${(m.qtyMm / 1000).toLocaleString('id-ID')} m`
    : m.qtyPcs !== null && m.qtyPcs !== undefined
      ? `${m.qtyPcs > 0 ? '+' : ''}${m.qtyPcs} pcs`
      : '';
  const label = {
    receive: 'Penerimaan', receive_po: 'Terima PO', sale: 'Penjualan', sale_whole: 'Jual roll utuh',
    cut: 'Potong', transfer_out: 'Kirim transfer', transfer_in: 'Terima transfer', adjust: 'Penyesuaian',
    reserve: 'Reservasi', release: 'Lepas reservasi', return_in: 'Retur masuk', supplier_return: 'Retur pemasok',
    issue_part: 'Keluar part', consume: 'Terpakai', quarantine: 'Karantina', sample: 'Sample',
  }[m.type] ?? m.type;
  return `<li class="${m.type === 'adjust' || m.type === 'quarantine' ? 'warn' : ''}">
    <div class="t-head"><strong>${esc(label)}</strong><span class="mono">${esc(m.ref || 'â€”')}</span><time>${esc(new Date(m.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</time></div>
    <div class="t-body">
      ${roll ? `<a href="#/stok/${roll.id}">${esc(roll.id)}</a> Â· ` : ''}
      ${sku ? `${esc(sku.code)} Â· ${esc(sku.colourName || sku.colourCode)}` : part ? esc(part.name) : ''}
      ${qty ? ` Â· <strong class="num">${esc(qty)}</strong>` : ''}
      ${m.warehouseId ? ` Â· ${esc(byId(db.warehouses, m.warehouseId)?.code ?? m.warehouseId)}` : ''}
      ${m.note ? ` Â· <span class="muted">${esc(m.note)}</span>` : ''}
    </div>
  </li>`;
}
