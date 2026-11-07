/**
 * Master data mutations with invariants: warehouses and collections.
 * Display codes may change; internal IDs never do.
 */

import { DomainError, assert, audit, byId, isoNow, uid } from './core.js';

export const WAREHOUSE_IN_USE = [
  'available', 'quarantine',
];

export function warehouseUsage(db, warehouseId) {
  const physicalRolls = db.rolls.filter(
    (r) => r.warehouseId === warehouseId && !r.transit && WAREHOUSE_IN_USE.includes(r.status) && r.currentMm > 0,
  );
  const transit = db.rolls.filter(
    (r) => r.transit && (r.transit.fromWarehouseId === warehouseId || r.transit.toWarehouseId === warehouseId),
  );
  const parts = db.partStock.filter((p) => p.warehouseId === warehouseId && p.qty > 0);
  const transfers = db.transfers.filter(
    (t) =>
      ['submitted', 'approved', 'dispatched', 'partially_received'].includes(t.status) &&
      (t.fromWarehouseId === warehouseId || t.toWarehouseId === warehouseId),
  );
  const opnames = db.opnameSessions.filter(
    (s) => s.warehouseId === warehouseId && ['counting', 'review'].includes(s.status),
  );
  return { physicalRolls, transit, parts, transfers, opnames };
}

export function assertWarehouseEmpty(db, warehouseId) {
  const usage = warehouseUsage(db, warehouseId);
  const blockers = [
    usage.physicalRolls.length ? `${usage.physicalRolls.length} roll fisik` : '',
    usage.transit.length ? `${usage.transit.length} roll transit` : '',
    usage.parts.length ? `${usage.parts.length} baris stok part` : '',
    usage.transfers.length ? `${usage.transfers.length} permintaan aktif` : '',
    usage.opnames.length ? `${usage.opnames.length} opname aktif` : '',
  ].filter(Boolean);
  if (blockers.length) {
    throw new DomainError(
      'WAREHOUSE_IN_USE',
      `Gudang tidak dapat dinonaktifkan: masih ada ${blockers.join(', ')}. Pindahkan stok dan selesaikan dokumen aktif terlebih dahulu.`,
    );
  }
  return true;
}

export function saveWarehouse(db, { id = null, code, name, address = '', phone = '', binPrefix, active = true, user }) {
  const cleanCode = String(code ?? '').trim().toUpperCase();
  const cleanBin = String(binPrefix ?? '').trim().toUpperCase();
  const cleanName = String(name ?? '').trim();

  assert(/^[A-Z0-9]{2,6}$/.test(cleanCode), 'INVALID_CODE', 'Kode gudang 2–6 huruf/angka, tanpa spasi.');
  assert(/^[A-Z0-9]{1,3}$/.test(cleanBin), 'INVALID_BIN', 'Prefiks rak 1–3 huruf/angka.');
  assert(cleanName.length >= 2, 'INVALID_NAME', 'Nama gudang wajib diisi (minimal 2 karakter).');

  const others = db.warehouses.filter((w) => w.id !== id);
  assert(!others.some((w) => w.code.toUpperCase() === cleanCode), 'DUPLICATE_CODE', `Kode gudang ${cleanCode} sudah dipakai.`);
  assert(!others.some((w) => String(w.binPrefix).toUpperCase() === cleanBin), 'DUPLICATE_BIN', `Prefiks rak ${cleanBin} sudah dipakai gudang lain.`);

  if (id) {
    const existing = byId(db.warehouses, id);
    assert(existing, 'WAREHOUSE_NOT_FOUND', 'Gudang tidak ditemukan.');
    if (existing.active !== false && active === false) assertWarehouseEmpty(db, id);
    Object.assign(existing, {
      code: cleanCode,
      name: cleanName,
      address,
      phone,
      binPrefix: cleanBin,
      active,
      updatedAt: isoNow(),
    });
    audit(db, user, active ? 'ubah_gudang' : 'nonaktifkan_gudang', 'warehouse', id, cleanCode);
    return existing;
  }

  const warehouse = {
    id: `wh-${uid('').slice(1, 9)}`,
    code: cleanCode,
    name: cleanName,
    address,
    phone,
    binPrefix: cleanBin,
    active,
    createdAt: isoNow(),
  };
  db.warehouses.push(warehouse);
  audit(db, user, 'buat_gudang', 'warehouse', warehouse.id, `${cleanCode} · ${cleanName}`);
  return warehouse;
}

export function activeWarehouses(db) {
  return db.warehouses.filter((w) => w.active !== false);
}

export function renameCollection(db, { id, name, description = '', user }) {
  const collection = byId(db.collections, id);
  assert(collection, 'COLLECTION_NOT_FOUND', 'Koleksi tidak ditemukan.');
  const clean = String(name ?? '').trim();
  assert(clean.length >= 2, 'INVALID_NAME', 'Nama koleksi minimal 2 karakter.');
  assert(
    !db.collections.some((c) => c.id !== id && c.name.toLowerCase() === clean.toLowerCase()),
    'DUPLICATE_NAME',
    'Nama koleksi sudah dipakai.',
  );
  collection.name = clean;
  collection.description = description;
  // Keep the denormalised label on SKUs in sync; IDs and history remain stable.
  db.skus.filter((s) => s.collectionId === id).forEach((s) => {
    s.collectionName = clean;
  });
  audit(db, user, 'ubah_koleksi', 'collection', id, clean);
  return collection;
}

export function createCollection(db, { name, categoryId, description = '', user }) {
  const clean = String(name ?? '').trim();
  assert(clean.length >= 2, 'INVALID_NAME', 'Nama koleksi minimal 2 karakter.');
  assert(byId(db.categories, categoryId), 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.');
  assert(!db.collections.some((c) => c.name.toLowerCase() === clean.toLowerCase()), 'DUPLICATE_NAME', 'Nama koleksi sudah dipakai.');
  const collection = {
    id: `col-${uid('').slice(1, 9)}`,
    name: clean,
    categoryId,
    description,
  };
  db.collections.push(collection);
  audit(db, user, 'buat_koleksi', 'collection', collection.id, clean);
  return collection;
}
