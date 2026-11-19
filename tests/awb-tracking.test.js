import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSeed } from '../src/domain/seed.js';
import { createInvoice, postInvoice } from '../src/domain/sales.js';
import {
  createDelivery, deliveryTrackingUrl, normalizeTrackingUrl, trackingLabel, updateDelivery,
} from '../src/domain/deliveries.js';
import { parseAwb } from '../src/ui/awb.js';

const SALES = { id: 'u-sales', name: 'Belinda', role: 'sales' };

function postedInvoice(db) {
  const invoice = createInvoice(db, {
    customerId: 'CUS-0002',
    lines: [{ kind: 'part', partId: 'part-bracket', qtyPcs: 1, unitPrice: 25000, warehouseId: 'wh-jkt' }],
    user: SALES,
  });
  postInvoice(db, { id: invoice.id, user: SALES });
  return invoice;
}

test('AWB photo reader prefers courier prefixes and grouped resi numbers', () => {
  assert.equal(parseAwb('NO RESI\nJT123456789012\n2 kg', { courier: 'jnt' }), 'JT123456789012');
  assert.equal(parseAwb('JNE\nCGK 1234 5678 90\nJakarta', { courier: 'jne' }), 'CGK1234567890');
  assert.equal(parseAwb('AWB : 001234567890', { courier: 'sicepat' }), '001234567890');
  assert.equal(parseAwb(''), '');
});

test('surat jalan stores a user PIC, tracking link and notifies arrival', () => {
  const db = buildSeed();
  const invoice = postedInvoice(db);
  const delivery = createDelivery(db, {
    invoiceId: invoice.id,
    picUserId: 'u-drv1',
    courier: 'jne',
    service: 'REG',
    trackingRef: 'CGK1234567890',
    trackingUrl: 'https://grab.com/share/abc123',
    user: SALES,
  });
  assert.equal(delivery.pic, 'Asep');
  assert.equal(delivery.picUserId, 'u-drv1');
  assert.equal(delivery.picRole, 'driver');
  assert.equal(delivery.trackingUrl, 'https://grab.com/share/abc123');
  assert.equal(deliveryTrackingUrl(delivery), 'https://grab.com/share/abc123');
  assert.equal(trackingLabel(delivery), 'Buka link dari aplikasi');

  updateDelivery(db, {
    id: delivery.id,
    picUserId: 'u-op',
    courier: 'jne',
    service: 'YES',
    trackingRef: 'CGK1234567890',
    trackingUrl: '',
    user: SALES,
  });
  assert.equal(delivery.pic, 'Henny');
  assert.equal(delivery.picRole, 'operator');
  assert.equal(delivery.trackingUrl, '');
  assert.equal(deliveryTrackingUrl(delivery), 'https://www.jne.co.id/id/tracking/trace');
  assert.equal(trackingLabel(delivery), 'Lacak JNE');
});

test('tracking links must be http or https', () => {
  assert.equal(normalizeTrackingUrl(''), '');
  assert.equal(normalizeTrackingUrl('https://gosend.id/track/abc'), 'https://gosend.id/track/abc');
  assert.throws(() => normalizeTrackingUrl('javascript:alert(1)'), (err) => err.code === 'INVALID_TRACKING_URL');
  const db = buildSeed();
  const invoice = postedInvoice(db);
  assert.throws(() => createDelivery(db, {
    invoiceId: invoice.id,
    pic: 'Henny',
    courier: 'lalamove',
    trackingUrl: 'not-a-url',
    user: SALES,
  }), (err) => err.code === 'INVALID_TRACKING_URL');
});
