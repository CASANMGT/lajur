/**
 * Local persistence for two independent datasets: `main` and `sim`.
 * A mutation is applied to a clone; only a successful commit replaces state.
 */

import { clone } from '../domain/core.js';
import { buildSeed } from '../domain/seed.js';
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
  db.meta = db.meta ?? {};
  db.meta.version = SCHEMA_VERSION;
  db.warehouses = db.warehouses ?? [];
  for (const wh of db.warehouses) {
    if (wh.active === undefined) wh.active = true;
  }
  for (const key of ['goodsReceipts', 'supplierInvoices', 'returns', 'opnameSessions', 'audit']) {
    if (!Array.isArray(db[key])) db[key] = [];
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
