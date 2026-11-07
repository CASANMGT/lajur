import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSeed } from '../src/domain/seed.js';
import { auditTrail, savePart, saveSku, saveUser } from '../src/domain/master.js';
import { saveSupplier } from '../src/domain/purchasing.js';
import { createSalesOrder, confirmOrder, convertOrderToInvoice, cancelOrder } from '../src/domain/orders.js';
import { saveSettings, settingsOf } from '../src/domain/settings.js';

const MGR = { id: 'u-mgr', name: 'Arif', role: 'manager' };
const SALES = { id: 'u-sales', name: 'Dimas', role: 'sales' };

test('spare part master stores brand, image, active flag and audit history', () => {
  const db = buildSeed();
  const part = savePart(db, {
    sku: 'MTR-02',
    name: 'Motor gorden premium',
    brand: 'Somfy',
    categoryId: 'cat-motor',
    buyPrice: 2100000,
    sellPrice: 2900000,
    image: 'data:image/png;base64,AAAA',
    notes: 'Untuk rel 4 m.',
    user: MGR,
  });
  assert.equal(part.brand, 'Somfy');
  assert.equal(part.image.startsWith('data:image'), true);
  assert.equal(db.parts.filter((p) => p.sku === 'MTR-02').length, 1);
  assert.ok(auditTrail(db, 'part', part.id).length >= 1);
  assert.throws(
    () => savePart(db, { sku: 'MTR-02', name: 'Duplikat', categoryId: 'cat-motor', user: MGR }),
    (err) => err.code === 'DUPLICATE_SKU',
  );
});

test('fabric product master keeps stable id on edit and supports image', () => {
  const db = buildSeed();
  const sku = saveSku(db, {
    collectionId: 'col-luna', code: 'Luna-09', colourCode: '09', colourName: 'Clay',
    image: 'data:image/png;base64,AAAA', user: MGR,
  });
  const id = sku.id;
  saveSku(db, {
    id, collectionId: 'col-luna', code: 'Luna-09B', colourCode: '09', colourName: 'Clay',
    image: sku.image, user: MGR,
  });
  assert.equal(db.skus.find((s) => s.id === id).code, 'Luna-09B');
  assert.equal(db.skus.find((s) => s.id === id).image.startsWith('data:image'), true);
});

test('supplier master adds local and import suppliers with FX validation', () => {
  const db = buildSeed();
  const local = saveSupplier(db, { code: 'BARU', name: 'CV Baru', origin: 'local', currency: 'IDR', user: MGR });
  assert.equal(local.currency, 'IDR');
  const imp = saveSupplier(db, {
    code: 'YIWU', name: 'Yiwu Import', origin: 'import', country: 'CN', currency: 'CNY',
    fxRate: 2280, incoterm: 'FOB Ningbo', port: 'Ningbo → Tanjung Priok', user: MGR,
  });
  assert.equal(imp.fxRate, 2280);
  assert.throws(
    () => saveSupplier(db, { code: 'YIWU', name: 'Duplikat', currency: 'CNY', fxRate: 1, user: MGR }),
    (err) => err.code === 'DUPLICATE_CODE',
  );
});

test('user master prevents removing the last active manager', () => {
  const db = buildSeed();
  assert.throws(
    () => saveUser(db, { id: 'u-mgr', name: 'Arif', role: 'manager', active: false, user: MGR }),
    (err) => err.code === 'LAST_MANAGER',
  );
  const second = saveUser(db, { name: 'Manajer Kedua', role: 'manager', active: true, user: MGR });
  assert.equal(second.active, true);
  saveUser(db, { id: 'u-mgr', name: 'Arif', role: 'manager', active: false, user: MGR });
  assert.equal(db.users.find((u) => u.id === 'u-mgr').active, false);
});

test('sales order does not move stock until converted, and converts once', () => {
  const db = buildSeed();
  const before = db.rolls.find((r) => r.id === 'RL-0001').currentMm;
  const order = createSalesOrder(db, {
    customerId: 'CUS-0002',
    date: '2026-11-08',
    lines: [{ kind: 'fabric', rollId: 'RL-0001', qtyMm: 10000 }],
    user: SALES,
  });
  assert.equal(order.status, 'draft');
  assert.equal(db.rolls.find((r) => r.id === 'RL-0001').currentMm, before);
  confirmOrder(db, { id: order.id, user: SALES });
  assert.equal(order.status, 'confirmed');
  const result = convertOrderToInvoice(db, { id: order.id, user: SALES });
  assert.equal(result.invoice.status, 'posted');
  assert.equal(order.status, 'converted');
  assert.equal(db.rolls.find((r) => r.id === 'RL-0001').currentMm, before - 10000);
  assert.throws(
    () => convertOrderToInvoice(db, { id: order.id, user: SALES }),
    (err) => err.code === 'INVALID_STATUS',
  );
});

test('cancelled order cannot be converted', () => {
  const db = buildSeed();
  const order = createSalesOrder(db, {
    customerId: 'CUS-0002',
    lines: [{ kind: 'fabric', rollId: 'RL-0001', qtyMm: 1000 }],
    user: SALES,
  });
  cancelOrder(db, { id: order.id, reason: 'Batal uji', user: SALES });
  assert.throws(
    () => convertOrderToInvoice(db, { id: order.id, user: SALES }),
    (err) => err.code === 'INVALID_STATUS',
  );
});

test('settings are merged, persisted and audited', () => {
  const db = buildSeed();
  assert.equal(settingsOf(db).salesOrderEnabled, true);
  saveSettings(db, { requireProofOnReceipt: true, taskDueDays: 3 }, MGR);
  assert.equal(settingsOf(db).requireProofOnReceipt, true);
  assert.equal(settingsOf(db).taskDueDays, 3);
  assert.ok(db.audit.some((a) => a.action === 'ubah_pengaturan'));
});
