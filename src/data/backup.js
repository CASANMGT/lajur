/**
 * Backup / restore with referential validation.
 *
 * A restore is rejected unless every reference resolves. This protects against
 * half-written local storage and hand-edited JSON, which is the realistic risk
 * for a browser-only demo.
 */

import { clone } from '../domain/core.js';
import { SCHEMA_VERSION } from '../version.js';

export const BACKUP_FORMAT = 'lajur.backup';
export const BACKUP_VERSION = 4;

export function exportBackup(db) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    dataset: db.meta?.dataset ?? 'main',
    data: clone(db),
  };
}

const COLLECTIONS = [
  'users', 'warehouses', 'categories', 'collections', 'skus', 'parts', 'partStock', 'rolls',
  'movements', 'customers', 'suppliers', 'supplierPrices', 'projects', 'invoices', 'payments',
  'samples', 'deposits', 'transfers', 'purchaseOrders', 'goodsReceipts', 'supplierInvoices',
  'shipments', 'tasks', 'returns', 'opnameSessions', 'audit', 'sequences',
];

export function validateBackup(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return { valid: false, errors: ['Berkas bukan objek backup.'] };
  if (payload.format !== BACKUP_FORMAT) errors.push('Format berkas tidak dikenali.');
  if (!payload.data || typeof payload.data !== 'object') errors.push('Data tidak ditemukan.');
  if (payload.version > BACKUP_VERSION) errors.push(`Versi backup ${payload.version} lebih baru dari aplikasi.`);
  if (payload.data?.meta?.version > SCHEMA_VERSION) errors.push(`Skema data ${payload.data.meta.version} lebih baru dari aplikasi (${SCHEMA_VERSION}).`);
  const db = payload.data;
  if (!db) return { valid: false, errors };

  for (const key of COLLECTIONS) {
    if (!Array.isArray(db[key]) && key !== 'sequences') {
      if (key === 'tasks' || key === 'shipments') continue;
      errors.push(`Koleksi ${key} hilang atau bukan array.`);
    }
  }
  if (errors.length) return { valid: false, errors };

  const ids = (list, idKey = 'id') => new Set(list.map((x) => x[idKey]));
  const warehouses = ids(db.warehouses);
  const skus = ids(db.skus);
  const parts = ids(db.parts);
  const customers = ids(db.customers);
  const suppliers = ids(db.suppliers);
  const rollIds = new Set(db.rolls.map((r) => r.id));
  const invoiceIds = new Set(db.invoices.map((i) => i.id));
  const projectIds = new Set(db.projects.map((p) => p.id));
  const supplierInvoiceIds = new Set(db.supplierInvoices.map((b) => b.id));
  const receiptIds = new Set(db.goodsReceipts.map((g) => g.id));

  const need = (set, id, label, where) => {
    if (id && !set.has(id)) errors.push(`${where}: ${label} ${id} tidak ditemukan.`);
  };

  for (const r of db.rolls) {
    need(skus, r.skuId, 'SKU', `Roll ${r.id}`);
    if (r.warehouseId) need(warehouses, r.warehouseId, 'Gudang', `Roll ${r.id}`);
    if (r.transit) {
      need(warehouses, r.transit.fromWarehouseId, 'Gudang asal', `Roll ${r.id}`);
      need(warehouses, r.transit.toWarehouseId, 'Gudang tujuan', `Roll ${r.id}`);
    }
    if (r.parentRollId && !rollIds.has(r.parentRollId)) errors.push(`Roll ${r.id}: induk ${r.parentRollId} hilang.`);
    if (!Number.isFinite(r.currentMm) || r.currentMm < 0) errors.push(`Roll ${r.id}: panjang tidak valid.`);
    if ((r.reservedMm || 0) > r.currentMm) errors.push(`Roll ${r.id}: reservasi melebihi panjang.`);
  }
  for (const p of db.partStock) {
    need(parts, p.partId, 'Spare part', 'Stok part');
    need(warehouses, p.warehouseId, 'Gudang', 'Stok part');
  }
  for (const inv of db.invoices) {
    need(customers, inv.customerId, 'Pelanggan', `Faktur ${inv.id}`);
    for (const line of inv.lines ?? []) {
      if (line.rollId) need(rollIds, line.rollId, 'Roll', `Faktur ${inv.id}`);
      if (line.partId) need(parts, line.partId, 'Part', `Faktur ${inv.id}`);
      if (line.warehouseId) need(warehouses, line.warehouseId, 'Gudang', `Faktur ${inv.id}`);
    }
  }
  for (const t of db.transfers) {
    need(warehouses, t.fromWarehouseId, 'Gudang asal', `Transfer ${t.id}`);
    need(warehouses, t.toWarehouseId, 'Gudang tujuan', `Transfer ${t.id}`);
    for (const line of t.lines ?? []) {
      need(skus, line.skuId, 'SKU', `Transfer ${t.id}`);
      for (const a of line.allocations ?? []) need(rollIds, a.rollId, 'Roll', `Transfer ${t.id}`);
    }
  }
  for (const po of db.purchaseOrders) need(suppliers, po.supplierId, 'Pemasok', `PO ${po.id}`);
  for (const gr of db.goodsReceipts) {
    need(warehouses, gr.warehouseId, 'Gudang', `Penerimaan ${gr.id}`);
    if (gr.supplierId) need(suppliers, gr.supplierId, 'Pemasok', `Penerimaan ${gr.id}`);
    if (!['adhoc'].includes(gr.kind) && !gr.supplierId) errors.push(`Penerimaan ${gr.id}: pemasok wajib untuk penerimaan PO.`);
  }
  for (const bill of db.supplierInvoices) {
    need(suppliers, bill.supplierId, 'Pemasok', `Tagihan ${bill.id}`);
    if (bill.receiptId) need(receiptIds, bill.receiptId, 'Penerimaan', `Tagihan ${bill.id}`);
  }
  for (const s of db.samples) {
    need(customers, s.customerId, 'Pelanggan', `Sample ${s.id}`);
    need(rollIds, s.rollId, 'Roll', `Sample ${s.id}`);
    if (s.depositId) {
      const found = db.deposits.some((d) => d.id === s.depositId);
      if (!found) errors.push(`Sample ${s.id}: deposit ${s.depositId} hilang.`);
    }
    if (s.linkedInvoiceId) need(invoiceIds, s.linkedInvoiceId, 'Faktur', `Sample ${s.id}`);
  }
  for (const d of db.deposits) {
    need(customers, d.customerId, 'Pelanggan', `Deposit ${d.id}`);
    const used = (d.applied ?? 0) + (d.refunded ?? 0);
    if (used > d.amount + 0.5) errors.push(`Deposit ${d.id}: pemakaian melebihi nominal.`);
  }
  for (const p of db.projects) {
    need(customers, p.customerId, 'Pelanggan', `Proyek ${p.id}`);
    for (const req of p.requirements ?? []) {
      if (req.skuId) need(skus, req.skuId, 'SKU', `Proyek ${p.id}`);
      if (req.partId) need(parts, req.partId, 'Part', `Proyek ${p.id}`);
      for (const a of req.allocations ?? []) need(rollIds, a.rollId, 'Roll', `Proyek ${p.id}`);
    }
    if (p.invoiceId) need(invoiceIds, p.invoiceId, 'Faktur', `Proyek ${p.id}`);
  }
  for (const s of db.opnameSessions) {
    need(warehouses, s.warehouseId, 'Gudang', `Opname ${s.id}`);
    for (const line of s.lines ?? []) need(rollIds, line.rollId, 'Roll', `Opname ${s.id}`);
  }
  for (const r of db.returns) {
    if (r.invoiceId) need(invoiceIds, r.invoiceId, 'Faktur', `Retur ${r.id}`);
    if (r.receiptId) need(receiptIds, r.receiptId, 'Penerimaan', `Retur ${r.id}`);
  }
  for (const task of db.tasks ?? []) {
    need(warehouses, task.warehouseId, 'Gudang', `Tugas ${task.id}`);
    if (task.assigneeId) need(new Set(db.users.map((u) => u.id)), task.assigneeId, 'Pengguna', `Tugas ${task.id}`);
    if (task.projectId) need(projectIds, task.projectId, 'Proyek', `Tugas ${task.id}`);
    if (task.rollId) need(rollIds, task.rollId, 'Roll', `Tugas ${task.id}`);
  }
  for (const shipment of db.shipments ?? []) {
    const po = db.purchaseOrders.find((p) => p.id === shipment.poId);
    if (!po) errors.push(`Pengiriman ${shipment.id}: PO ${shipment.poId} hilang.`);
    need(suppliers, shipment.supplierId, 'Pemasok', `Pengiriman ${shipment.id}`);
    if (shipment.costs && shipment.costs.totalIdr !== shipment.landedCostIdr) {
      errors.push(`Pengiriman ${shipment.id}: total landed cost tidak konsisten.`);
    }
  }
  for (const s of db.suppliers) {
    if (s.currency && !['IDR', 'CNY', 'USD'].includes(s.currency)) errors.push(`Pemasok ${s.id}: mata uang tidak dikenal.`);
    if (s.currency !== 'IDR' && !(Number(s.fxRate) > 0)) errors.push(`Pemasok ${s.id}: kurs harus lebih dari 0.`);
  }
  for (const a of db.audit) {
    if (a.userId && a.userId !== 'system' && !db.users.some((u) => u.id === a.userId)) {
      errors.push(`Audit ${a.id}: pengguna ${a.userId} hilang.`);
    }
  }

  return { valid: errors.length === 0, errors: errors.slice(0, 50), counts: Object.fromEntries(COLLECTIONS.map((k) => [k, Array.isArray(db[k]) ? db[k].length : 0])) };
}

export function importBackup(payload) {
  const result = validateBackup(payload);
  if (!result.valid) {
    const err = new Error(`Backup tidak valid: ${result.errors.slice(0, 3).join(' ')}`);
    err.errors = result.errors;
    throw err;
  }
  return clone(payload.data);
}
