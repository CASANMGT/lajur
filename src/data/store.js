/**
 * Local persistence for two independent datasets: `main` and `sim`.
 * A mutation is applied to a clone; only a successful commit replaces state.
 */

import { clone } from '../domain/core.js';
import { buildSeed } from '../domain/seed.js';
import { DEFAULT_SETTINGS } from '../domain/settings.js';
import { SCHEMA_VERSION } from '../version.js';
import { exportBackup, importBackup as restoreBackup } from './backup.js';

const PREFIX = 'lajur.v2';
const keys = {
  main: `${PREFIX}.main`,
  sim: `${PREFIX}.sim`,
  ui: `${PREFIX}.ui`,
};

const defaultUi = {
  role: 'manager',
  warehouseId: 'wh-jkt',
  density: 'comfortable',
};

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const storage = {
  available: (() => {
    try {
      const k = '__lajur_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  })(),
  lastError: null,
};

const state = {
  dataset: 'main',
  db: null,
  ui: { ...defaultUi },
  listeners: new Set(),
};

function persist(dataset = state.dataset) {
  if (!storage.available) return;
  try {
    localStorage.setItem(keys[dataset], JSON.stringify(state.db));
  } catch (err) {
    storage.lastError = err;
  }
}

/** Forward-compatible migration for datasets created before v2.1. */
export function migrate(db) {
  if (!db || typeof db !== 'object') return db;
  const previousVersion = Number(db.meta?.version) || 0;
  db.meta = db.meta ?? {};
  db.meta.version = SCHEMA_VERSION;
  db.warehouses = db.warehouses ?? [];
  const legacyBali = db.warehouses.find((w) => w.id === 'wh-bdg');
  if (legacyBali) {
    Object.assign(legacyBali, {
      id: 'wh-bali', code: 'DPS', name: 'Gudang Bali', binPrefix: 'B',
      address: 'Jl. By Pass Ngurah Rai 88, Denpasar, Bali', phone: '0361-555-0202',
    });
  }
  db.warehouses = db.warehouses.filter((w) => w.id !== 'wh-sby');
  db.warehouses = db.warehouses.filter((w, index, list) => list.findIndex((x) => x.id === w.id) === index);
  const remapWarehouse = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(remapWarehouse); return; }
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string'
        && ['warehouseId', 'fromWarehouseId', 'toWarehouseId', 'warehouseToId'].includes(key)
        && ['wh-bdg', 'wh-sby'].includes(value)) {
        node[key] = 'wh-bali';
      } else if (value && typeof value === 'object') {
        remapWarehouse(value);
      }
    }
  };
  remapWarehouse(db);
  for (const wh of db.warehouses) {
    if (wh.active === undefined) wh.active = true;
  }
  for (const key of ['goodsReceipts', 'supplierInvoices', 'shipments', 'tasks', 'orders', 'deliveries', 'drivers', 'transportCompanies', 'fleetAssets', 'sampleStocks', 'sampleBooks', 'productionOrders', 'productionPieces', 'payrollEntries', 'returns', 'opnameSessions', 'audit', 'supplierPrices', 'sellPriceHistory', 'fxRates']) {
    if (!Array.isArray(db[key])) db[key] = [];
  }
  if (!db.fxRates.length) {
    const importSupplier = (db.suppliers ?? []).find((s) => s.currency === 'CNY' && s.fxRate > 0);
    if (importSupplier) {
      db.fxRates.push({
        id: 'FX-0001', currency: 'CNY', rate: Number(importSupplier.fxRate),
        asOf: new Date().toISOString(), source: 'Pemasok impor (migrasi)', createdAt: new Date().toISOString(), createdBy: 'Sistem',
      });
    }
  }
  for (const price of db.supplierPrices) {
    const supplier = (db.suppliers ?? []).find((s) => s.id === price.supplierId);
    if (!price.currency) price.currency = supplier?.currency ?? 'IDR';
    if (price.priceIdr === undefined) {
      const rate = price.currency === 'IDR' ? 1 : ((db.fxRates ?? []).find((r) => r.currency === price.currency)?.rate ?? supplier?.fxRate ?? 1);
      price.priceIdr = Math.round(Number(price.price) * rate);
    }
  }
  db.sequences = db.sequences ?? {};
  db.sequences.supplierPrice = Math.max(Number(db.sequences.supplierPrice) || 0, db.supplierPrices.length);
  db.sequences.fxRate = Math.max(Number(db.sequences.fxRate) || 0, db.fxRates.length);
  db.sequences.driver = Math.max(Number(db.sequences.driver) || 0, (db.drivers ?? []).length);
  db.sequences.sampleBook = Math.max(Number(db.sequences.sampleBook) || 0, (db.sampleBooks ?? []).length);
  db.sequences.sampleStock = Math.max(Number(db.sequences.sampleStock) || 0, (db.sampleStocks ?? []).length);
  db.sequences.sellPriceHistory = Math.max(Number(db.sequences.sellPriceHistory) || 0, (db.sellPriceHistory ?? []).length);

  const sampleDefaults = {
    'col-luna': { samplePrice: 25000, sampleDeposit: 50000, sampleMin: 2 },
    'col-aria': { samplePrice: 20000, sampleDeposit: 40000, sampleMin: 2 },
    'col-nova': { samplePrice: 20000, sampleDeposit: 40000, sampleMin: 1 },
  };
  for (const collection of db.collections ?? []) {
    if (!collection.clothType || collection.clothType === 'Kain') {
      const category = (db.categories ?? []).find((c) => c.id === collection.categoryId);
      collection.clothType = category?.name ?? 'Kain';
    }
    if (!collection.defaultRollLengthM) collection.defaultRollLengthM = 60;
    if (!collection.defaultWidthCm) collection.defaultWidthCm = 300;
    const defaults = sampleDefaults[collection.id] ?? { samplePrice: 0, sampleDeposit: 0, sampleMin: 1 };
    if (collection.samplePrice === undefined) collection.samplePrice = defaults.samplePrice;
    if (collection.sampleDeposit === undefined) collection.sampleDeposit = defaults.sampleDeposit;
    if (collection.sampleMin === undefined) collection.sampleMin = defaults.sampleMin;
  }
  for (const sku of db.skus ?? []) {
    const collection = (db.collections ?? []).find((c) => c.id === sku.collectionId);
    if (!sku.clothType) sku.clothType = collection?.clothType ?? '';
    if (!sku.sellPriceUpdatedAt) sku.sellPriceUpdatedAt = '2026-06-01';
  }
  for (const part of db.parts ?? []) {
    if (!part.sellPriceUpdatedAt) part.sellPriceUpdatedAt = '2026-06-01';
  }
  for (const roll of db.rolls ?? []) {
    if (!roll.barcode) roll.barcode = roll.id;
  }
  {
    // Sample stock is collection-level. Existing per-colour rows are merged
    // into one record per collection and treated as factory procurement.
    const grouped = new Map();
    for (const stock of db.sampleStocks ?? []) {
      const collectionId = stock.collectionId
        ?? (db.skus ?? []).find((s) => s.id === stock.skuId)?.collectionId
        ?? null;
      if (!collectionId) continue;
      const collection = (db.collections ?? []).find((c) => c.id === collectionId);
      if (!collection) continue;
      if (!grouped.has(collectionId)) {
        grouped.set(collectionId, {
          id: stock.id ?? `SS-${String((Number(db.sequences.sampleStock) || 0) + grouped.size + 1).padStart(4, '0')}`,
          collectionId,
          skuId: null,
          qty: 0,
          minQty: collection.sampleMin ?? stock.minQty ?? 1,
          samplePrice: collection.samplePrice ?? stock.samplePrice ?? 0,
          sampleDeposit: collection.sampleDeposit ?? stock.sampleDeposit ?? 0,
          unitCost: Number(stock.unitCost) || 0,
          location: stock.location ?? 'Showroom Jakarta',
          procurements: [],
          updatedAt: stock.updatedAt ?? new Date().toISOString(),
          history: [],
        });
      }
      const row = grouped.get(collectionId);
      row.qty += Number(stock.qty) || 0;
      row.minQty = collection.sampleMin ?? row.minQty;
      row.samplePrice = collection.samplePrice ?? row.samplePrice;
      row.sampleDeposit = collection.sampleDeposit ?? row.sampleDeposit;
      if (!row.unitCost && stock.unitCost) row.unitCost = Number(stock.unitCost) || 0;
      row.procurements.push(...(stock.procurements ?? []));
      row.history.push(...(stock.history ?? []));
      if (stock.sourceRollId && !row.history.some((h) => h.note === 'Saldo awal sample (migrasi)')) {
        row.history.push({ at: new Date().toISOString(), action: 'Saldo awal sample', qty: 0, by: 'Sistem', note: 'Saldo awal sample (migrasi)' });
      }
    }
    if (!grouped.size) {
      const fabricCollections = (db.collections ?? []).filter((c) => (db.skus ?? []).some((s) => s.collectionId === c.id));
      let index = Number(db.sequences.sampleStock) || 0;
      for (const collection of fabricCollections) {
        index += 1;
        grouped.set(collection.id, {
          id: `SS-${String(index).padStart(4, '0')}`,
          collectionId: collection.id,
          skuId: null,
          qty: collection.sampleMin ?? 1,
          minQty: collection.sampleMin ?? 1,
          samplePrice: collection.samplePrice ?? 0,
          sampleDeposit: collection.sampleDeposit ?? 0,
          unitCost: 0,
          location: 'Showroom Jakarta',
          procurements: [],
          updatedAt: new Date().toISOString(),
          history: [],
        });
      }
      db.sequences.sampleStock = index;
    }
    let procurementSeq = Number(db.sequences.sampleProcurement) || 0;
    for (const row of grouped.values()) {
      if (!row.procurements.length && row.qty > 0) {
        procurementSeq += 1;
        row.procurements.push({
          id: `SPR-${String(procurementSeq).padStart(4, '0')}`,
          qty: row.qty,
          unitCost: row.unitCost,
          totalCost: row.qty * row.unitCost,
          supplierId: null,
          date: new Date().toISOString().slice(0, 10),
          notes: 'Saldo awal sample (migrasi).',
          createdAt: new Date().toISOString(),
          createdBy: 'Sistem',
        });
      }
      row.history.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
    }
    db.sampleStocks = [...grouped.values()];
    db.sequences.sampleStock = Math.max(Number(db.sequences.sampleStock) || 0, db.sampleStocks.length);
    const procurementCount = db.sampleStocks.reduce((a, s) => a + (s.procurements?.length ?? 0), 0);
    db.sequences.sampleProcurement = Math.max(procurementSeq, procurementCount);
  }
  if (!(db.sellPriceHistory ?? []).length) {
    let index = Number(db.sequences.sellPriceHistory) || 0;
    for (const item of [...(db.skus ?? []), ...(db.parts ?? [])]) {
      if (!item.sellPrice) continue;
      index += 1;
      db.sellPriceHistory.push({
        id: `SPH-${String(index).padStart(4, '0')}`,
        itemType: item.collectionId ? 'sku' : 'part',
        itemId: item.id,
        oldPrice: 0,
        newPrice: item.sellPrice,
        changedAt: `${item.sellPriceUpdatedAt ?? '2026-06-01'}T09:00:00+07:00`,
        changedBy: 'Sistem',
        note: 'Migrasi harga awal.',
      });
    }
    db.sequences.sellPriceHistory = index;
  }
  const internalTransport = (db.transportCompanies ?? []).find((t) => t.code === 'internal') ?? null;
  db.fleetAssets = (db.fleetAssets ?? []).filter((a) => {
    if ((a.ownership ?? 'internal') === 'internal') return true;
    // Drop the old mock courier vehicles (Lalamove/J&T/JNE); a real vehicle
    // mislabelled as third-party becomes part of the internal fleet.
    return !/lalamove|j&t|jne/i.test(`${a.code} ${a.name}`);
  });
  for (const asset of db.fleetAssets) {
    asset.ownership = 'internal';
    if (!asset.transportId && internalTransport) asset.transportId = internalTransport.id;
    const transport = (db.transportCompanies ?? []).find((t) => t.id === asset.transportId);
    if (transport?.type === 'third_party' && internalTransport) asset.transportId = internalTransport.id;
    if (asset.capacityKg === undefined) asset.capacityKg = 0;
    if (asset.active === undefined) asset.active = true;
  }
  for (const driver of db.drivers ?? []) {
    const asset = db.fleetAssets.find((a) => a.driverId === driver.id);
    if (asset) {
      driver.vehicleType = asset.type;
      driver.plateNumber = asset.code;
      driver.transportId = asset.transportId ?? driver.transportId;
    }
  }
  for (const delivery of db.deliveries) {
    if (delivery.recipientName === undefined) delivery.recipientName = delivery.customerName ?? '';
    if (delivery.recipientPhone === undefined) delivery.recipientPhone = '';
    if (!delivery.service) delivery.service = 'REG';
    if (delivery.weightKg === undefined) delivery.weightKg = 0;
    if (delivery.pieces === undefined) delivery.pieces = 0;
    if (delivery.shippingCost === undefined) delivery.shippingCost = 0;
    if (delivery.insurance === undefined) delivery.insurance = 0;
    if (delivery.codAmount === undefined) delivery.codAmount = 0;
    if (delivery.instructions === undefined) delivery.instructions = '';
    if (delivery.courier !== 'internal') {
      delivery.fleetAssetId = null;
      delivery.vehicleName = '';
    } else {
      const fleet = db.fleetAssets.find((a) => a.id === delivery.fleetAssetId)
        ?? db.fleetAssets.find((a) => a.driverId === delivery.driverId)
        ?? null;
      delivery.fleetAssetId = fleet?.id ?? null;
      delivery.vehicleName = fleet?.name ?? '';
      if (fleet) {
        delivery.vehicleType = fleet.type;
        delivery.plateNumber = fleet.code;
      }
    }
    if (delivery.transportName === undefined) {
      const driver = (db.drivers ?? []).find((d) => d.id === delivery.driverId);
      const courierTransport = (db.transportCompanies ?? []).find((t) => t.code === delivery.courier) ?? null;
      const driverTransport = driver?.transportId
        ? (db.transportCompanies ?? []).find((t) => t.id === driver.transportId) ?? null
        : null;
      const transport = (delivery.courier !== 'internal' ? courierTransport : null) ?? driverTransport ?? courierTransport ?? null;
      delivery.transportId = delivery.transportId ?? transport?.id ?? null;
      delivery.transportName = transport?.name ?? '';
    }
  }
  if (previousVersion > 0 && previousVersion < 13 && (db.transportCompanies ?? []).length > 0) {
    // v2.12 adds J&T/JNE and the demo fleet. Existing datasets keep their
    // records and gain the missing reference data once during migration.
    const usedTransportIds = new Set(db.transportCompanies.map((t) => t.id));
    const ensureTransport = (code, def) => {
      const existing = db.transportCompanies.find((t) => t.code === code);
      if (existing) return existing;
      let n = 1;
      while (usedTransportIds.has(`TRP-${String(n).padStart(3, '0')}`)) n += 1;
      const id = `TRP-${String(n).padStart(3, '0')}`;
      const transport = { id, code, active: true, createdAt: new Date().toISOString(), ...def };
      usedTransportIds.add(id);
      db.transportCompanies.push(transport);
      return transport;
    };
    ensureTransport('jnt', {
      name: 'J&T Express', type: 'third_party', contact: 'J&T Care', phone: '021-8066-1888',
      address: 'Jakarta / Bali', notes: 'Ekspedisi reguler dan kargo.',
    });
    ensureTransport('jne', {
      name: 'JNE Express', type: 'third_party', contact: 'JNE Care', phone: '021-2927-8888',
      address: 'Jakarta / Bali', notes: 'REG / YES / OKS.',
    });
    if (!db.fleetAssets.length) {
      const usedFleetIds = new Set();
      let fleetSeq = 1;
      const nextFleetId = () => {
        while (usedFleetIds.has(`FLT-${String(fleetSeq).padStart(3, '0')}`)) fleetSeq += 1;
        const id = `FLT-${String(fleetSeq).padStart(3, '0')}`;
        usedFleetIds.add(id);
        fleetSeq += 1;
        return id;
      };
      const transportOfCode = (code) => db.transportCompanies.find((t) => t.code === code) ?? null;
      const driverOfId = (id) => (db.drivers ?? []).find((d) => d.id === id) ?? null;
      const seedAssets = [
        { code: 'B 1234 CD', name: 'Honda Vario 160', type: 'motor', transportCode: 'internal', driverId: 'DRV-001', capacityKg: 50, taxExpiry: '2027-03-31', notes: 'Motor operasional Jakarta.' },
        { code: 'B 9876 EF', name: 'Toyota Hilux Pickup', type: 'mobil', transportCode: 'internal', driverId: 'DRV-002', capacityKg: 800, taxExpiry: '2027-01-31', notes: 'Mobil boks kecil.' },
        { code: 'B 5566 GH', name: 'Isuzu Elf', type: 'truk', transportCode: 'internal', driverId: 'DRV-003', capacityKg: 2500, taxExpiry: '2026-12-31', notes: 'Truk engkel untuk roll panjang.' },
      ];
      for (const def of seedAssets) {
        const transport = transportOfCode(def.transportCode);
        const driver = def.driverId ? driverOfId(def.driverId) : null;
        db.fleetAssets.push({
          id: nextFleetId(), code: def.code, name: def.name, type: def.type, ownership: 'internal',
          transportId: transport?.id ?? null, driverId: driver?.id ?? null,
          capacityKg: def.capacityKg, taxExpiry: def.taxExpiry, active: true, notes: def.notes,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }
  for (const delivery of db.deliveries) {
    if (delivery.courier !== 'internal' || delivery.fleetAssetId) continue;
    const fleet = db.fleetAssets.find((a) => a.driverId === delivery.driverId) ?? null;
    if (!fleet) continue;
    delivery.fleetAssetId = fleet.id;
    delivery.vehicleName = fleet.name;
    delivery.vehicleType = fleet.type;
    delivery.plateNumber = fleet.code;
  }
  db.sequences.transport = Math.max(Number(db.sequences.transport) || 0, (db.transportCompanies ?? []).length);
  db.sequences.fleetAsset = Math.max(Number(db.sequences.fleetAsset) || 0, (db.fleetAssets ?? []).length);
  if (!Array.isArray(db.workCenters) || !db.workCenters.length) {
    db.workCenters = [
      { id: 'wc-cut', stage: 'cutting', name: 'Meja potong', capacityPerDay: 40, ratePerPiece: 5000 },
      { id: 'wc-sew', stage: 'sewing', name: 'Meja jahit', capacityPerDay: 25, ratePerPiece: 12000 },
      { id: 'wc-qc', stage: 'qc', name: 'QC & packing', capacityPerDay: 35, ratePerPiece: 3000 },
    ];
  }
  for (const s of db.suppliers ?? []) {
    if (!s.origin) s.origin = 'local';
    if (!s.currency) s.currency = 'IDR';
    if (!s.fxRate) s.fxRate = 1;
    if (!s.country) s.country = 'ID';
  }
  for (const po of db.purchaseOrders ?? []) {
    if (!po.currency) po.currency = 'IDR';
    if (!po.fxRate) po.fxRate = 1;
    if (po.totalForeign === undefined) po.totalForeign = po.total ?? 0;
    for (const line of po.lines ?? []) {
      if (line.unitCostIdr === undefined) line.unitCostIdr = line.unitPrice ?? 0;
      if (!line.currency) line.currency = po.currency;
    }
  }
  for (const bill of db.supplierInvoices ?? []) {
    if (!bill.currency) bill.currency = 'IDR';
    if (!bill.fxRate) bill.fxRate = 1;
    if (bill.amountForeign === undefined) bill.amountForeign = bill.amount ?? 0;
    if (bill.paidForeign === undefined) bill.paidForeign = bill.paid ?? 0;
  }
  db.settings = { ...DEFAULT_SETTINGS, ...(db.settings ?? {}) };
  // Brand rename: keep existing local datasets consistent without touching
  // storage keys or transaction IDs.
  const oldCompany = 'PT Lajur Tekstil Nusantara';
  const newCompany = 'PT Lavishome Tekstil Nusantara';
  if (db.meta.company === oldCompany) db.meta.company = newCompany;
  if (db.settings.company === oldCompany) db.settings.company = newCompany;
  for (const transport of db.transportCompanies ?? []) {
    if (transport.name === 'Lajur Fleet') transport.name = 'Lavishome Fleet';
  }
  for (const part of db.parts ?? []) {
    if (part.brand === 'Lajur') part.brand = 'Lavishome';
  }
  for (const supplier of db.suppliers ?? []) {
    supplier.name = String(supplier.name ?? '')
      .replace('Ningbo Lajur Textiles', 'Ningbo Lavishome Textiles')
      .replace('Shaoxing Lajur Fabrics', 'Shaoxing Lavishome Fabrics');
    supplier.email = String(supplier.email ?? '')
      .replace('ningbolajur.cn', 'ningbolavishome.cn')
      .replace('shaoxinglajur.cn', 'shaoxinglavishome.cn');
  }
  for (const delivery of db.deliveries ?? []) {
    if (delivery.transportName === 'Lajur Fleet') delivery.transportName = 'Lavishome Fleet';
  }
  if (previousVersion > 0 && previousVersion < 8) {
    // v2.6 ships with Pesanan and WIP hidden; managers can re-enable them in Settings.
    db.settings.salesOrderEnabled = false;
    db.settings.productionEnabled = false;
  }
  for (const part of db.parts ?? []) {
    if (!part.parentPartId) continue;
    const parent = db.parts.find((p) => p.id === part.parentPartId);
    if (!parent || parent.id === part.id || parent.categoryId !== part.categoryId) part.parentPartId = null;
  }
  for (const u of db.users ?? []) {
    if (u.active === undefined) u.active = true;
    const renamed = {
      'u-mgr': ['Arif Wibowo', 'Henry Martin'],
      'u-op': ['Rani Pratama', 'Henny'],
      'u-sales': ['Dimas Anggara', 'Belinda'],
    }[u.id];
    if (renamed && u.name === renamed[0]) u.name = renamed[1];
  }
  return db;
}

function loadDataset(dataset) {
  let db = readJson(keys[dataset]);
  if (!db) {
    db = buildSeed({ dataset });
    if (storage.available) {
      try {
        localStorage.setItem(keys[dataset], JSON.stringify(db));
      } catch (err) {
        storage.lastError = err;
      }
    }
  } else {
    const previous = db.meta?.version;
    db = migrate(db);
    if (db.meta.version !== previous && storage.available) {
      try {
        localStorage.setItem(keys[dataset], JSON.stringify(db));
      } catch (err) {
        storage.lastError = err;
      }
    }
  }
  return db;
}

export const store = {
  init() {
    const ui = readJson(keys.ui);
    if (ui && ui.role) state.ui = { ...defaultUi, ...ui };
    state.dataset = 'main';
    state.db = loadDataset('main');
    return state;
  },

  get state() {
    return state;
  },
  get db() {
    return state.db;
  },
  get dataset() {
    return state.dataset;
  },
  get ui() {
    return state.ui;
  },
  get simExists() {
    return Boolean(readJson(keys.sim));
  },

  subscribe(fn) {
    state.listeners.add(fn);
    return () => state.listeners.delete(fn);
  },

  emit() {
    for (const fn of state.listeners) fn(state);
  },

  setUi(patch, { rerender = true } = {}) {
    state.ui = { ...state.ui, ...patch };
    try {
      localStorage.setItem(keys.ui, JSON.stringify(state.ui));
    } catch {
      /* ignore quota */
    }
    if (rerender) this.emit();
  },

  /** Apply a domain mutation to a clone, then commit or discard. */
  update(fn, { silent = false } = {}) {
    const draft = clone(state.db);
    const result = fn(draft);
    state.db = draft;
    persist();
    if (!silent) this.emit();
    return result;
  },

  switchDataset(dataset) {
    if (dataset === 'sim') {
      state.db = loadDataset('sim');
    } else {
      state.db = loadDataset('main');
    }
    state.dataset = dataset;
    this.emit();
  },

  ensureSimulation() {
    if (!readJson(keys.sim)) {
      const db = buildSeed({ dataset: 'sim' });
      db.meta.seededAt = new Date().toISOString();
      state.db = db;
      state.dataset = 'sim';
      persist('sim');
      this.emit();
      return db;
    }
    this.switchDataset('sim');
    return state.db;
  },

  resetSimulation() {
    state.db = buildSeed({ dataset: 'sim' });
    state.dataset = 'sim';
    persist('sim');
    this.emit();
  },

  resetMain() {
    state.db = buildSeed({ dataset: 'main' });
    state.dataset = 'main';
    persist('main');
    this.emit();
  },

  exportCurrent() {
    return exportBackup(state.db);
  },

  restore(payload) {
    const db = migrate(restoreBackup(payload));
    const dataset = db.meta?.dataset === 'sim' ? 'sim' : 'main';
    state.db = db;
    state.dataset = dataset;
    persist(dataset);
    this.emit();
    return dataset;
  },
};

export default store;
