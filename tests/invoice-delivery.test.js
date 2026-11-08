import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSeed } from '../src/domain/seed.js';
import {
  createInvoice, issueTaxInvoice, postInvoice, taxBreakdown,
} from '../src/domain/sales.js';
import {
  confirmDelivery, createDelivery, deliveryForInvoice, dispatchDelivery, markDelivered, updateDelivery,
} from '../src/domain/deliveries.js';
import { partStockRow } from '../src/domain/inventory.js';

const SALES = { id: 'u-sales', name: 'Dimas', role: 'sales' };
const OP = { id: 'u-op', name: 'Rani', role: 'operator' };

function partInvoice(db, qtyPcs = 2) {
  return createInvoice(db, {
    customerId: 'CUS-0002',
    lines: [{ kind: 'part', partId: 'part-bracket', qtyPcs, unitPrice: 25000, warehouseId: 'wh-jkt' }],
    user: SALES,
  });
}

test('invoice supports fixed and percentage discounts without changing line prices', () => {
  const db = buildSeed();
  const pct = createInvoice(db, {
    customerId: 'CUS-0002',
    lines: [{ kind: 'part', partId: 'part-bracket', qtyPcs: 2, unitPrice: 25000, warehouseId: 'wh-jkt' }],
    discountType: 'percent',
    discountValue: 10,
    user: SALES,
  });
  assert.equal(pct.subtotal, 50000);
  assert.equal(pct.discount, 5000);
  assert.equal(pct.total, 45000);
  assert.equal(pct.discountType, 'percent');
  assert.equal(pct.discountValue, 10);

  const fixed = createInvoice(db, {
    customerId: 'CUS-0002',
    lines: [{ kind: 'part', partId: 'part-bracket', qtyPcs: 2, unitPrice: 25000, warehouseId: 'wh-jkt' }],
    discount: 7500,
    user: SALES,
  });
  assert.equal(fixed.discount, 7500);
  assert.equal(fixed.total, 42500);
  assert.equal(fixed.discountType, 'amount');
});

test('tax invoice is computed from the posted invoice total and can only be issued once', () => {
  const db = buildSeed();
  const inv = partInvoice(db, 2);
  assert.throws(() => issueTaxInvoice(db, { id: inv.id, user: SALES }),
    (err) => err.code === 'INVALID_STATUS');

  postInvoice(db, { id: inv.id, user: SALES });
  const total = inv.total;
  const preview = taxBreakdown(inv, 11);
  assert.equal(preview.dpp + preview.ppn, total);

  const tax = issueTaxInvoice(db, { id: inv.id, npwp: '01.234.567.8-901.000', user: SALES });
  assert.equal(tax.dpp + tax.ppn, total);
  assert.equal(tax.total, total);
  assert.equal(tax.ratePercent, 11);
  assert.equal(tax.npwp, '01.234.567.8-901.000');
  assert.equal(inv.total, total);
  assert.throws(() => issueTaxInvoice(db, { id: inv.id, user: SALES }),
    (err) => err.code === 'TAX_INVOICE_EXISTS');
});

test('surat jalan tracks PIC and confirmation without moving stock again', () => {
  const db = buildSeed();
  const inv = partInvoice(db, 1);
  assert.throws(() => createDelivery(db, { invoiceId: inv.id, pic: 'Rani', user: OP }),
    (err) => err.code === 'INVOICE_NOT_POSTED');

  postInvoice(db, { id: inv.id, user: SALES });
  const row = partStockRow(db, 'part-bracket', 'wh-jkt');
  const stockAfterInvoice = row.qty;
  assert.throws(() => createDelivery(db, { invoiceId: inv.id, pic: '', user: OP }),
    (err) => err.code === 'PIC_REQUIRED');

  const delivery = createDelivery(db, {
    invoiceId: inv.id, pic: 'Rani', driver: 'Asep', vehicle: 'B 1234 CD', user: OP,
  });
  assert.equal(delivery.status, 'draft');
  assert.equal(inv.deliveryId, delivery.id);
  assert.equal(deliveryForInvoice(db, inv.id).id, delivery.id);
  assert.equal(row.qty, stockAfterInvoice);

  updateDelivery(db, { id: delivery.id, pic: 'Rani Pratama', user: OP });
  assert.equal(delivery.pic, 'Rani Pratama');
  dispatchDelivery(db, { id: delivery.id, user: OP });
  assert.equal(delivery.status, 'dispatched');
  markDelivered(db, { id: delivery.id, user: OP });
  assert.equal(delivery.status, 'delivered');
  confirmDelivery(db, { id: delivery.id, receivedBy: 'Budi Pelanggan', note: 'Sesuai', user: OP });
  assert.equal(delivery.status, 'confirmed');
  assert.equal(delivery.receivedBy, 'Budi Pelanggan');
  assert.equal(delivery.history.length >= 5, true);
  assert.equal(row.qty, stockAfterInvoice);
  assert.throws(() => createDelivery(db, { invoiceId: inv.id, pic: 'Rani', user: OP }),
    (err) => err.code === 'DELIVERY_EXISTS');
});
