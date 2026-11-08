import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSeed } from '../src/domain/seed.js';
import {
  availableMm, partStockRow, rollAncestors, rollDescendants, rollHierarchy, splitRoll,
} from '../src/domain/inventory.js';
import { cancelOrder, createSalesOrder, updateSalesOrder } from '../src/domain/orders.js';
import {
  latestFxRate, latestSupplierPrice, saveSupplierPrice, suppliersOfItem,
} from '../src/domain/pricing.js';
import { createPO } from '../src/domain/purchasing.js';

const MGR = { id: 'u-mgr', name: 'Arif', role: 'manager' };

test('roll hierarchy groups root rolls and descendants per collection', () => {
  const db = buildSeed();
  const before = db.rolls.find((r) => r.id === 'RL-0001').currentMm;
  const { piece } = splitRoll(db, { rollId: 'RL-0001', qtyMm: 5000, user: MGR, ref: 'TEST-SPLIT' });

  assert.equal(piece.parentRollId, 'RL-0001');
  assert.equal(piece.rootRollId, 'RL-0001');
  assert.equal(db.rolls.find((r) => r.id === 'RL-0001').currentMm, before - 5000);
  assert.deepEqual(rollAncestors(db, piece.id).map((r) => r.id), ['RL-0001']);
  assert.equal(rollDescendants(db, 'RL-0001').some((r) => r.id === piece.id), true);

  const groups = rollHierarchy(db, { warehouseId: 'wh-jkt' });
  const luna = groups.find((g) => g.name === 'Luna');
  assert.ok(luna);
  const sku01 = luna.skus.find((s) => s.sku.id === 'sku-luna-01');
  assert.ok(sku01);
  assert.equal(sku01.nodes.some((n) => n.children.some((c) => c.roll.id === piece.id)), true);
  assert.equal(sku01.physicalMm, db.rolls
    .filter((r) => r.skuId === 'sku-luna-01' && r.warehouseId === 'wh-jkt')
    .reduce((a, r) => a + r.currentMm, 0));
  assert.equal(luna.rollCount, db.rolls.filter((r) => r.warehouseId === 'wh-jkt'
    && db.skus.find((s) => s.id === r.skuId)?.collectionId === 'col-luna').length);
});

test('draft sales order shows creator, keeps prices, and can be edited with fresh reservations', () => {
  const db = buildSeed();
  const roll = db.rolls.find((r) => r.id === 'RL-0001');
  const reservedBefore = roll.reservedMm || 0;
  const partRow = partStockRow(db, 'part-runner', 'wh-jkt');
  const partReservedBefore = partRow.reserved || 0;

  const order = createSalesOrder(db, {
    customerId: 'CUS-0002',
    date: '2026-11-08',
    lines: [
      { kind: 'fabric', rollId: 'RL-0001', qtyMm: 10000, unitPrice: 125000 },
      { kind: 'part', partId: 'part-runner', qtyPcs: 2, unitPrice: 12000, warehouseId: 'wh-jkt' },
    ],
    user: MGR,
  });
  assert.equal(order.createdBy, 'Arif');
  assert.equal(order.userId, 'u-mgr');
  assert.equal(order.total, 1274000);
  assert.equal(roll.reservedMm, reservedBefore + 10000);
  assert.equal(partRow.reserved, partReservedBefore + 2);

  updateSalesOrder(db, {
    id: order.id,
    customerId: 'CUS-0002',
    projectId: null,
    date: '2026-11-08',
    lines: [{ kind: 'fabric', rollId: 'RL-0001', qtyMm: 12000, unitPrice: 130000 }],
    notes: 'Panjang dan harga disesuaikan.',
    user: MGR,
  });
  assert.equal(order.lines.length, 1);
  assert.equal(order.lines[0].unitPrice, 130000);
  assert.equal(order.total, 1560000);
  assert.equal(roll.reservedMm, reservedBefore + 12000);
  assert.equal(partRow.reserved, partReservedBefore);
  assert.equal(order.history.some((h) => h.action === 'Pesanan diubah'), true);

  cancelOrder(db, { id: order.id, user: MGR });
  assert.equal(roll.reservedMm, reservedBefore);
  assert.equal(order.status, 'cancelled');
});

test('supplier price history feeds master buy price and lists all suppliers', () => {
  const db = buildSeed();
  const latest = latestSupplierPrice(db, { supplierId: 'SUP-001', skuId: 'sku-luna-01', date: '2026-11-08' });
  assert.equal(latest.price, 69500);
  assert.equal(latest.currency, 'IDR');
  assert.deepEqual(
    suppliersOfItem(db, { skuId: 'sku-luna-01' }).map((s) => s.id).sort(),
    ['SUP-001', 'SUP-004'],
  );

  const saved = saveSupplierPrice(db, {
    supplierId: 'SUP-001', skuId: 'sku-luna-01', price: 71500, validFrom: '2026-11-08', user: MGR,
  });
  assert.equal(saved.record.price, 71500);
  assert.equal(db.skus.find((s) => s.id === 'sku-luna-01').buyPrice, 71500);
  assert.equal(latestSupplierPrice(db, { supplierId: 'SUP-001', skuId: 'sku-luna-01', date: '2026-11-08' }).price, 71500);
});

test('import PO requires a user-entered FX rate and records it', () => {
  const db = buildSeed();
  assert.equal(latestFxRate(db, 'CNY').rate, 2250);
  assert.throws(() => createPO(db, {
    supplierId: 'SUP-004',
    date: '2026-11-08',
    lines: [{ kind: 'fabric', skuId: 'sku-luna-01', qtyMm: 100000 }],
    user: MGR,
  }), (err) => err.code === 'INVALID_FX');

  const po = createPO(db, {
    supplierId: 'SUP-004',
    date: '2026-11-08',
    currency: 'CNY',
    fxRate: 2250,
    lines: [{ kind: 'fabric', skuId: 'sku-luna-01', qtyMm: 100000 }],
    user: MGR,
  });
  assert.equal(po.currency, 'CNY');
  assert.equal(po.fxRate, 2250);
  assert.equal(po.lines[0].unitPrice, 27);
  assert.equal(po.fxSource, 'Kurs manual PO');
  assert.equal(Boolean(po.fxAsOf), true);
  assert.equal(latestFxRate(db, 'CNY').rate, 2250);
  assert.equal(db.fxRates.filter((r) => r.currency === 'CNY').length, 4);

  const manual = createPO(db, {
    supplierId: 'SUP-004',
    date: '2026-11-08',
    currency: 'CNY',
    fxRate: 2300,
    fxSource: 'Kurs manual PO',
    lines: [{ kind: 'fabric', skuId: 'sku-luna-01', qtyMm: 1000 }],
    user: MGR,
  });
  assert.equal(manual.fxRate, 2300);
  assert.equal(manual.fxSource, 'Kurs manual PO');
  assert.equal(latestFxRate(db, 'CNY').rate, 2300);
  assert.equal(db.fxRates.filter((r) => r.currency === 'CNY').length, 5);
});

test('local PO defaults to the latest recorded supplier price', () => {
  const db = buildSeed();
  const po = createPO(db, {
    supplierId: 'SUP-001',
    date: '2026-11-08',
    lines: [{ kind: 'fabric', skuId: 'sku-luna-01', qtyMm: 1000 }],
    user: MGR,
  });
  assert.equal(po.lines[0].unitPrice, 69500);
  assert.equal(po.lines[0].unitCostIdr, 69500);
  assert.equal(availableMm(db.rolls.find((r) => r.id === 'RL-0001')) > 0, true);
});
