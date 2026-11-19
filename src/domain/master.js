/**
 * Master data mutations with invariants: warehouses and collections.
 * Display codes may change; internal IDs never do.
 */

import { DomainError, assert, audit, byId, isoNow, nextId, todayJakarta, uid } from './core.js';
import { recordSellPriceChange } from './pricing.js';

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

const collectionDefaults = (value) => {
  const length = Number(value.defaultRollLengthM ?? 60);
  const width = Number(value.defaultWidthCm ?? 300);
  assert(length > 0, 'INVALID_LENGTH', 'Panjang roll default harus lebih dari 0 m.');
  assert(width > 0, 'INVALID_WIDTH', 'Lebar kain default harus lebih dari 0 cm.');
  const clothType = String(value.clothType ?? '').trim();
  assert(clothType.length >= 2, 'INVALID_CLOTH_TYPE', 'Tipe kain minimal 2 karakter.');
  const motive = String(value.motive ?? clothType).trim();
  return {
    clothType,
    motive,
    motivePrice: Math.max(0, Math.round(Number(value.motivePrice) || 0)),
    defaultRollLengthM: length,
    defaultWidthCm: width,
    samplePrice: Math.max(0, Math.round(Number(value.samplePrice) || 0)),
    sampleDeposit: Math.max(0, Math.round(Number(value.sampleDeposit) || 0)),
    sampleMin: Math.max(0, Math.round(Number(value.sampleMin) || 0)),
  };
};

export function renameCollection(db, {
  id, name, categoryId = null, description = '', clothType = null, motive = null,
  motivePrice = null, defaultRollLengthM = null, defaultWidthCm = null, samplePrice = null,
  sampleDeposit = null, sampleMin = null, user,
}) {
  const collection = byId(db.collections, id);
  assert(collection, 'COLLECTION_NOT_FOUND', 'Koleksi tidak ditemukan.');
  const clean = String(name ?? '').trim();
  assert(clean.length >= 2, 'INVALID_NAME', 'Nama koleksi minimal 2 karakter.');
  assert(
    !db.collections.some((c) => c.id !== id && c.name.toLowerCase() === clean.toLowerCase()),
    'DUPLICATE_NAME',
    'Nama koleksi sudah dipakai.',
  );
  if (categoryId) assert(byId(db.categories, categoryId), 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.');
  const defaults = collectionDefaults({
    clothType: clothType ?? collection.clothType,
    motive: motive ?? collection.motive,
    motivePrice: motivePrice ?? collection.motivePrice,
    defaultRollLengthM: defaultRollLengthM ?? collection.defaultRollLengthM,
    defaultWidthCm: defaultWidthCm ?? collection.defaultWidthCm,
    samplePrice: samplePrice ?? collection.samplePrice,
    sampleDeposit: sampleDeposit ?? collection.sampleDeposit,
    sampleMin: sampleMin ?? collection.sampleMin,
  });
  collection.name = clean;
  collection.categoryId = categoryId ?? collection.categoryId;
  collection.description = description;
  Object.assign(collection, defaults);
  // Keep the denormalised label on SKUs in sync; IDs and history remain stable.
  db.skus.filter((s) => s.collectionId === id).forEach((s) => {
    s.collectionName = clean;
    s.clothType = defaults.clothType;
    s.motive = defaults.motive;
  });
  for (const stock of db.sampleStocks ?? []) {
    if (stock.collectionId !== id) continue;
    stock.samplePrice = defaults.samplePrice;
    stock.sampleDeposit = defaults.sampleDeposit;
    stock.minQty = defaults.sampleMin;
  }
  audit(db, user, 'ubah_koleksi', 'collection', id, `${clean} · ${defaults.clothType}`);
  return collection;
}

export function createCollection(db, {
  name, categoryId, description = '', clothType = 'Kain', motive = '', motivePrice = 0,
  defaultRollLengthM = 60, defaultWidthCm = 300, samplePrice = 0, sampleDeposit = 0,
  sampleMin = 0, user,
}) {
  const clean = String(name ?? '').trim();
  assert(clean.length >= 2, 'INVALID_NAME', 'Nama koleksi minimal 2 karakter.');
  assert(byId(db.categories, categoryId), 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.');
  assert(!db.collections.some((c) => c.name.toLowerCase() === clean.toLowerCase()), 'DUPLICATE_NAME', 'Nama koleksi sudah dipakai.');
  const defaults = collectionDefaults({
    clothType, motive, motivePrice, defaultRollLengthM, defaultWidthCm, samplePrice, sampleDeposit, sampleMin,
  });
  const collection = {
    id: `col-${uid('').slice(1, 9)}`,
    name: clean,
    categoryId,
    description,
    ...defaults,
  };
  db.collections.push(collection);
  audit(db, user, 'buat_koleksi', 'collection', collection.id, `${clean} · ${defaults.clothType}`);
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
    clothType: collection.clothType ?? '',
    motive: collection.motive ?? '',
    code: cleanCode,
    colourCode: cleanColour,
    colourName: String(colourName ?? '').trim() || null,
    swatch: swatch || null,
    widthCm: Number(widthCm) || 0,
    buyPrice: Math.round(Number(buyPrice) || 0),
    sellPrice: Math.round(Number(sellPrice) || 0) || Math.round(Number(collection.motivePrice) || 0),
    active,
    dormant: !active,
    image: image || '',
    notes: String(notes ?? '').trim(),
    updatedAt: isoNow(),
  };

  if (id) {
    const sku = byId(db.skus, id);
    assert(sku, 'SKU_NOT_FOUND', 'Produk tidak ditemukan.');
    const oldPrice = Number(sku.sellPrice) || 0;
    Object.assign(sku, patch);
    if (patch.sellPrice !== oldPrice) {
      sku.sellPriceUpdatedAt = todayJakarta();
      recordSellPriceChange(db, {
        itemType: 'sku', itemId: sku.id, oldPrice, newPrice: patch.sellPrice, user, note: 'Perubahan dari master produk',
      });
    }
    audit(db, user, 'ubah_produk', 'sku', id, `${cleanCode} · ${collection.name}`);
    return sku;
  }
  const sku = {
    id: `sku-${uid('').slice(1, 9)}`, unit: 'm', createdAt: isoNow(),
    sellPriceUpdatedAt: todayJakarta(), ...patch,
  };
  db.skus.push(sku);
  if (sku.sellPrice) {
    recordSellPriceChange(db, {
      itemType: 'sku', itemId: sku.id, oldPrice: 0, newPrice: sku.sellPrice, user, note: 'Harga awal',
    });
  }
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
    const oldPrice = Number(part.sellPrice) || 0;
    Object.assign(part, patch);
    if (patch.sellPrice !== oldPrice) {
      part.sellPriceUpdatedAt = todayJakarta();
      recordSellPriceChange(db, {
        itemType: 'part', itemId: part.id, oldPrice, newPrice: patch.sellPrice, user, note: 'Perubahan dari master spare part',
      });
    }
    audit(db, user, 'ubah_part', 'part', id, `${cleanSku} · ${cleanName}`);
    return part;
  }
  const part = {
    id: `part-${uid('').slice(1, 9)}`, createdAt: isoNow(),
    sellPriceUpdatedAt: todayJakarta(), ...patch,
  };
  db.parts.push(part);
  if (part.sellPrice) {
    recordSellPriceChange(db, {
      itemType: 'part', itemId: part.id, oldPrice: 0, newPrice: part.sellPrice, user, note: 'Harga awal',
    });
  }
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
  return (db.fleetAssets ?? []).filter((a) => a.active !== false && (a.ownership ?? 'internal') === 'internal');
}

/** All driver IDs linked to a vehicle, primary driver included. */
export function driverIdsOfFleetAsset(asset) {
  const linked = Array.isArray(asset?.driverIds) ? asset.driverIds : [];
  return [...new Set([asset?.driverId, ...linked].filter(Boolean))];
}

/** Drivers that may use a vehicle. Many-to-many: a vehicle can have several drivers. */
export function driversForFleetAsset(db, asset) {
  if (!asset) return [];
  return driverIdsOfFleetAsset(asset).map((id) => driverOf(db, id)).filter(Boolean);
}

/**
 * Vehicles a driver may use, primary/default first. A driver is never locked to
 * one vehicle and a vehicle is never locked to one driver.
 */
export function fleetAssetsForDriver(db, driverId) {
  if (!driverId) return [];
  return (db.fleetAssets ?? [])
    .filter((a) => (a.ownership ?? 'internal') === 'internal' && driverIdsOfFleetAsset(a).includes(driverId))
    .sort((a, b) => Number(b.driverId === driverId) - Number(a.driverId === driverId));
}

/** Default vehicle for a driver (used only as a prefill, never a restriction). */
export function fleetAssetOfDriver(db, driverId) {
  return fleetAssetsForDriver(db, driverId)[0] ?? null;
}

/** Keep the driver's vehicle snapshot aligned with the default linked vehicle. */
function syncDriverVehicle(db, driverId) {
  const driver = driverOf(db, driverId);
  if (!driver) return;
  const asset = fleetAssetOfDriver(db, driver.id);
  if (asset) {
    driver.vehicleType = asset.type;
    driver.plateNumber = asset.code;
    driver.transportId = asset.transportId ?? driver.transportId ?? null;
  } else {
    driver.plateNumber = '';
  }
}

export function saveFleetAsset(db, {
  id = null, code, name, type = 'motor', transportId = null,
  driverId = null, driverIds = null, capacityKg = 0, taxExpiry = '', active = true, notes = '', user,
}) {
  const cleanCode = String(code ?? '').trim().toUpperCase();
  const cleanName = String(name ?? '').trim();
  assert(cleanCode.length >= 3, 'INVALID_CODE', 'Kode/plat aset minimal 3 karakter.');
  assert(cleanName.length >= 2, 'INVALID_NAME', 'Nama aset minimal 2 karakter.');
  assert(FLEET_TYPES[type], 'INVALID_TYPE', 'Jenis aset tidak dikenal.');
  const transport = transportId
    ? transportOf(db, transportId)
    : ((db.transportCompanies ?? []).find((t) => t.code === 'internal') ?? null);
  if (transportId) assert(transport, 'TRANSPORT_NOT_FOUND', 'Transport tidak ditemukan.');
  const driver = driverId ? driverOf(db, driverId) : null;
  if (driverId) assert(driver, 'DRIVER_NOT_FOUND', 'Driver tidak ditemukan.');
  db.fleetAssets = db.fleetAssets ?? [];
  assert(!db.fleetAssets.some((a) => a.id !== id && a.code.toUpperCase() === cleanCode), 'DUPLICATE_CODE', `Aset ${cleanCode} sudah ada.`);
  const existing = id ? db.fleetAssets.find((a) => a.id === id) : null;
  if (id) assert(existing, 'FLEET_NOT_FOUND', 'Aset transport tidak ditemukan.');

  // Link many drivers to this vehicle. `driverId` is only the default driver;
  // it never removes drivers from other vehicles and vice versa.
  const requestedLinks = driverIds === null ? null : (Array.isArray(driverIds) ? driverIds : [driverIds]);
  const links = requestedLinks !== null
    ? [...new Set(requestedLinks.map((value) => String(value ?? '').trim()).filter(Boolean))]
    : driverIdsOfFleetAsset(existing);
  for (const linkedId of links) assert(driverOf(db, linkedId), 'DRIVER_NOT_FOUND', `Driver ${linkedId} tidak ditemukan.`);
  if (driver?.id && !links.includes(driver.id)) links.push(driver.id);
  let primaryId = driver?.id ?? null;
  if (!primaryId) {
    primaryId = existing?.driverId && links.includes(existing.driverId) ? existing.driverId : (links[0] ?? null);
  }
  if (primaryId) {
    for (const asset of db.fleetAssets) {
      if (asset.id !== id && asset.driverId === primaryId) asset.driverId = null;
    }
  }

  const before = new Set(driverIdsOfFleetAsset(existing));
  const patch = {
    code: cleanCode,
    name: cleanName,
    type,
    ownership: 'internal',
    transportId: transport?.id ?? null,
    driverId: primaryId,
    driverIds: links,
    capacityKg: Math.max(0, Number(capacityKg) || 0),
    taxExpiry,
    active,
    notes: String(notes ?? '').trim(),
    updatedAt: isoNow(),
  };
  let saved;
  if (existing) {
    Object.assign(existing, patch);
    saved = existing;
    audit(db, user, 'ubah_aset_transport', 'fleetAsset', existing.id, cleanCode);
  } else {
    saved = { id: nextId(db, 'fleetAsset', 'FLT', 3), ...patch, createdAt: isoNow() };
    db.fleetAssets.push(saved);
    audit(db, user, 'buat_aset_transport', 'fleetAsset', saved.id, cleanCode);
  }
  for (const linkedId of new Set([...before, ...links])) syncDriverVehicle(db, linkedId);
  return saved;
}

export function activeDrivers(db) {
  return (db.drivers ?? []).filter((d) => d.active !== false);
}

export function driverOf(db, id) {
  return (db.drivers ?? []).find((d) => d.id === id) ?? null;
}

export function saveDriver(db, {
  id = null, name, phone = '', vehicleType = 'motor', plateNumber = '', transportId = null,
  fleetAssetId = null, fleetAssetIds = null, active = true, notes = '', user,
}) {
  const cleanName = String(name ?? '').trim();
  assert(cleanName.length >= 2, 'INVALID_NAME', 'Nama driver minimal 2 karakter.');
  db.fleetAssets = db.fleetAssets ?? [];

  // Many-to-many: a driver may be linked to several vehicles. `fleetAssetId`
  // (single) stays supported as the default vehicle for older forms.
  const requestedFleetIds = fleetAssetIds === null ? null : (Array.isArray(fleetAssetIds) ? fleetAssetIds : [fleetAssetIds]);
  const selectedIds = requestedFleetIds !== null
    ? [...new Set(requestedFleetIds.map((value) => String(value ?? '').trim()).filter(Boolean))]
    : [];
  const legacyId = fleetAssetId ? String(fleetAssetId) : null;
  const targetIds = [...selectedIds];
  if (legacyId && !targetIds.includes(legacyId)) targetIds.push(legacyId);
  const linkChange = fleetAssetIds !== null || Boolean(legacyId);
  for (const linkedId of targetIds) {
    assert(db.fleetAssets.some((a) => a.id === linkedId), 'FLEET_NOT_FOUND', 'Kendaraan internal tidak ditemukan.');
  }
  const primaryAsset = (legacyId ? db.fleetAssets.find((a) => a.id === legacyId) : null)
    ?? (targetIds.length ? db.fleetAssets.find((a) => a.id === targetIds[0]) : null);
  if (primaryAsset) {
    vehicleType = primaryAsset.type;
    plateNumber = primaryAsset.code;
    if (primaryAsset.transportId) transportId = primaryAsset.transportId;
  }
  assert(VEHICLE_TYPES[vehicleType], 'INVALID_VEHICLE', 'Jenis kendaraan tidak dikenal.');
  const plate = String(plateNumber ?? '').trim().toUpperCase();
  assert(!plate || plate.length >= 3, 'INVALID_PLATE', 'Nomor polisi minimal 3 karakter.');
  const transport = transportId ? transportOf(db, transportId) : null;
  if (transportId) assert(transport, 'TRANSPORT_NOT_FOUND', 'Transport tidak ditemukan.');
  db.drivers = db.drivers ?? [];

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
  let driver;
  if (id) {
    driver = driverOf(db, id);
    assert(driver, 'DRIVER_NOT_FOUND', 'Driver tidak ditemukan.');
    Object.assign(driver, patch);
  } else {
    driver = { id: nextId(db, 'driver', 'DRV', 3), ...patch, createdAt: isoNow() };
    db.drivers.push(driver);
  }

  if (linkChange) {
    const currentPrimary = fleetAssetOfDriver(db, driver.id);
    const chosenPrimaryId = legacyId
      ?? (currentPrimary && targetIds.includes(currentPrimary.id) ? currentPrimary.id : (targetIds[0] ?? null));
    for (const asset of db.fleetAssets) {
      const links = new Set(driverIdsOfFleetAsset(asset));
      if (targetIds.includes(asset.id)) links.add(driver.id); else links.delete(driver.id);
      asset.driverIds = [...links];
      if (asset.driverId === driver.id && asset.id !== chosenPrimaryId) {
        asset.driverId = links.has(driver.id) ? null : (asset.driverIds[0] ?? null);
      }
      if (asset.id === chosenPrimaryId) asset.driverId = driver.id;
    }
    syncDriverVehicle(db, driver.id);
    // A typed legacy plate survives when no vehicle remains linked.
    if (!fleetAssetOfDriver(db, driver.id) && plate) driver.plateNumber = plate;
  }
  audit(db, user, (id && active) ? 'ubah_driver' : (active ? 'buat_driver' : 'nonaktifkan_driver'), 'driver', driver.id, `${cleanName} · ${plate || 'tanpa kendaraan'}`);
  return driver;
}
