/**
 * Simple vs advanced operating mode.
 *
 * Simple keeps the daily warehouse/commercial flow: stock, tasks, transfers,
 * purchasing, invoices, customers, projects and samples. Advanced unlocks the
 * analytical and setup layers: reports, master data, simulation, WIP, sales
 * orders, tax invoices, surat jalan and import purchasing tabs.
 */

import { settingsOf } from './settings.js';

export const UI_MODE = {
  simple: { label: 'Sederhana', description: 'Operasi harian dasar' },
  advanced: { label: 'Lanjutan', description: 'Analitik, master data, dokumen pajak/pengiriman' },
};

export const ADVANCED_VIEWS = new Set(['laporan', 'simulasi', 'produksi', 'pesanan']);

export function uiMode(db) {
  return settingsOf(db).uiMode === 'advanced' ? 'advanced' : 'simple';
}

export function isAdvancedMode(db) {
  return uiMode(db) === 'advanced';
}

export function modeLabel(db) {
  return UI_MODE[uiMode(db)].label;
}
