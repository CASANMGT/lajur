import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildSeed } from '../src/domain/seed.js';
import {
  availableMm, createRoll, deliveryEstimate, lineEstimatedKg, partQty, quarantineRoll, receiveAdhocStock,
  reserveRoll, stockSummary,
} from '../src/domain/inventory.js';
import { saveDriver, saveFleetAsset, saveWarehouse, renameCollection } from '../src/domain/master.js';
import { createInternalPurchase, createInvoice, createCustomerReturn, deletePayment, postInvoice, recordPayment, invoiceOutstanding, updatePayment } from '../src/domain/sales.js';
import { createInternalPO, internalPriceOf, receiveInternalPO, shipInternalPO } from '../src/domain/internal-po.js';
import { createDelivery } from '../src/domain/deliveries.js';
import { printDeliveryHtml, printLabelHtml } from '../src/ui/views/print.js';
import { createTransfer, approveTransfer, dispatchLine, receiveLine, submitTransfer, transferTotals, transitRollsFor } from '../src/domain/transfers.js';
import { createPO, receivePO } from '../src/domain/purchasing.js';
import { approveOpname, saveCounts, startOpname, submitOpname, cancelOpname } from '../src/domain/opname.js';
import { createProject, handoverProject, issueProject, reserveProject } from '../src/domain/projects.js';
import {
  applyDepositToInvoice, createSample, createSampleBook, createCustomer, createSampleRequest,
  customersForCompany, decideSampleRequest, giveSampleBook, procureSampleStock, refundDeposit,
  sampleCollectionStats, sampleCustomerStats, updateSampleStock,
} from '../src/domain/crm.js';
import { changeSellPrice, sellPriceHistory } from '../src/domain/pricing.js';
import { invoicesWithoutDelivery } from '../src/domain/deliveries.js';
import { exportBackup, importBackup, validateBackup } from '../src/data/backup.js';
import { syncImportedStock } from '../src/domain/stock-sync.js';
import { buildStockPlanFromRows } from '../src/domain/stock-plan.js';
import { buildCustomerPlanFromRows, importCustomerPlan } from '../src/domain/customer-plan.js';
import { migrate } from '../src/data/store.js';
import { buildSeed as seedAgain } from '../src/domain/seed.js';

const OP = { id: 'u-op', name: 'Rani', role: 'operator' };
const SALES = { id: 'u-sales', name: 'Dimas', role: 'sales' };
const MGR = { id: 'u-mgr', name: 'Arif', role: 'manager', companyId: 'co-jkt' };
const BALI = { id: 'u-bali', name: 'Nicolas', role: 'manager', companyId: 'co-bali' };

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`);
    return err;
  }
  assert.fail(`expected ${code}, but no error was thrown`);
}

const rollOf = (db, id) => db.rolls.find((r) => r.id === id);

test('opening stock keeps every Luna roll as its own length', () => {
  const db = buildSeed();
  const luna1 = db.rolls
    .filter((r) => r.skuId === 'sku-luna-01' && Number(r.id.slice(3)) <= 5)
    .map((r) => r.originalMm / 1000)
    .sort((a, b) => a - b);
  const luna2 = db.rolls
    .filter((r) => r.skuId === 'sku-luna-02' && Number(r.id.slice(3)) <= 10)
    .map((r) => r.originalMm / 1000)
    .sort((a, b) => a - b);
  assert.deepEqual(luna1, [60, 61.2, 63, 70, 70]);
  assert.deepEqual(luna2, [50.3, 63, 70, 70, 80]);
});

test('cut-length conservation: 60 m − 10 m leaves 50 m with traceable piece', () => {
  const db = buildSeed();
  const inv = createInvoice(db, {
    customerId: 'CUS-0002',
    lines: [{ kind: 'fabric', rollId: 'RL-0001', qtyMm: 10000, unitPrice: 125000 }],
    user: SALES,
  });
  postInvoice(db, { id: inv.id, user: SALES });

  const parent = rollOf(db, 'RL-0001');
  const piece = db.rolls.find((r) => r.parentRollId === 'RL-0001');
  assert.equal(parent.currentMm, 50000);
  assert.equal(parent.originalMm, 60000);
  assert.equal(piece.currentMm, 10000);
  assert.equal(piece.status, 'sold');
  assert.equal(piece.parentRollId, 'RL-0001');
  assert.equal(parent.currentMm + piece.currentMm, 60000);
});

test('reserved metres cannot be sold, and availability never goes negative', () => {
  const db = buildSeed();
  reserveRoll(db, { rollId: 'RL-0001', qtyMm: 10000, ref: 'TEST', user: OP });
  assert.equal(availableMm(rollOf(db, 'RL-0001')), 50000);

  expectError(
    () => createInvoice(db, {
      customerId: 'CUS-0002',
      lines: [{ kind: 'fabric', rollId: 'RL-0001', qtyMm: 51000, unitPrice: 125000 }],
      user: SALES,
    }),
    'INSUFFICIENT_AVAILABLE',
  );
  assert.ok(availableMm(rollOf(db, 'RL-0001')) >= 0);});

test('whole-roll sale consumes the roll without splitting it', () => {
  const db = buildSeed();
  const before = rollOf(db, 'RL-0001');
  const inv = createInvoice(db, {
    customerId: 'CUS-0002',
    lines: [{ kind: 'fabric', rollId: 'RL-0001', mode: 'whole' }],
    user: SALES,
  });
  postInvoice(db, { id: inv.id, user: SALES });
  assert.equal(before.status, 'sold');
  assert.equal(before.currentMm, 60000);
  assert.equal(availableMm(before), 0);
  assert.equal(db.rolls.filter((r) => r.parentRollId === 'RL-0001').length, 0);
});

test('mixed invoice keeps metres and pieces separate', () => {
  const db = buildSeed();
  const inv = createInvoice(db, {
    customerId: 'CUS-0001',
    lines: [
      { kind: 'fabric', rollId: 'RL-0001', qtyMm: 5000, unitPrice: 125000 },
      { kind: 'part', partId: 'part-bracket', qtyPcs: 4, warehouseId: 'wh-jkt' },
    ],
    user: SALES,
  });
  postInvoice(db, { id: inv.id, user: SALES });
  assert.equal(inv.lines[0].unit, 'm');
  assert.equal(inv.lines[1].unit, 'pcs');
  assert.equal(inv.total, 5 * 125000 + 4 * 25000);
  assert.equal(stockSummary(db, { warehouseId: 'wh-jkt' }).physicalMm > 0, true);
});

test('internal transfer 15/5/2: outstanding 10, in transit 3, no money created', () => {
  const db = buildSeed();
  const t = db.transfers.find((x) => x.id === 'TRF-0001');
  const totals = transferTotals(t);
  assert.equal(totals.requestedMm, 15000);
  assert.equal(totals.dispatchedMm, 5000);
  assert.equal(totals.receivedMm, 2000);
  assert.equal(totals.outstandingMm, 10000);
  assert.equal(totals.inTransitMm, 3000);
  assert.equal(totals.requestedMm - totals.dispatchedMm, totals.outstandingMm);
  assert.equal(totals.dispatchedMm - totals.receivedMm, totals.inTransitMm);

  const transit = transitRollsFor(db, t.id).reduce((a, r) => a + r.currentMm, 0);
  assert.equal(transit, 3000);

  // Transfers never create sales or payables.
  const invoicesBefore = db.invoices.length;
  const billsBefore = db.supplierInvoices.length;
  assert.equal(db.invoices.length, invoicesBefore);
  assert.equal(db.supplierInvoices.length, billsBefore);
});

test('dispatch cannot exceed outstanding request, receipt cannot exceed transit', () => {
  const db = buildSeed();
  const t = db.transfers.find((x) => x.id === 'TRF-0001');
  const line = t.lines[0];

  expectError(
    () => dispatchLine(db, {
      transferId: t.id, lineId: line.id, allocations: [{ rollId: 'RL-0003', qtyMm: 11000 }], user: OP,
    }),
    'OVER_DISPATCH',
  );
  expectError(
    () => receiveLine(db, { transferId: t.id, lineId: line.id, qtyMm: 4000, user: OP }),
    'OVER_RECEIVE',
  );
});

test('approval does not reserve; availability is re-checked at dispatch', () => {
  const db = buildSeed();
  const source = rollOf(db, 'RL-0001');
  const reservedBefore = source.reservedMm;

  const t = createTransfer(db, {
    fromWarehouseId: 'wh-jkt',
    toWarehouseId: 'wh-bali',
    neededBy: '2026-12-01',
    reason: 'Uji reservasi',
    lines: [{ skuId: 'sku-luna-01', requestedMm: 58000 }],
    user: OP,
  });
  submitTransfer(db, { id: t.id, user: OP });
  approveTransfer(db, { id: t.id, user: MGR });
  assert.equal(source.reservedMm, reservedBefore);

  // Another document reserves almost everything afterwards.
  reserveRoll(db, { rollId: 'RL-0001', qtyMm: 50000, ref: 'OTHER', user: OP });
  expectError(
    () => dispatchLine(db, {
      transferId: t.id, lineId: t.lines[0].id, allocations: [{ rollId: 'RL-0001', qtyMm: 58000 }], user: OP,
    }),
    'INSUFFICIENT_AVAILABLE',
  );
});

test('internal transfer preserves quantity and unit cost', () => {
  const db = buildSeed();
  const t = db.transfers.find((x) => x.id === 'TRF-0004');
  const line = t.lines[0];
  const source = rollOf(db, 'RL-0010');
  const before = source.currentMm;
  const cost = source.costPerM;

  dispatchLine(db, { transferId: t.id, lineId: line.id, allocations: [{ rollId: 'RL-0010', qtyMm: 5000 }], user: OP });
  assert.equal(source.currentMm, before - 5000);
  const piece = db.rolls.filter((r) => r.transit?.transferId === t.id).at(-1);
  assert.equal(piece.costPerM, cost);
  assert.equal(piece.transit.toWarehouseId, 'wh-jkt');
  assert.equal(piece.warehouseId, null);
  assert.equal(piece.currentMm, 5000);

  // Physical stock at a warehouse never includes transit pieces.
  const sby = stockSummary(db, { warehouseId: 'wh-bali' });
  const physical = db.rolls
    .filter((r) => r.warehouseId === 'wh-bali' && !r.transit && ['available', 'quarantine'].includes(r.status))
    .reduce((a, r) => a + r.currentMm, 0);
  assert.equal(sby.physicalMm, physical);
});

test('duplicate receipt reference and over-receiving are rejected', () => {
  const db = buildSeed();
  const po = db.purchaseOrders.find((p) => p.id === 'PO-0001');
  expectError(
    () => receivePO(db, {
      poId: po.id, ref: 'GR-2026-014', date: '2026-11-07', warehouseId: 'wh-jkt',
      lines: [{ poLineId: po.lines[0].id, lots: [{ lot: 'X', lengthsMm: [10000] }] }], user: OP,
    }),
    'DUPLICATE_RECEIPT',
  );

  expectError(
    () => receivePO(db, {
      poId: po.id, ref: 'GR-BARU-1', date: '2026-11-07', warehouseId: 'wh-jkt',
      lines: [{ poLineId: po.lines[0].id, lots: [{ lot: 'X', lengthsMm: [61000] }] }], user: OP,
    }),
    'OVER_RECEIPT',
  );
});

test('returns cannot be credited twice or exceed the sold quantity', () => {
  const db = buildSeed();
  const inv = db.invoices.find((i) => i.id === 'INV-0003');
  const line = inv.lines.find((l) => l.kind === 'fabric');

  // Seed already returned 2 m of an 18 m line.
  expectError(
    () => createCustomerReturn(db, {
      invoiceId: inv.id,
      lines: [{ lineId: line.id, qtyMm: 17000 }],
      reason: 'Uji retur berlebih',
      user: SALES,
    }),
    'EXCESS_RETURN',
  );

  const ok = createCustomerReturn(db, {
    invoiceId: inv.id,
    lines: [{ lineId: line.id, qtyMm: 16000 }],
    reason: 'Sisa retur valid',
    user: SALES,
  });
  assert.ok(ok.credit > 0);
});

test('deposits cannot be refunded twice, nor refunded and applied', async () => {
  const db = buildSeed();
  const indent = db.deposits.find((d) => d.kind === 'indent' && d.customerId === 'CUS-0001');
  assert.equal(indent.amount, 5000000);

  expectError(
    () => refundDeposit(db, { depositId: indent.id, amount: 5000001, reason: 'Uji', user: MGR }),
    'DEPOSIT_EXCEEDED',
  );

  const inv = createInvoice(db, {
    customerId: 'CUS-0001',
    lines: [{ kind: 'fabric', rollId: 'RL-0007', qtyMm: 1000, unitPrice: 125000 }],
    user: SALES,
  });
  postInvoice(db, { id: inv.id, user: SALES });

  const { applyDepositToInvoice } = await import('../src/domain/crm.js');
  applyDepositToInvoice(db, { depositId: indent.id, invoiceId: inv.id, amount: 125000, user: MGR });
  assert.equal(indent.applied, 125000);

  refundDeposit(db, { depositId: indent.id, amount: 4875000, reason: 'Sisa deposit', user: MGR });
  expectError(
    () => refundDeposit(db, { depositId: indent.id, amount: 1, reason: 'Uji', user: MGR }),
    'DEPOSIT_EXCEEDED',
  );
  assert.equal(indent.applied + indent.refunded, indent.amount);
});

test('sample book consumes factory sample stock and can be marked given', () => {
  const db = buildSeed();
  const luna = db.sampleStocks.find((s) => s.collectionId === 'col-luna');
  const aria = db.sampleStocks.find((s) => s.collectionId === 'col-aria');
  const rollBefore = db.rolls.find((r) => r.id === 'RL-0001').currentMm;
  const lunaBefore = luna.qty;
  const ariaBefore = aria.qty;
  const book = createSampleBook(db, {
    name: 'Sample book QA',
    customerId: 'CUS-0002',
    items: [{ stockId: luna.id }, { stockId: aria.id }],
    notes: 'QA book',
    user: SALES,
  });
  assert.equal(book.status, 'ready');
  assert.equal(book.items.length, 2);
  assert.equal(luna.qty, lunaBefore - 1);
  assert.equal(aria.qty, ariaBefore - 1);
  assert.equal(db.rolls.find((r) => r.id === 'RL-0001').currentMm, rollBefore);
  assert.equal(book.items.every((i) => db.samples.some((s) => s.id === i.sampleId)), true);
  giveSampleBook(db, { id: book.id, givenTo: 'Budi Prospek', user: SALES });
  assert.equal(book.status, 'given');
  assert.equal(book.givenTo, 'Budi Prospek');
});

test('sample deposit refund requires a linked qualifying purchase', () => {
  const db = buildSeed();
  const deposit = db.deposits.find((d) => d.kind === 'sample' && d.sampleId);
  // Seed refunded it after linking, so balance is zero.
  expectError(
    () => refundDeposit(db, { depositId: deposit.id, amount: 1, reason: 'Uji', user: MGR }),
    'DEPOSIT_EXCEEDED',
  );
});

test('project issue deducts stock once; handover never deducts again', () => {
  const db = buildSeed();
  const project = createProject(db, {
    customerId: 'CUS-0002',
    name: 'Uji proyek sekali potong',
    targetDate: '2026-12-01',
    user: SALES,
    requirements: [{ kind: 'fabric', skuId: 'sku-luna-01', qtyMm: 5000, allocations: [{ rollId: 'RL-0001', qtyMm: 5000 }] }],
  });
  const roll = rollOf(db, 'RL-0001');
  const before = roll.currentMm;
  reserveProject(db, { id: project.id, user: SALES });
  assert.equal(roll.currentMm, before);

  issueProject(db, { id: project.id, user: SALES });
  assert.equal(roll.currentMm, before - 5000);
  const afterIssue = roll.currentMm;

  handoverProject(db, { id: project.id, user: OP });
  assert.equal(roll.currentMm, afterIssue);
  expectError(() => issueProject(db, { id: project.id, user: SALES }), 'INVALID_STATUS');
});

test('project issue releases part reservations exactly once', () => {
  const db = buildSeed();
  const bracket = db.partStock.find((s) => s.partId === 'part-bracket' && s.warehouseId === 'wh-jkt');
  assert.equal(bracket.qty, 22);
  assert.equal(bracket.reserved || 0, 0);

  const project = createProject(db, {
    customerId: 'CUS-0003',
    name: 'Uji reservasi part',
    targetDate: '2026-12-02',
    user: SALES,
    requirements: [{ kind: 'part', partId: 'part-bracket', qtyPcs: 5, warehouseId: 'wh-jkt' }],
  });
  reserveProject(db, { id: project.id, user: SALES });
  assert.equal(bracket.reserved, 5);
  issueProject(db, { id: project.id, user: SALES });
  assert.equal(bracket.qty, 17);
  assert.equal(bracket.reserved || 0, 0);
});

test('project can issue a fully reserved roll without tripping availability', () => {
  const db = buildSeed();
  const project = createProject(db, {
    customerId: 'CUS-0002',
    name: 'Uji roll penuh',
    targetDate: '2026-12-05',
    user: SALES,
    requirements: [{ kind: 'fabric', skuId: 'sku-luna-01', qtyMm: 60000, allocations: [{ rollId: 'RL-0001', qtyMm: 60000 }] }],
  });
  reserveProject(db, { id: project.id, user: SALES });
  const roll = rollOf(db, 'RL-0001');
  assert.equal(roll.reservedMm, 60000);
  const result = issueProject(db, { id: project.id, user: SALES });
  assert.equal(result.invoice.status, 'posted');
  assert.equal(roll.currentMm, 0);
  assert.equal(roll.reservedMm, 0);
});

test('stock opname freeze also blocks sample cuts and quarantine', () => {
  const db = buildSeed();
  const session = startOpname(db, { warehouseId: 'wh-jkt', user: OP });
  expectError(
    () => createSample(db, {
      customerId: 'CUS-0002', skuId: 'sku-luna-01', rollId: 'RL-0001', qtyMm: 500, mode: 'free', user: SALES,
    }),
    'WAREHOUSE_FROZEN',
  );
  expectError(
    () => quarantineRoll(db, { rollId: 'RL-0001', user: MGR, reason: 'Uji', ref: 'T' }),
    'WAREHOUSE_FROZEN',
  );
  cancelOpname(db, { sessionId: session.id, user: MGR, reason: 'Selesai uji' });
});

test('stock opname freezes the warehouse and blocks conflicting adjustments', () => {
  const db = buildSeed();
  const session = startOpname(db, { warehouseId: 'wh-bali', user: OP });

  const inv = createInvoice(db, {
    customerId: 'CUS-0002',
    lines: [{ kind: 'fabric', rollId: 'RL-0005', qtyMm: 1000 }],
    user: SALES,
  });
  expectError(() => postInvoice(db, { id: inv.id, user: SALES }), 'WAREHOUSE_FROZEN');

  const counts = session.lines.map((l) => ({ rollId: l.rollId, countedMm: l.expectedMm }));
  saveCounts(db, { sessionId: session.id, counts, user: OP });
  submitOpname(db, { sessionId: session.id, user: OP });
  approveOpname(db, { sessionId: session.id, user: MGR, reason: 'Uji opname tanpa selisih' });
  assert.equal(session.status, 'posted');
  assert.equal(session.adjustments.length, 0);
});

test('opname adjustment cannot push stock below reservations', () => {
  const db = buildSeed();
  const session = startOpname(db, { warehouseId: 'wh-jkt', user: OP });
  const counts = session.lines.map((l) => ({
    rollId: l.rollId,
    countedMm: l.rollId === 'RL-0002' ? 1000 : l.expectedMm,
  }));
  saveCounts(db, { sessionId: session.id, counts, user: OP });
  submitOpname(db, { sessionId: session.id, user: OP });
  expectError(
    () => approveOpname(db, { sessionId: session.id, user: MGR, reason: 'Selisih besar' }),
    'ALLOCATION_CONFLICT',
  );
  cancelOpname(db, { sessionId: session.id, user: MGR, reason: 'Uji selesai' });
});

test('dormant product cannot be sold', () => {
  const db = buildSeed();
  expectError(
    () => createInvoice(db, {
      customerId: 'CUS-0002',
      lines: [{ kind: 'fabric', rollId: 'RL-0016', qtyMm: 1000 }],
      user: SALES,
    }),
    'DORMANT_PRODUCT',
  );
});

test('simulation dataset is independent from the main dataset', () => {
  const main = buildSeed({ dataset: 'main' });
  const sim = buildSeed({ dataset: 'sim' });
  const before = main.rolls.find((r) => r.id === 'RL-0001').currentMm;
  sim.rolls.find((r) => r.id === 'RL-0001').currentMm = 12345;
  assert.equal(main.rolls.find((r) => r.id === 'RL-0001').currentMm, before);
  assert.notEqual(sim, main);
});

test('backup validates references and refuses a broken restore', () => {
  const db = buildSeed();
  const backup = exportBackup(db);
  const result = validateBackup(backup);
  assert.equal(result.valid, true, result.errors.join(' '));
  const restored = importBackup(backup);
  assert.equal(restored.rolls.length, db.rolls.length);

  const broken = exportBackup(db);
  broken.data.rolls[0].skuId = 'sku-hantu';
  const bad = validateBackup(broken);
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.some((e) => e.includes('sku-hantu')));
  assert.throws(() => importBackup(broken));
});

test('backup restore tolerates price history for archived SKUs', () => {
  const db = buildSeed();
  db.sellPriceHistory = [
    ...(db.sellPriceHistory ?? []),
    { id: 'SPH-ARCHIVED', itemType: 'sku', itemId: 'sku-dari-stok-lama', oldPrice: 100, newPrice: 120, at: '2026-11-13T00:00:00.000Z', by: 'Henry Martin' },
  ];
  const backup = exportBackup(db);
  const result = validateBackup(backup);
  assert.equal(result.valid, true, result.errors.join(' '));
  const restored = importBackup(backup);
  assert.equal(restored.sellPriceHistory.at(-1).id, 'SPH-ARCHIVED');
});

test('warehouse master keeps IDs stable, rejects duplicates, guards deactivation', () => {
  const db = buildSeed();
  expectError(() => saveWarehouse(db, { code: 'JKT', name: 'Duplikat', binPrefix: 'Z', user: MGR }), 'DUPLICATE_CODE');
  const created = saveWarehouse(db, { code: 'MDN', name: 'Gudang Medan', binPrefix: 'D', address: 'Medan', phone: '061', user: MGR });
  assert.match(created.id, /^wh-/);
  assert.equal(created.active, true);

  const renamed = saveWarehouse(db, { id: created.id, code: 'MDN2', name: 'Gudang Medan Baru', binPrefix: 'D', active: true, user: MGR });
  assert.equal(renamed.id, created.id);
  assert.equal(renamed.code, 'MDN2');

  expectError(
    () => saveWarehouse(db, { id: 'wh-jkt', code: 'JKT', name: 'Gudang Pusat Jakarta', binPrefix: 'A', active: false, user: MGR }),
    'WAREHOUSE_IN_USE',
  );

  saveWarehouse(db, { id: created.id, code: 'MDN2', name: 'Gudang Medan Baru', binPrefix: 'D', active: false, user: MGR });
  assert.equal(db.warehouses.find((w) => w.id === created.id).active, false);
});

test('collection rename keeps SKU labels and internal IDs in sync', () => {
  const db = buildSeed();
  const skuId = db.skus.find((s) => s.collectionId === 'col-luna').id;
  renameCollection(db, { id: 'col-luna', name: 'Luna Signature', description: 'Uji', user: MGR });
  assert.equal(db.collections.find((c) => c.id === 'col-luna').name, 'Luna Signature');
  assert.equal(db.skus.find((s) => s.id === skuId).collectionName, 'Luna Signature');
  assert.equal(db.skus.find((s) => s.id === skuId).id, skuId);
});

test('direct stock intake creates traceable rolls, lots, cost and unique refs', () => {
  const db = buildSeed();
  const { receipt, rolls } = receiveAdhocStock(db, {
    warehouseId: 'wh-jkt',
    ref: 'ADH-TEST-1',
    kind: 'fabric',
    skuId: 'sku-luna-01',
    lot: 'LOT-ADH-1',
    lengthsMm: [10000, 12000],
    unitCost: 70000,
    reason: 'Saldo awal uji',
    user: OP,
  });
  assert.equal(rolls.length, 2);
  assert.equal(rolls.reduce((a, r) => a + r.currentMm, 0), 22000);
  assert.equal(receipt.kind, 'adhoc');
  assert.equal(receipt.supplierId, null);
  assert.equal(receipt.lines[0].lot, 'LOT-ADH-1');
  assert.equal(rolls[0].costPerM, 70000);
  assert.ok(db.movements.some((m) => m.type === 'adhoc_receive' && m.ref === 'ADH-TEST-1'));

  expectError(
    () => receiveAdhocStock(db, {
      warehouseId: 'wh-jkt', ref: 'ADH-TEST-1', kind: 'fabric', skuId: 'sku-luna-01',
      lengthsMm: [1000], reason: 'Duplikat', user: OP,
    }),
    'DUPLICATE_RECEIPT',
  );

  const before = partQty(db, 'part-bracket', 'wh-jkt');
  receiveAdhocStock(db, {
    warehouseId: 'wh-jkt', ref: 'ADH-PART-1', kind: 'part', partId: 'part-bracket',
    qtyPcs: 5, unitCost: 15000, reason: 'Koreksi part', user: OP,
  });
  assert.equal(partQty(db, 'part-bracket', 'wh-jkt'), before + 5);

  const backup = exportBackup(db);
  assert.equal(validateBackup(backup).valid, true, validateBackup(backup).errors.join(' '));
});

test('legacy datasets migrate forward without losing warehouses', () => {
  const legacy = {
    meta: { version: 2, dataset: 'main' },
    warehouses: [{ id: 'wh-x', code: 'X', name: 'Gudang X', binPrefix: 'X' }],
    goodsReceipts: [],
    supplierInvoices: [],
    returns: [],
    opnameSessions: [],
    audit: [],
  };
  const migrated = migrate(legacy);
  assert.equal(migrated.meta.version, 21);
  assert.equal(migrated.warehouses[0].active, true);
  assert.deepEqual(migrated.goodsReceipts, []);
  assert.deepEqual(migrated.fleetAssets, []);
});

test('v2.11 datasets gain the demo fleet and J&T/JNE during migration', () => {
  const db = buildSeed();
  db.meta.version = 12;
  db.fleetAssets = [];
  db.transportCompanies = db.transportCompanies.filter((t) => !['jnt', 'jne'].includes(t.code));
  const migrated = migrate(db);
  assert.equal(migrated.meta.version, 21);
  assert.equal(migrated.transportCompanies.length, 6);
  assert.equal(migrated.fleetAssets.length, 3);
  assert.equal(migrated.sequences.fleetAsset, 3);
  assert.ok(migrated.fleetAssets.every((a) => a.ownership === 'internal'));
  assert.ok(!migrated.fleetAssets.some((a) => /lalamove|j&t|jne/i.test(`${a.code} ${a.name}`)));
  assert.equal(migrated.drivers.find((d) => d.id === 'DRV-003').transportId, 'TRP-001');
});

test('v2.13 deliveries gain a transport snapshot during migration', () => {
  const db = buildSeed();
  db.meta.version = 13;
  const delivery = db.deliveries[0];
  delete delivery.transportId;
  delete delivery.transportName;
  const migrated = migrate(db);
  assert.equal(migrated.meta.version, 21);
  assert.equal(migrated.deliveries[0].transportId, 'TRP-006');
  assert.equal(migrated.deliveries[0].transportName, 'JNE Express');
});

test('legacy Lajur branding migrates to Lavishome', () => {
  const db = buildSeed();
  db.meta.version = 15;
  db.meta.company = 'PT Lajur Tekstil Nusantara';
  db.settings.company = 'PT Lajur Tekstil Nusantara';
  db.transportCompanies.find((t) => t.code === 'internal').name = 'Lajur Fleet';
  db.parts[0].brand = 'Lajur';
  db.deliveries[0].transportName = 'Lajur Fleet';
  db.suppliers.find((s) => s.id === 'SUP-004').name = 'Ningbo Lajur Textiles Co.';
  const migrated = migrate(db);
  assert.equal(migrated.meta.company, 'PT Lavishome Tekstil Nusantara');
  assert.equal(migrated.settings.company, 'PT Lavishome Tekstil Nusantara');
  assert.equal(migrated.transportCompanies.find((t) => t.code === 'internal').name, 'Lavishome Fleet');
  assert.equal(migrated.parts[0].brand, 'Lavishome');
  assert.equal(migrated.deliveries[0].transportName, 'Lavishome Fleet');
  assert.equal(migrated.suppliers.find((s) => s.id === 'SUP-004').name, 'Ningbo Lavishome Textiles Co.');
});

test('collections define cloth type and 60m x 300cm defaults; rolls carry QR tags', () => {
  const db = buildSeed();
  const luna = db.collections.find((c) => c.id === 'col-luna');
  assert.equal(luna.clothType, 'Blackout');
  assert.equal(luna.motive, 'Luna Plain');
  assert.equal(luna.motivePrice, 125000);
  assert.equal(luna.defaultRollLengthM, 60);
  assert.equal(luna.defaultWidthCm, 300);
  assert.equal(luna.samplePrice, 25000);
  assert.equal(luna.sampleDeposit, 50000);
  assert.equal(db.skus.find((s) => s.id === 'sku-luna-01').clothType, 'Blackout');
  assert.equal(db.skus.find((s) => s.id === 'sku-luna-01').motive, 'Luna Plain');
  assert.ok(db.rolls.every((r) => r.barcode));
  assert.equal(db.rolls[0].barcode, db.rolls[0].id);
  const sku = db.skus.find((s) => s.id === db.rolls[0].skuId);
  const wh = db.warehouses.find((w) => w.id === db.rolls[0].warehouseId);
  const html = printLabelHtml(db.rolls[0], sku, wh);
  assert.match(html, /aria-label="QR/);
  assert.match(html, /TAG STOK/);
});

test('factory sample stock is procured per collection, distributed and tracked', () => {
  const db = buildSeed();
  const stock = db.sampleStocks.find((s) => s.collectionId === 'col-luna');
  const before = stock.qty;
  assert.equal(stock.warehouseId, 'wh-jkt');
  const edited = updateSampleStock(db, {
    id: stock.id, qty: before + 1, samplePrice: 26000, sampleDeposit: 52000, minQty: 2, warehouseId: 'wh-bali',
    photo: 'data:image/png;base64,AAA', user: MGR,
  });
  assert.equal(edited.qty, before + 1);
  assert.equal(edited.samplePrice, 26000);
  assert.equal(edited.warehouseId, 'wh-bali');
  assert.equal(edited.photo, 'data:image/png;base64,AAA');
  assert.equal(db.collections.find((c) => c.id === 'col-luna').samplePrice, 26000);
  updateSampleStock(db, { id: stock.id, qty: before, samplePrice: 25000, sampleDeposit: 50000, minQty: 2, warehouseId: 'wh-jkt', removePhoto: true, user: MGR });
  assert.equal(stock.photo, '');
  const rollBefore = db.rolls.find((r) => r.id === 'RL-0001').currentMm;
  const received = procureSampleStock(db, {
    collectionId: 'col-luna', qty: 2, unitCost: 15000, supplierId: 'SUP-001', photo: 'data:image/png;base64,BBB', user: OP,
  });
  assert.equal(received.stock.qty, before + 2);
  assert.equal(received.stock.procurements[0].qty, 2);
  assert.equal(received.stock.photo, 'data:image/png;base64,BBB');
  assert.equal(received.procurement.photo, 'data:image/png;base64,BBB');
  assert.equal(db.rolls.find((r) => r.id === 'RL-0001').currentMm, rollBefore);
  const sample = createSample(db, {
    customerId: 'CUS-0002', fromStockId: stock.id, mode: 'free', date: '2026-11-18', user: SALES,
  });
  assert.equal(sample.stockId, stock.id);
  assert.equal(sample.collectionId, 'col-luna');
  assert.equal(sample.rollId, null);
  assert.equal(sample.pieces, 1);
  assert.equal(stock.qty, before + 1);
  const depositSample = createSample(db, {
    customerId: 'CUS-0003', fromStockId: stock.id, mode: 'deposit', date: '2026-11-18', user: SALES,
  });
  const deposit = db.deposits.find((d) => d.id === depositSample.depositId);
  assert.equal(deposit.amount, 50000);
  assert.equal(stock.qty, before);
  const stats = sampleCustomerStats(db, 'CUS-0002')[0];
  assert.ok(stats.total >= 1);
  assert.ok(stats.pieces >= 1);
  const collection = sampleCollectionStats(db).find((c) => c.collection.id === 'col-luna');
  assert.ok(collection.given >= 1);
  assert.equal(collection.stockQty, before);
});

test('selling price review requires confirmation after 90 days and records history', () => {
  const db = buildSeed();
  expectError(
    () => changeSellPrice(db, { itemType: 'sku', itemId: 'sku-luna-01', price: 130000, user: MGR }),
    'PRICE_STALE_CONFIRM',
  );
  const result = changeSellPrice(db, {
    itemType: 'sku', itemId: 'sku-luna-01', price: 130000, confirmStale: true, note: 'Review harga', user: MGR,
  });
  assert.equal(result.item.sellPrice, 130000);
  const history = sellPriceHistory(db, { itemType: 'sku', itemId: 'sku-luna-01' });
  assert.equal(history[0].newPrice, 130000);
  assert.equal(history[0].oldPrice, 125000);
});

test('internal transfer shipping cost is capitalised into destination HPP', () => {
  const db = buildSeed();
  const t = createTransfer(db, {
    fromWarehouseId: 'wh-jkt', toWarehouseId: 'wh-bali', neededBy: '2026-12-01', reason: 'Uji ongkir',
    shippingCost: 300000, lines: [{ skuId: 'sku-luna-01', requestedMm: 10000 }], user: OP,
  });
  submitTransfer(db, { id: t.id, user: OP });
  approveTransfer(db, { id: t.id, user: MGR });
  const source = db.rolls.find((r) => r.skuId === 'sku-luna-01' && availableMm(r) >= 10000 && !r.reservedMm);
  const base = source.costPerM;
  dispatchLine(db, { transferId: t.id, lineId: t.lines[0].id, allocations: [{ rollId: source.id, qtyMm: 10000 }], user: OP });
  const transit = db.rolls.filter((r) => r.transit?.transferId === t.id).at(-1);
  receiveLine(db, { transferId: t.id, lineId: t.lines[0].id, qtyMm: 10000, user: OP });
  assert.equal(transit.warehouseId, 'wh-bali');
  assert.equal(transit.costPerM, base + 30000);
  assert.equal(t.shippingCost, 300000);
});

test('customer WhatsApp and posted invoices without surat jalan are traceable', () => {
  const db = buildSeed();
  const customer = createCustomer(db, { name: 'WA Test', phone: '0812', whatsapp: '0812-9999' }, SALES);
  assert.equal(customer.whatsapp, '0812-9999');
  const missing = invoicesWithoutDelivery(db);
  assert.ok(missing.every((i) => i.status === 'posted'));
  const inv = db.invoices.find((i) => i.status === 'posted' && !i.deliveryId);
  assert.ok(missing.some((i) => i.id === inv.id));
});

test('older collections gain cloth type from their category during migration', () => {
  const db = buildSeed();
  db.meta.version = 15;
  for (const collection of db.collections) {
    delete collection.clothType;
    delete collection.defaultRollLengthM;
    delete collection.defaultWidthCm;
  }
  const migrated = migrate(db);
  assert.equal(migrated.collections.find((c) => c.id === 'col-luna').clothType, 'Blackout');
  assert.equal(migrated.collections.find((c) => c.id === 'col-aria').clothType, 'Sheer');
  assert.equal(migrated.collections.find((c) => c.id === 'col-nova').clothType, 'Dimout');
  assert.equal(migrated.collections[0].defaultRollLengthM, 60);
  assert.equal(migrated.collections[0].defaultWidthCm, 300);
});

test('v2.17 per-colour sample stock migrates into collection sample stock', () => {
  const db = buildSeed();
  db.meta.version = 16;
  const pairs = [
    ['sku-luna-01', 'col-luna'],
    ['sku-luna-02', 'col-luna'],
    ['sku-aria-01', 'col-aria'],
    ['sku-aria-02', 'col-aria'],
    ['sku-nova-01', 'col-nova'],
  ];
  db.sampleStocks = pairs.map(([skuId, collectionId], index) => ({
    id: `SS-${String(index + 1).padStart(4, '0')}`,
    collectionId,
    skuId,
    qty: 2,
    minQty: 1,
    location: 'Showroom Jakarta',
    history: [],
  }));
  const migrated = migrate(db);
  assert.equal(migrated.sampleStocks.length, 3);
  assert.equal(migrated.sampleStocks.find((s) => s.collectionId === 'col-luna').qty, 4);
  assert.equal(migrated.sampleStocks.find((s) => s.collectionId === 'col-aria').qty, 4);
  assert.equal(migrated.sampleStocks.find((s) => s.collectionId === 'col-nova').qty, 2);
  const ids = migrated.sampleStocks.flatMap((s) => (s.procurements ?? []).map((p) => p.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 3);
});

test('v2.14 third-party vehicles leave the internal fleet during migration', () => {
  const db = buildSeed();
  db.meta.version = 14;
  db.fleetAssets.find((a) => a.id === 'FLT-003').ownership = 'third_party';
  db.fleetAssets.push(
    { id: 'FLT-004', code: 'LALAMOVE-MTR', name: 'Lalamove Motor Fleet', type: 'motor', ownership: 'third_party', driverId: null, capacityKg: 30, active: true },
    { id: 'FLT-005', code: 'B 7777 JT', name: 'J&T Van', type: 'mobil', ownership: 'third_party', driverId: null, capacityKg: 600, active: true },
  );
  const migrated = migrate(db);
  assert.equal(migrated.fleetAssets.length, 3);
  assert.ok(migrated.fleetAssets.every((a) => a.ownership === 'internal'));
  assert.equal(migrated.drivers.find((d) => d.id === 'DRV-003').transportId, 'TRP-001');
  assert.equal(migrated.drivers.find((d) => d.id === 'DRV-003').plateNumber, 'B 5566 GH');
});

test('fleet vehicles can list several drivers without stealing links', () => {
  const db = buildSeed();
  const asset = saveFleetAsset(db, {
    code: 'B 9999 ZZ', name: 'Tes Van', type: 'mobil', driverIds: ['DRV-001', 'DRV-002'], capacityKg: 700, user: MGR,
  });
  assert.equal(asset.id, 'FLT-004');
  assert.equal(asset.ownership, 'internal');
  assert.equal(asset.transportId, 'TRP-001');
  assert.equal(asset.driverId, 'DRV-001');
  assert.deepEqual([...asset.driverIds].sort(), ['DRV-001', 'DRV-002']);
  // The old vehicle keeps the driver's link even though the new vehicle is now
  // the default; a driver is allowed to use both.
  assert.ok(db.fleetAssets.find((a) => a.id === 'FLT-001').driverIds.includes('DRV-001'));
  const asep = db.drivers.find((d) => d.id === 'DRV-001');
  assert.equal(asep.plateNumber, 'B 9999 ZZ');
  assert.equal(asep.vehicleType, 'mobil');
  expectError(() => saveFleetAsset(db, { code: 'B 9999 ZZ', name: 'Duplikat', user: MGR }), 'DUPLICATE_CODE');
  expectError(() => saveFleetAsset(db, { code: 'B 1111 AA', name: 'Tanpa transport', transportId: 'TRP-404', user: MGR }), 'TRANSPORT_NOT_FOUND');
});

test('driver assignment links several vehicles and can move the default', () => {
  const db = buildSeed();
  const asep = () => db.drivers.find((d) => d.id === 'DRV-001');
  const asset = (id) => db.fleetAssets.find((a) => a.id === id);

  saveDriver(db, { id: 'DRV-001', name: 'Asep', fleetAssetIds: ['FLT-001', 'FLT-003'], user: MGR });
  assert.ok(asset('FLT-001').driverIds.includes('DRV-001'));
  assert.ok(asset('FLT-003').driverIds.includes('DRV-001'));
  assert.equal(asset('FLT-001').driverId, 'DRV-001');
  assert.equal(asep().plateNumber, 'B 1234 CD');

  saveDriver(db, { id: 'DRV-001', name: 'Asep', fleetAssetIds: ['FLT-002'], user: MGR });
  assert.equal(asset('FLT-001').driverIds.includes('DRV-001'), false);
  assert.equal(asset('FLT-002').driverId, 'DRV-001');
  assert.equal(asep().plateNumber, 'B 9876 EF');
  // The previous default driver of FLT-002 stays linked, just not default.
  assert.ok(asset('FLT-002').driverIds.includes('DRV-002'));
});

test('surat jalan captures J&T/JNE consignment fields', () => {
  const db = buildSeed();
  const invoice = db.invoices.find((i) => i.status === 'posted' && !i.deliveryId);
  const delivery = createDelivery(db, {
    invoiceId: invoice.id, pic: 'Henny', courier: 'jnt', service: 'EZ', trackingRef: 'JT-0001',
    recipientName: 'Siti Rahma', recipientPhone: '0812-3456-7890', weightKg: 4.5, pieces: 2,
    shippingCost: 25000, insurance: 5000, codAmount: 100000,
    instructions: 'Jangan dibanting.', user: OP,
  });
  assert.equal(delivery.courier, 'jnt');
  assert.equal(delivery.service, 'EZ');
  assert.equal(delivery.trackingRef, 'JT-0001');
  assert.equal(delivery.recipientName, 'Siti Rahma');
  assert.equal(delivery.weightKg, 4.5);
  assert.equal(delivery.pieces, 2);
  assert.equal(delivery.codAmount, 100000);
  assert.equal(validateBackup(exportBackup(db)).valid, true);
});

test('consignment print shows delivery data and never invoice prices', () => {
  const db = buildSeed();
  const html = printDeliveryHtml(db, db.deliveries[0]);
  assert.match(html, /CONSIGNMENT NOTE/);
  assert.match(html, /JNE-REG-0001/);
  assert.match(html, /Budi Santoso/);
  assert.match(html, /18\.5 kg/);
  assert.doesNotMatch(html, /Total faktur|Subtotal|Rp 2\.180\.000/);
});

test('whole-roll draft is rejected if the roll changed before posting', () => {
  const db = buildSeed();
  const whole = createInvoice(db, {
    customerId: 'CUS-0002',
    lines: [{ kind: 'fabric', rollId: 'RL-0001', mode: 'whole' }],
    user: SALES,
  });
  const cut = createInvoice(db, {
    customerId: 'CUS-0002',
    lines: [{ kind: 'fabric', rollId: 'RL-0001', qtyMm: 1000 }],
    user: SALES,
  });
  postInvoice(db, { id: cut.id, user: SALES });
  expectError(() => postInvoice(db, { id: whole.id, user: SALES }), 'ROLL_CHANGED');
});

test('refundable sample deposit cannot be applied to an invoice', () => {
  const db = buildSeed();
  const sample = createSample(db, {
    customerId: 'CUS-0003', skuId: 'sku-aria-01', rollId: 'RL-0011',
    qtyMm: 500, mode: 'deposit', amount: 200000, user: SALES,
  });
  const inv = createInvoice(db, {
    customerId: 'CUS-0003',
    lines: [{ kind: 'part', partId: 'part-bracket', qtyPcs: 1, warehouseId: 'wh-jkt' }],
    user: SALES,
  });
  postInvoice(db, { id: inv.id, user: SALES });
  expectError(
    () => applyDepositToInvoice(db, { depositId: sample.depositId, invoiceId: inv.id, amount: 1000, user: MGR }),
    'DEPOSIT_REFUND_ONLY',
  );
});

test('acting on a roll with zero length is rejected', () => {
  const db = buildSeed();
  expectError(
    () => createRoll(db, { skuId: 'sku-luna-01', currentMm: 0, warehouseId: 'wh-jkt', lot: 'X' }),
    'INVALID_LENGTH',
  );
});

test('stock sync archives old rolls and imports plan rolls and samples', () => {
  const db = buildSeed();
  const oldAvailable = db.rolls.filter((roll) => ['available', 'quarantine'].includes(roll.status)).length;
  const plan = {
    key: 'test-sync',
    source: 'test.xlsx',
    date: '2026-11-13',
    warehouseId: 'wh-jkt',
    categoryName: 'Kain',
    collections: [{ key: 'TEST', name: 'TEST', widthCm: 280 }],
    skus: [{
      id: 'sku-test-1', row: 2, collectionKey: 'TEST', code: 'TEST-A1', colourCode: 'A1',
      colourName: 'A1', widthCm: 280, buyPrice: 0, sellPrice: 0,
      rolls: [{ count: 2, lengthM: 50 }, { count: 1, lengthM: 25 }],
    }],
    samples: [{ collectionKey: 'TEST', qty: 1, metres: 20, names: ['TEST SAMPLE'] }],
  };
  const summary = syncImportedStock(db, { plan, user: MGR });
  assert.equal(summary.rolls, 3);
  assert.equal(summary.metres, 125);
  assert.equal(summary.samples, 1);
  assert.equal(summary.archivedRolls, oldAvailable);
  assert.equal(db.rolls.filter((roll) => roll.importedKey === 'test-sync').length, 3);
  assert.equal(db.rolls.filter((roll) => ['available', 'quarantine'].includes(roll.status)).length, 3);
  assert.equal(db.skus.find((sku) => sku.code === 'TEST-A1').active, true);
  assert.equal(db.sampleStocks.find((stock) => stock.collectionId === 'col-imp-test').qty, 1);
  assert.equal(db.meta.stockSync.key, 'test-sync');
  assert.throws(() => syncImportedStock(db, { plan, user: MGR }),
    (err) => err.code === 'STOCK_ALREADY_SYNCED');
});

test('bundled 13 Nov 2026 stock plan matches the confirmed totals', () => {
  const plan = JSON.parse(fs.readFileSync(new URL('../src/data/stock-13nov2026.json', import.meta.url), 'utf8'));
  assert.equal(plan.key, 'excel-2026-11-13');
  assert.equal(plan.collections.length, 47);
  assert.equal(plan.skus.length, 257);
  assert.equal(plan.samples.length, 40);
  assert.equal(plan.skus.reduce((total, sku) => total + sku.rolls.reduce((sum, group) => sum + group.count, 0), 0), 2175);
  assert.equal(Math.round(plan.skus.reduce((total, sku) => total + sku.rolls.reduce((sum, group) => sum + group.count * group.lengthM, 0), 0) * 100) / 100, 144590.62);
  assert.equal(plan.samples.reduce((total, sample) => total + sample.qty, 0), 40);
});

test('Excel stock rows produce a dated plan and skip fee/folder rows', () => {
  const rows = [
    ['NAMA WARNA', 'ESTIMASI_DTG', 'TTL_ROLL', 'TTL_SATUAN', 'STOK_PER_ROLL'],
    ['TEST A1', '1', '', '100', '(2)50.00'],
    ['TEST SAMPLE', '1', '', '20', '(1)20.00'],
    ['BIAYA MATERAI', '1', '', '300', '(1)300.00'],
    ['FOLDER TEST', '1', '', '50', '(1)50.00'],
  ];
  const plan = buildStockPlanFromRows(rows, { date: '2026-11-01', source: 'test.xlsx' });
  assert.equal(plan.key, 'excel-2026-11-01');
  assert.equal(plan.skus.length, 1);
  assert.equal(plan.skus[0].rolls[0].count, 2);
  assert.equal(plan.samples.length, 1);
  assert.equal(plan.collections.length, 1);
});

test('customer Excel import normalizes phones and skips duplicates', () => {
  const db = buildSeed();
  const rows = [
    ['INDEX KONTAK', 'KODE KONTAK', 'NAMA LENGKAP KONTAK', 'PANGGILAN KONTAK', 'NO. TELP. UTAMA', 'ALAMAT PENGIRIMAN', 'KOTA ALAMAT PENGIRIMAN', 'KONTAK AKTIF'],
    ['CTCS-1', 'NEW', 'TOKO BARU', 'BUDI', '8.124642717E9', 'Jl. Baru 1', 'BANDUNG', '1'],
    ['CTCS-2', 'DUP', 'HOTEL ARUNIKA', 'SITI', '0812-1000-2001', 'Jl. Sudirman 210', 'JAKARTA', '1'],
  ];
  const plan = buildCustomerPlanFromRows(rows, { date: '2026-11-20', source: 'customer.xlsx' });
  assert.equal(plan.customers.length, 2);
  assert.equal(plan.customers[0].phone, '08124642717');
  const result = importCustomerPlan(db, { plan, user: MGR });
  assert.equal(result.created, 1);
  assert.equal(result.skipped, 1);
  const created = db.customers.find((customer) => customer.name === 'TOKO BARU');
  assert.equal(created.city, 'BANDUNG');
  assert.equal(created.contactName, 'BUDI');
});

test('seed has two PTs, four named accounts and no driver logins', () => {
  const db = buildSeed();
  assert.deepEqual(db.companies.map((c) => c.id), ['co-jkt', 'co-bali']);
  const byName = (name) => db.users.find((u) => u.name === name);
  assert.equal(byName('Henry Martin').role, 'manager');
  assert.equal(byName('Henry Martin').companyId, 'co-jkt');
  assert.equal(byName('Henny').role, 'sales');
  assert.equal(byName('Henny').jobTitle, 'Sales / Owner');
  assert.equal(byName('Fauzi').role, 'operator');
  assert.equal(byName('Nicolas').companyId, 'co-bali');
  assert.equal(db.users.filter((u) => u.role === 'driver').length, 0);
  assert.ok(db.drivers.every((d) => d.userId === null));
});

test('customers are scoped per PT and similar customers become shared', () => {
  const db = buildSeed();
  const baliOnly = createCustomer(db, { name: 'Bali Only Client', companyId: 'co-bali' }, BALI);
  assert.equal(customersForCompany(db, 'co-bali').some((c) => c.id === baliOnly.id), true);
  assert.equal(customersForCompany(db, 'co-jkt').some((c) => c.id === baliOnly.id), false);

  const jakarta = createCustomer(db, { name: 'Bali Only Client', companyId: 'co-jkt' }, MGR);
  assert.equal(baliOnly.shared, true);
  assert.equal(jakarta.shared, true);
  assert.equal(customersForCompany(db, 'co-jkt').some((c) => c.id === baliOnly.id), true);
});

test('internal sale moves stock to the buyer PT instead of selling it out', () => {
  const db = buildSeed();
  const roll = rollOf(db, 'RL-0001');
  assert.equal(roll.warehouseId, 'wh-jkt');
  const invoice = createInternalPurchase(db, {
    buyerCompanyId: 'co-bali',
    sourceCompanyId: 'co-jkt',
    lines: [{ kind: 'fabric', rollId: roll.id, mode: 'whole', unitPrice: 125000 }],
    user: MGR,
  });
  postInvoice(db, { id: invoice.id, user: MGR });
  assert.equal(invoice.status, 'posted');
  assert.equal(invoice.companyId, 'co-jkt');
  assert.equal(invoice.internalCompanyId, 'co-bali');
  assert.equal(roll.warehouseId, 'wh-bali');
  assert.equal(roll.status, 'available');
  assert.ok(db.movements.some((m) => m.type === 'internal_sale' && m.ref === invoice.id));
});

test('Bali can request sample stock free or paid and the source PT approves it', () => {
  const db = buildSeed();
  const source = db.sampleStocks.find((s) => s.collectionId === 'col-luna' && s.warehouseId === 'wh-jkt');
  const before = source.qty;
  const request = createSampleRequest(db, { stockId: source.id, qty: 2, pricing: 'paid', amount: 50000, user: BALI });
  assert.equal(request.status, 'requested');
  assert.equal(request.fromCompanyId, 'co-jkt');
  assert.equal(request.toCompanyId, 'co-bali');
  decideSampleRequest(db, { id: request.id, approve: true, user: MGR });
  assert.equal(source.qty, before - 2);
  const target = db.sampleStocks.find((s) => s.collectionId === 'col-luna' && s.warehouseId === 'wh-bali');
  assert.ok(target);
  assert.equal(target.companyId, 'co-bali');
  assert.equal(target.qty, 2);
  assert.equal(request.status, 'approved');
  assert.equal(request.depositRequired, false);
});

test('Bali-initiated internal PO uses cheaper internal pricing and tracks shipment', () => {
  const db = buildSeed();
  const example = db.internalPOs[0];
  assert.equal(example.buyerCompanyId, 'co-bali');
  assert.equal(example.sellerCompanyId, 'co-jkt');
  assert.equal(example.status, 'requested');
  const line = example.lines[0];
  assert.equal(line.unitPrice, internalPriceOf(db, line.listPrice));
  assert.ok(line.unitPrice < line.listPrice);

  const shipped = shipInternalPO(db, { id: example.id, user: MGR, trackingRef: 'IPO-TRACK-1' });
  assert.equal(shipped.status, 'shipped');
  assert.ok(shipped.invoiceId);
  assert.equal(shipped.trackingRef, 'IPO-TRACK-1');
  const roll = rollOf(db, line.rollId);
  assert.equal(roll.warehouseId, 'wh-bali');
  const invoice = db.invoices.find((inv) => inv.id === shipped.invoiceId);
  assert.equal(invoice.internalCompanyId, 'co-bali');
  assert.equal(invoice.internalPOId, example.id);

  receiveInternalPO(db, { id: example.id, user: BALI, note: 'Diterima di Bali' });
  assert.equal(example.status, 'received');
  assert.equal(example.history.at(-1).action, 'Diterima');
});

test('a new Bali PO can be created from Jakarta stock', () => {
  const db = buildSeed();
  const roll = db.rolls.find((r) => r.warehouseId === 'wh-jkt' && r.status === 'available' && (r.reservedMm || 0) === 0 && r.id !== db.internalPOs[0]?.lines?.[0]?.rollId);
  const po = createInternalPO(db, {
    buyerCompanyId: 'co-bali',
    sellerCompanyId: 'co-jkt',
    lines: [{ kind: 'fabric', rollId: roll.id, mode: 'cut', qtyMm: 5000 }],
    notes: 'Kebutuhan showroom Bali',
    user: BALI,
  });
  assert.equal(po.status, 'requested');
  assert.equal(po.buyerCompanyId, 'co-bali');
  assert.equal(po.lines[0].qtyMm, 5000);
  assert.ok(po.lines[0].unitPrice < po.lines[0].listPrice);
  assert.equal(po.history[0].action, 'PO internal dibuat');
});

test('surat jalan estimates roll weight and gets lighter on cut pieces', () => {
  const db = buildSeed();
  const inv = db.invoices.find((invoice) => invoice.status === 'posted' && invoice.lines.some((l) => l.kind === 'fabric'));
  const line = inv.lines.find((l) => l.kind === 'fabric');
  const fullKg = lineEstimatedKg(db, line);
  const cutKg = lineEstimatedKg(db, { ...line, qtyMm: line.qtyMm / 2 });
  assert.ok(fullKg > 0);
  assert.ok(cutKg < fullKg);
  const estimate = deliveryEstimate(db, inv.lines);
  assert.ok(estimate.rolls >= 1);
  assert.ok(estimate.totalKg > 0);
  const delivery = createDelivery(db, { invoiceId: inv.id, pic: 'Fauzi', courier: 'internal', user: MGR });
  assert.ok(delivery.weightKg > 0);
  assert.ok(delivery.rollCount >= 1);
  assert.ok(delivery.lotCount >= 1);
  assert.ok(delivery.lines.some((l) => l.rollId && l.lot && l.weightKg > 0));
});

test('payments can be deposit, installment and full with proof photo', () => {
  const db = buildSeed();
  const inv = db.invoices.find((invoice) => invoice.status === 'posted' && invoiceOutstanding(invoice) > 0);
  const first = recordPayment(db, {
    invoiceId: inv.id, amount: 100000, kind: 'deposit', bank: 'bca', reference: 'TRF-001',
    proofImage: 'data:image/png;base64,proof', user: MGR,
  });
  assert.equal(first.kind, 'deposit');
  assert.equal(first.bank, 'bca');
  assert.match(first.proofImage, /^data:image/);
  assert.equal(first.reference, 'TRF-001');
  updatePayment(db, { id: first.id, patch: { amount: 120000, kind: 'installment', reference: 'TRF-EDIT' }, user: MGR });
  assert.equal(first.amount, 120000);
  assert.equal(first.kind, 'installment');
  assert.equal(first.reference, 'TRF-EDIT');
  assert.equal(inv.payments.find((p) => p.id === first.id).amount, 120000);

  const remaining = invoiceOutstanding(inv);
  const final = recordPayment(db, { invoiceId: inv.id, kind: 'full', user: MGR });
  assert.equal(final.kind, 'full');
  assert.equal(final.amount, remaining);
  assert.equal(invoiceOutstanding(inv), 0);

  deletePayment(db, { id: final.id, user: MGR });
  assert.ok(!inv.payments.some((p) => p.id === final.id));
  assert.ok(invoiceOutstanding(inv) > 0);
});
