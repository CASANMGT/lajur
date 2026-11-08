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
  for (const wh of db.warehouses) {
    if (wh.active === undefined) wh.active = true;
  }
  for (const key of ['goodsReceipts', 'supplierInvoices', 'shipments', 'tasks', 'orders', 'deliveries', 'productionOrders', 'productionPieces', 'payrollEntries', 'returns', 'opnameSessions', 'audit', 'supplierPrices', 'fxRates']) {
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
