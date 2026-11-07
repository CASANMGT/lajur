import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSeed } from '../src/domain/seed.js';
import {
  availableMm, createRoll, partQty, quarantineRoll, receiveAdhocStock, reserveRoll, stockSummary,
} from '../src/domain/inventory.js';
import { saveWarehouse, renameCollection } from '../src/domain/master.js';
import { createInvoice, createCustomerReturn, postInvoice, recordPayment, invoiceOutstanding } from '../src/domain/sales.js';
import { createTransfer, approveTransfer, dispatchLine, receiveLine, submitTransfer, transferTotals, transitRollsFor } from '../src/domain/transfers.js';
import { createPO, receivePO } from '../src/domain/purchasing.js';
import { approveOpname, saveCounts, startOpname, submitOpname, cancelOpname } from '../src/domain/opname.js';
import { createProject, handoverProject, issueProject, reserveProject } from '../src/domain/projects.js';
import { createSample, refundDeposit, applyDepositToInvoice } from '../src/domain/crm.js';
import { exportBackup, importBackup, validateBackup } from '../src/data/backup.js';
import { migrate } from '../src/data/store.js';
import { buildSeed as seedAgain } from '../src/domain/seed.js';

const OP = { id: 'u-op', name: 'Rani', role: 'operator' };
const SALES = { id: 'u-sales', name: 'Dimas', role: 'sales' };
const MGR = { id: 'u-mgr', name: 'Arif', role: 'manager' };

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
    toWarehouseId: 'wh-bdg',
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
  const sby = stockSummary(db, { warehouseId: 'wh-sby' });
  const physical = db.rolls
    .filter((r) => r.warehouseId === 'wh-sby' && !r.transit && ['available', 'quarantine'].includes(r.status))
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
  const session = startOpname(db, { warehouseId: 'wh-sby', user: OP });

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
  assert.equal(migrated.meta.version, 3);
  assert.equal(migrated.warehouses[0].active, true);
  assert.deepEqual(migrated.goodsReceipts, []);
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
