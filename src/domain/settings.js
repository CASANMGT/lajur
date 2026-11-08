import { audit, isoNow } from './core.js';

export const DEFAULT_SETTINGS = {
  lowStockMm: 10000,
  taskDueDays: 1,
  requireProofOnReceipt: false,
  uiMode: 'simple',
  onlineAssignmentEnabled: true,
  salesOrderEnabled: false,
  productionEnabled: false,
  operatorCanSeeCosts: false,
  sampleDepositRequired: false,
};

export function settingsOf(db) {
  return { ...DEFAULT_SETTINGS, ...(db.settings ?? {}) };
}

export function saveSettings(db, patch, user) {
  db.settings = { ...settingsOf(db), ...patch, updatedAt: isoNow() };
  audit(db, user, 'ubah_pengaturan', 'settings', 'global', Object.keys(patch).join(','));
  return db.settings;
}
