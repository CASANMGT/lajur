import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSeed } from '../src/domain/seed.js';
import { approvePO, createPO, paySupplierInvoice, receivePO } from '../src/domain/purchasing.js';
import { createShipment, shipmentProgress, updateShipmentStatus, landedAddPerUnit } from '../src/domain/shipments.js';
import { completeTask, createTask, startTask, taskStats } from '../src/domain/tasks.js';

const OP = { id: 'u-op', name: 'Rani', role: 'operator' };
const MGR = { id: 'u-mgr', name: 'Arif', role: 'manager' };
const SALES = { id: 'u-sales', name: 'Dimas', role: 'sales' };

test('import PO in CNY carries FX, landed cost and CNY payable', () => {
  const db = buildSeed();
  const po = createPO(db, {
    supplierId: 'SUP-004',
    date: '2026-11-01',
    expectedDate: '2026-12-01',
    lines: [{ kind: 'fabric', skuId: 'sku-luna-01', qtyMm: 50000, unitPrice: 26.5 }],
    user: OP,
  });
  assert.equal(po.currency, 'CNY');
  assert.equal(po.fxRate, 2250);
  assert.equal(po.lines[0].unitCostIdr, 59625);
  assert.equal(po.total, Math.round(26.5 * 50 * 2250));

  approvePO(db, { id: po.id, user: MGR });
  const shipment = createShipment(db, {
    poId: po.id, mode: 'sea', reference: 'TEST-CN-1',
    etd: '2026-11-02', eta: '2026-11-20',
    costs: { freightIdr: 500000, dutyIdr: 100000 },
    user: OP,
  });
  assert.equal(shipment.landedCostIdr, 600000);
  const allocation = landedAddPerUnit(db, po.id);
  assert.equal(Math.round(allocation.totals.get(po.lines[0].id)), 12000);
  assert.equal(shipmentProgress(shipment)[0].state, 'current');

  updateShipmentStatus(db, { id: shipment.id, status: 'received', date: '2026-11-20', user: OP });
  assert.equal(shipment.status, 'received');
  assert.equal(shipmentProgress(shipment).at(-1).state, 'current');

  const { receipt } = receivePO(db, {
    poId: po.id, ref: 'GR-TEST-CN-1', date: '2026-11-21', warehouseId: 'wh-jkt',
    lines: [{ poLineId: po.lines[0].id, lots: [{ lot: 'CN-TEST', lengthsMm: [50000] }] }],
    user: OP,
  });
  const roll = db.rolls.find((r) => r.lot === 'CN-TEST');
  assert.equal(roll.costPerM, 71625);
  assert.equal(receipt.currency, 'CNY');

  const bill = db.supplierInvoices.find((b) => b.receiptId === receipt.id);
  assert.equal(bill.currency, 'CNY');
  assert.equal(bill.amountForeign, 1325);
  assert.equal(bill.amount, 3581250);
  paySupplierInvoice(db, { id: bill.id, amount: 2250000, amountForeign: 1000, user: MGR });
  assert.equal(bill.paidForeign, 1000);
  assert.equal(bill.status, 'partial');
});

test('operational task lifecycle keeps stock untouched and stores proof', () => {
  const db = buildSeed();
  const before = db.rolls.find((r) => r.id === 'RL-0001').currentMm;
  const task = createTask(db, {
    type: 'cutting',
    title: 'Potong uji 2 m',
    warehouseId: 'wh-jkt',
    assigneeId: 'u-op',
    dueDate: '2026-11-09',
    rollId: 'RL-0001',
    qtyMm: 2000,
    user: SALES,
  });
  assert.equal(task.status, 'open');
  startTask(db, { id: task.id, user: OP });
  assert.equal(task.status, 'in_progress');
  completeTask(db, {
    id: task.id,
    note: 'Potong selesai 2 m.',
    attachment: { name: 'bukti.jpg', type: 'image/jpeg', size: 1200 },
    user: OP,
  });
  assert.equal(task.status, 'done');
  assert.equal(task.attachments.length, 1);
  assert.equal(task.completionNote, 'Potong selesai 2 m.');
  assert.equal(db.rolls.find((r) => r.id === 'RL-0001').currentMm, before);
  assert.equal(taskStats(db, { warehouseId: 'wh-jkt' }).doneToday >= 1, true);
});

test('task creation requires an active warehouse and known type', () => {
  const db = buildSeed();
  assert.throws(
    () => createTask(db, { type: 'cutting', warehouseId: 'wh-hantu', user: OP }),
    (err) => err.code === 'WAREHOUSE_NOT_FOUND',
  );
  assert.throws(
    () => createTask(db, { type: 'dance', warehouseId: 'wh-jkt', user: OP }),
    (err) => err.code === 'INVALID_TASK_TYPE',
  );
});

test('duplicate shipment reference is rejected', () => {
  const db = buildSeed();
  const po = db.purchaseOrders.find((p) => p.id === 'PO-0004');
  assert.throws(
    () => createShipment(db, {
      poId: po.id, mode: 'air', reference: 'MSCU-7788123',
      etd: '2026-11-01', eta: '2026-11-10', user: OP,
    }),
    (err) => err.code === 'DUPLICATE_SHIPMENT',
  );
});
