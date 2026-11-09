/**
 * Master data mutations with invariants: warehouses and collections.
 * Display codes may change; internal IDs never do.
 */

import { DomainError, assert, audit, byId, isoNow, nextId, uid } from './core.js';

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

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

const ROLES = new Set(['manager', 'operator', 'sales', 'driver']);

export function saveUser(db, { id = null, name, role, active = true, user }) {
  const clean = String(name ?? '').trim();
  assert(clean.length >= 2, 'INVALID_NAME', 'Nama pengguna minimal 2 karakter.');
  assert(ROLES.has(role), 'INVALID_ROLE', 'Peran pengguna tidak dikenal.');
  if (id) {
    const existing = byId(db.users, id);
    if (existing) {
      if (existing.role === 'manager' && (role !== 'manager' || active === false)) {
        const managers = db.users.filter((u) => u.role === 'manager' && u.active !== false && u.id !== id);
        assert(managers.length > 0, 'LAST_MANAGER', 'Minimal satu manajer aktif harus tersisa.');
      }
      Object.assign(existing, { name: clean, role, active, updatedAt: isoNow() });
      audit(db, user, active ? 'ubah_pengguna' : 'nonaktifkan_pengguna', 'user', id, `${clean} · ${role}`);
      return existing;
    }
  }
  const created = {
    id: id ?? `u-${uid('').slice(1, 9)}`,
    name: clean,
    role,
    active,
    createdAt: isoNow(),
  };
  db.users.push(created);
  audit(db, user, 'buat_pengguna', 'user', created.id, `${clean} · ${role}`);
  return created;
}

export function auditTrail(db, entity, entityId, limit = 12) {
  return db.audit.filter((a) => a.entity === entity && a.entityId === entityId).slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Products and spare parts                                                   */
/* -------------------------------------------------------------------------- */

export function saveSku(db, {
  id = null, collectionId, code, colourCode, colourName = '', swatch = null,
  widthCm = 280, buyPrice = 0, sellPrice = 0, active = true, image = '', notes = '', user,
}) {
  const collection = byId(db.collections, collectionId);
  assert(collection, 'COLLECTION_NOT_FOUND', 'Koleksi tidak ditemukan.');
  const cleanCode = String(code ?? '').trim();
  const cleanColour = String(colourCode ?? '').trim();
  assert(cleanCode.length >= 2, 'INVALID_CODE', 'Kode produk minimal 2 karakter.');
  assert(cleanColour.length >= 1, 'INVALID_CODE', 'Kode warna wajib diisi.');
  assert(!db.skus.some((s) => s.id !== id && s.code.toLowerCase() === cleanCode.toLowerCase()), 'DUPLICATE_CODE', `Kode ${cleanCode} sudah dipakai.`);

  const patch = {
    collectionId,
    collectionName: collection.name,
    code: cleanCode,
    colourCode: cleanColour,
    colourName: String(colourName ?? '').trim() || null,
    swatch: swatch || null,
    widthCm: Number(widthCm) || 0,
    buyPrice: Math.round(Number(buyPrice) || 0),
    sellPrice: Math.round(Number(sellPrice) || 0),
    active,
    dormant: !active,
    image: image || '',
    notes: String(notes ?? '').trim(),
    updatedAt: isoNow(),
  };

  if (id) {
    const sku = byId(db.skus, id);
    assert(sku, 'SKU_NOT_FOUND', 'Produk tidak ditemukan.');
    Object.assign(sku, patch);
    audit(db, user, 'ubah_produk', 'sku', id, `${cleanCode} · ${collection.name}`);
    return sku;
  }
  const sku = { id: `sku-${uid('').slice(1, 9)}`, unit: 'm', createdAt: isoNow(), ...patch };
  db.skus.push(sku);
  audit(db, user, 'buat_produk', 'sku', sku.id, `${cleanCode} · ${collection.name}`);
  return sku;
}

export function savePart(db, {
  id = null, sku, name, categoryId, brand = '', unit = 'pcs', buyPrice = 0, sellPrice = 0,
  active = true, image = '', notes = '', parentPartId = null, user,
}) {  const cleanSku = String(sku ?? '').trim().toUpperCase();
  const cleanName = String(name ?? '').trim();
  assert(cleanSku.length >= 2, 'INVALID_SKU', 'SKU part minimal 2 karakter.');
  assert(cleanName.length >= 2, 'INVALID_NAME', 'Nama part minimal 2 karakter.');
  assert(byId(db.categories, categoryId), 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.');
  assert(!db.parts.some((p) => p.id !== id && p.sku.toLowerCase() === cleanSku.toLowerCase()), 'DUPLICATE_SKU', `SKU ${cleanSku} sudah dipakai.`);

  let parent = null;
  if (parentPartId) {
    parent = byId(db.parts, parentPartId);
    assert(parent, 'PARENT_NOT_FOUND', 'Part induk tidak ditemukan.');
    assert(parent.id !== id, 'INVALID_PARENT', 'Part tidak boleh menjadi induk dirinya sendiri.');
    assert(parent.categoryId === categoryId, 'PARENT_CATEGORY', 'Part induk harus berada di kategori yang sama.');
    const seen = new Set();
    let cursor = parent;
    while (cursor) {
      assert(cursor.id !== id, 'PARENT_CYCLE', 'Relasi induk/turunan tidak boleh melingkar.');
      if (seen.has(cursor.id)) break;
      seen.add(cursor.id);
      cursor = cursor.parentPartId ? byId(db.parts, cursor.parentPartId) : null;
    }
  }

  const patch = {
    sku: cleanSku,
    name: cleanName,
    categoryId,
    brand: String(brand ?? '').trim(),
    unit: unit || 'pcs',
    buyPrice: Math.round(Number(buyPrice) || 0),
    sellPrice: Math.round(Number(sellPrice) || 0),
    active,
    image: image || '',
    notes: String(notes ?? '').trim(),
    parentPartId: parent?.id ?? null,
    updatedAt: isoNow(),
  };

  if (id) {
    const part = byId(db.parts, id);
    assert(part, 'PART_NOT_FOUND', 'Spare part tidak ditemukan.');
    Object.assign(part, patch);
    audit(db, user, 'ubah_part', 'part', id, `${cleanSku} · ${cleanName}`);
    return part;
  }
  const part = { id: `part-${uid('').slice(1, 9)}`, createdAt: isoNow(), ...patch };
  db.parts.push(part);
  audit(db, user, 'buat_part', 'part', part.id, `${cleanSku} · ${cleanName}`);
  return part;
}

/* -------------------------------------------------------------------------- */
/* Drivers and vehicles                                                       */
/* -------------------------------------------------------------------------- */

export const VEHICLE_TYPES = {
  motor: { label: 'Motor' },
  mobil: { label: 'Mobil' },
  truk: { label: 'Truk' },
};

export const TRANSPORT_TYPES = {
  internal: { label: 'Internal' },
  third_party: { label: 'Pihak ketiga' },
};

export function activeTransports(db) {
  return (db.transportCompanies ?? []).filter((t) => t.active !== false);
}

export function transportOf(db, id) {
  return (db.transportCompanies ?? []).find((t) => t.id === id) ?? null;
}

export function saveTransport(db, {
  id = null, code, name, type = 'third_party', contact = '', phone = '', address = '', active = true, notes = '', user,
}) {
  const cleanCode = String(code ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const cleanName = String(name ?? '').trim();
  assert(cleanCode.length >= 2, 'INVALID_CODE', 'Kode transport minimal 2 karakter.');
  assert(cleanName.length >= 2, 'INVALID_NAME', 'Nama transport minimal 2 karakter.');
  assert(TRANSPORT_TYPES[type], 'INVALID_TYPE', 'Jenis transport tidak dikenal.');
  db.transportCompanies = db.transportCompanies ?? [];
  assert(!db.transportCompanies.some((t) => t.id !== id && t.code === cleanCode), 'DUPLICATE_CODE', `Kode ${cleanCode} sudah dipakai.`);
  const patch = {
    code: cleanCode,
    name: cleanName,
    type,
    contact,
    phone,
    address,
    active,
    notes,
    updatedAt: isoNow(),
  };
  if (id) {
    const existing = transportOf(db, id);
    assert(existing, 'TRANSPORT_NOT_FOUND', 'Transport tidak ditemukan.');
    Object.assign(existing, patch);
    audit(db, user, 'ubah_transport', 'transport', id, cleanName);
    return existing;
  }
  const transport = { id: nextId(db, 'transport', 'TRP', 3), ...patch, createdAt: isoNow() };
  db.transportCompanies.push(transport);
  audit(db, user, 'buat_transport', 'transport', transport.id, cleanName);
  return transport;
}

/* -------------------------------------------------------------------------- */
/* Fleet assets                                                              */
/* -------------------------------------------------------------------------- */

export const FLEET_TYPES = {
  motor: { label: 'Motor' },
  mobil: { label: 'Mobil' },
  truk: { label: 'Truk' },
};

export function activeFleetAssets(db) {
  return (db.fleetAssets ?? []).filter((a) => a.active !== false);
}

export function saveFleetAsset(db, {
  id = null, code, name, type = 'motor', ownership = 'internal', transportId = null,
  driverId = null, capacityKg = 0, taxExpiry = '', active = true, notes = '', user,
}) {
  const cleanCode = String(code ?? '').trim().toUpperCase();
  const cleanName = String(name ?? '').trim();
  assert(cleanCode.length >= 3, 'INVALID_CODE', 'Kode/plat aset minimal 3 karakter.');
  assert(cleanName.length >= 2, 'INVALID_NAME', 'Nama aset minimal 2 karakter.');
  assert(FLEET_TYPES[type], 'INVALID_TYPE', 'Jenis aset tidak dikenal.');
  assert(['internal', 'third_party'].includes(ownership), 'INVALID_OWNERSHIP', 'Kepemilikan aset tidak dikenal.');
  const transport = transportId ? transportOf(db, transportId) : null;
  if (transportId) assert(transport, 'TRANSPORT_NOT_FOUND', 'Transport tidak ditemukan.');
  const driver = driverId ? driverOf(db, driverId) : null;
  if (driverId) assert(driver, 'DRIVER_NOT_FOUND', 'Driver tidak ditemukan.');
  db.fleetAssets = db.fleetAssets ?? [];
  assert(!db.fleetAssets.some((a) => a.id !== id && a.code.toUpperCase() === cleanCode), 'DUPLICATE_CODE', `Aset ${cleanCode} sudah ada.`);
  const patch = {
    code: cleanCode,
    name: cleanName,
    type,
    ownership,
    transportId: transport?.id ?? null,
    driverId: driver?.id ?? null,
    capacityKg: Math.max(0, Number(capacityKg) || 0),
    taxExpiry,
    active,
    notes: String(notes ?? '').trim(),
    updatedAt: isoNow(),
  };
  if (id) {
    const existing = (db.fleetAssets ?? []).find((a) => a.id === id);
    assert(existing, 'FLEET_NOT_FOUND', 'Aset transport tidak ditemukan.');
    Object.assign(existing, patch);
    audit(db, user, 'ubah_aset_transport', 'fleetAsset', id, cleanCode);
    return existing;
  }
  const asset = { id: nextId(db, 'fleetAsset', 'FLT', 3), ...patch, createdAt: isoNow() };
  db.fleetAssets.push(asset);
  audit(db, user, 'buat_aset_transport', 'fleetAsset', asset.id, cleanCode);
  return asset;
}

export function activeDrivers(db) {
  return (db.drivers ?? []).filter((d) => d.active !== false);
}

export function driverOf(db, id) {
  return (db.drivers ?? []).find((d) => d.id === id) ?? null;
}

export function saveDriver(db, {
  id = null, name, phone = '', vehicleType = 'motor', plateNumber = '', transportId = null,
  active = true, notes = '', user,
}) {
  const cleanName = String(name ?? '').trim();
  assert(cleanName.length >= 2, 'INVALID_NAME', 'Nama driver minimal 2 karakter.');
  assert(VEHICLE_TYPES[vehicleType], 'INVALID_VEHICLE', 'Jenis kendaraan tidak dikenal.');
  const plate = String(plateNumber ?? '').trim().toUpperCase();
  assert(!plate || plate.length >= 3, 'INVALID_PLATE', 'Nomor polisi minimal 3 karakter.');
  const transport = transportId ? transportOf(db, transportId) : null;
  if (transportId) assert(transport, 'TRANSPORT_NOT_FOUND', 'Transport tidak ditemukan.');
  db.drivers = db.drivers ?? [];
  assert(!db.drivers.some((d) => d.id !== id && plate && d.plateNumber?.toUpperCase() === plate), 'DUPLICATE_PLATE', `Nomor polisi ${plate} sudah dipakai.`);

  const patch = {
    name: cleanName,
    phone: String(phone ?? '').trim(),
    vehicleType,
    plateNumber: plate,
    transportId: transport?.id ?? null,
    active,
    notes: String(notes ?? '').trim(),
    updatedAt: isoNow(),
  };
  db.drivers = db.drivers ?? [];
  if (id) {
    const driver = driverOf(db, id);
    assert(driver, 'DRIVER_NOT_FOUND', 'Driver tidak ditemukan.');
    Object.assign(driver, patch);
    audit(db, user, active ? 'ubah_driver' : 'nonaktifkan_driver', 'driver', id, `${cleanName} · ${plate}`);
    return driver;
  }
  const driver = { id: nextId(db, 'driver', 'DRV', 3), ...patch, createdAt: isoNow() };
  db.drivers.push(driver);
  audit(db, user, 'buat_driver', 'driver', driver.id, `${cleanName} · ${plate}`);
  return driver;
}
