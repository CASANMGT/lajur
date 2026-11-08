import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSeed } from '../src/domain/seed.js';
import {
  cancelOrder, capacityLoad, createProductionOrder, cutOrder, orderStats, payPayroll, qcPiece,
  releaseOrder, reworkPiece, sewPiece,
} from '../src/domain/production.js';

const MGR = { id: 'u-mgr', name: 'Arif', role: 'manager' };
const OP = { id: 'u-op', name: 'Rani', role: 'operator' };

test('production cutting splits a reserved roll into pieces and creates payroll', () => {
  const db = buildSeed();
  const roll = db.rolls.find((r) => r.id === 'RL-0001');
  const before = roll.currentMm;
  const order = createProductionOrder(db, {
    warehouseId: 'wh-jkt',
    targetDate: '2026-11-20',
    lines: [{ rollId: roll.id, qtyMm: 10000, pieceLengthMm: 2400 }],
    user: MGR,
  });
  assert.equal(roll.reservedMm, 10000);
  releaseOrder(db, { id: order.id, user: MGR });
  cutOrder(db, { id: order.id, user: OP });

  const pieces = db.productionPieces.filter((p) => p.orderId === order.id);
  assert.equal(pieces.length, 5);
  assert.equal(pieces.reduce((a, p) => a + p.qtyMm, 0), 10000);
  assert.equal(pieces.filter((p) => p.qtyMm === 2400).length, 4);
  assert.equal(roll.currentMm, before - 10000);
  assert.equal(roll.reservedMm, 0);
  const payroll = db.payrollEntries.filter((p) => p.orderId === order.id);
  assert.equal(payroll.length, 5);
  assert.equal(payroll.reduce((a, p) => a + p.amount, 0), 25000);
});

test('piece follows cutting → sewing → QC; reject can be reworked', () => {
  const db = buildSeed();
  const order = createProductionOrder(db, {
    warehouseId: 'wh-jkt',
    targetDate: '2026-11-20',
    lines: [{ rollId: 'RL-0001', qtyMm: 4800, pieceLengthMm: 2400 }],
    user: MGR,
  });
  cutOrder(db, { id: order.id, user: OP });
  const [p1, p2] = db.productionPieces.filter((p) => p.orderId === order.id);

  sewPiece(db, { pieceId: p1.id, user: OP });
  qcPiece(db, { pieceId: p1.id, pass: true, note: 'Rapi', user: OP });
  assert.equal(p1.stage, 'done');

  sewPiece(db, { pieceId: p2.id, user: OP });
  qcPiece(db, { pieceId: p2.id, pass: false, note: 'Miring', user: OP });
  assert.equal(p2.stage, 'rejected');
  let stats = orderStats(db, order);
  assert.equal(stats.rejected, 1);
  reworkPiece(db, { pieceId: p2.id, user: OP });
  assert.equal(p2.stage, 'sewing');

  stats = orderStats(db, order);
  assert.equal(stats.pieces, 2);
  assert.equal(stats.done, 1);
  assert.equal(stats.rejected, 0);
  assert.equal(stats.payroll > 0, true);
});

test('production order cannot be cut twice, and cancel releases reservation', () => {
  const db = buildSeed();
  const order = createProductionOrder(db, {
    warehouseId: 'wh-jkt',
    targetDate: '2026-11-20',
    lines: [{ rollId: 'RL-0001', qtyMm: 2400, pieceLengthMm: 2400 }],
    user: MGR,
  });
  cutOrder(db, { id: order.id, user: OP });
  assert.throws(
    () => cutOrder(db, { id: order.id, user: OP }),
    (err) => err.code === 'INVALID_STATUS',
  );

  const draft = createProductionOrder(db, {
    warehouseId: 'wh-jkt',
    targetDate: '2026-11-21',
    lines: [{ rollId: 'RL-0001', qtyMm: 1200, pieceLengthMm: 1200 }],
    user: MGR,
  });
  const roll = db.rolls.find((r) => r.id === 'RL-0001');
  assert.equal(roll.reservedMm, 1200);
  cancelOrder(db, { id: draft.id, user: MGR });
  assert.equal(roll.reservedMm, 0);
});

test('capacity load and payroll payment are derived from pieces', () => {
  const db = buildSeed();
  const order = createProductionOrder(db, {
    warehouseId: 'wh-jkt',
    targetDate: '2026-11-20',
    lines: [{ rollId: 'RL-0001', qtyMm: 4800, pieceLengthMm: 2400 }],
    user: MGR,
  });
  cutOrder(db, { id: order.id, user: OP });
  const load = capacityLoad(db);
  assert.equal(load.length, 3);
  assert.equal(load[0].load >= 2, true);
  const stats = orderStats(db, order);
  assert.equal(stats.unpaid > 0, true);
  payPayroll(db, { orderId: order.id, user: MGR });
  assert.equal(db.payrollEntries.filter((p) => p.orderId === order.id).every((p) => p.paid), true);
  assert.equal(orderStats(db, order).unpaid, 0);
});
