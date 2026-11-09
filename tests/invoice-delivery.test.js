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
import { createCustomer } from '../src/domain/crm.js';

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

test('NPWP is optional on customers and tax invoices, and falls back to the customer', () => {
  const db = buildSeed();
  const inv = partInvoice(db, 1);
  postInvoice(db, { id: inv.id, user: SALES });
  const taxBlank = issueTaxInvoice(db, { id: inv.id, user: SALES });
  assert.equal(taxBlank.npwp, '');

  const graha = db.invoices.find((i) => i.id === 'INV-0002');
  const taxGraha = issueTaxInvoice(db, { id: graha.id, user: SALES });
  assert.equal(taxGraha.npwp, '02.345.678.9-012.000');

  const customer = createCustomer(db, { name: 'Tanpa NPWP' }, SALES);
  assert.equal(customer.npwp, '');
  assert.throws(
    () => createCustomer(db, { name: 'NPWP salah', npwp: '12.34' }, SALES),
    (err) => err.code === 'INVALID_NPWP',
  );
});

test('surat jalan snapshots driver and transport master data', () => {
  const db = buildSeed();
  const inv = partInvoice(db, 1);
  postInvoice(db, { id: inv.id, user: SALES });
  const jnt = createDelivery(db, {
    invoiceId: inv.id, pic: 'Henny', courier: 'jnt', driverId: 'DRV-002', user: SALES,
  });
  assert.equal(jnt.driver, 'Rudi');
  assert.equal(jnt.vehicleType, 'mobil');
  assert.equal(jnt.plateNumber, 'B 9876 EF');
  assert.equal(jnt.transportId, 'TRP-005');
  assert.equal(jnt.transportName, 'J&T Express');
  assert.equal(jnt.fleetAssetId, null);
  assert.equal(jnt.vehicleName, '');

  const inv2 = partInvoice(db, 1);
  postInvoice(db, { id: inv2.id, user: SALES });
  const internal = createDelivery(db, {
    invoiceId: inv2.id, pic: 'Henny', courier: 'internal', driverId: 'DRV-003', user: SALES,
  });
  assert.equal(internal.fleetAssetId, 'FLT-003');
  assert.equal(internal.vehicleName, 'Isuzu Elf');
  assert.equal(internal.plateNumber, 'B 5566 GH');
  assert.equal(internal.transportId, 'TRP-001');
  assert.equal(internal.transportName, 'Lajur Fleet');
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
    invoiceId: inv.id, pic: 'Rani', driverId: 'DRV-001', courier: 'gosend', trackingRef: 'GOSEND-123', user: OP,
  });
  assert.equal(delivery.status, 'draft');
  assert.equal(delivery.driver, 'Asep');
  assert.equal(delivery.vehicleType, 'motor');
  assert.equal(delivery.plateNumber, 'B 1234 CD');
  assert.equal(delivery.courier, 'gosend');
  assert.equal(delivery.trackingRef, 'GOSEND-123');
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
