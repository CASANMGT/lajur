/**
 * Sales delivery notes (surat jalan) and post-invoice tracking.
 *
 * Posting the invoice is the only stock-issue event. A delivery note is a
 * logistics document: creating, dispatching, delivering and confirming it never
 * moves stock again. One delivery belongs to one posted invoice.
 */

import {
  DomainError, assert, audit, byId, isoNow, nextId, todayJakarta,
} from './core.js';
import { requireInvoice } from './sales.js';

export const DELIVERY_STATUS = {
  draft: { label: 'Dibuat', tone: 'muted' },
  dispatched: { label: 'Dikirim', tone: 'info' },
  delivered: { label: 'Tiba', tone: 'copper' },
  confirmed: { label: 'Diterima & dikonfirmasi', tone: 'ok' },
};

export const COURIERS = {
  internal: { label: 'Internal' },
  lalamove: { label: 'Lalamove' },
  gosend: { label: 'GoSend' },
  grabexpress: { label: 'GrabExpress' },
  'bali-kargo': { label: 'Bali Kargo Utama' },
  jnt: { label: 'J&T Express' },
  jne: { label: 'JNE Express' },
  sicepat: { label: 'SiCepat' },
  anteraja: { label: 'AnterAja' },
};

export function getDelivery(db, id) {
  return db.deliveries?.find((d) => d.id === id) ?? null;
}

export function requireDelivery(db, id) {
  const delivery = getDelivery(db, id);
  if (!delivery) throw new DomainError('DELIVERY_NOT_FOUND', 'Surat jalan tidak ditemukan.');
  return delivery;
}

export function deliveryForInvoice(db, invoiceId) {
  return (db.deliveries ?? []).find((d) => d.invoiceId === invoiceId) ?? null;
}

export function driverDeliveriesOn(db, { driverId, date, excludeId = null } = {}) {
  if (!driverId) return [];
  return (db.deliveries ?? [])
    .filter((d) => d.driverId === driverId && d.date === date && d.id !== excludeId)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function deliverySchedule(db, { limit = 12 } = {}) {
  return [...(db.deliveries ?? [])]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)))
    .slice(0, limit);
}

function pushHistory(delivery, action, user, note = '') {
  delivery.history.unshift({ at: isoNow(), by: user?.name ?? 'Sistem', action, note });
}

export function createDelivery(db, {
  invoiceId, pic, date = todayJakarta(), address = '', courier = 'internal', driverId = null,
  driver = '', driverPhone = '', vehicleType = '', plateNumber = '', vehicle = '', trackingRef = '',
  recipientName = '', recipientPhone = '', service = 'REG', weightKg = 0, pieces = 0,
  shippingCost = 0, insurance = 0, codAmount = 0, instructions = '', notes = '', user,
}) {
  const invoice = requireInvoice(db, invoiceId);
  assert(invoice.status === 'posted', 'INVOICE_NOT_POSTED', 'Surat jalan dibuat setelah faktur diterbitkan.');
  assert(!deliveryForInvoice(db, invoiceId), 'DELIVERY_EXISTS', 'Faktur ini sudah memiliki surat jalan.');
  const cleanPic = String(pic ?? '').trim();
  assert(cleanPic.length >= 2, 'PIC_REQUIRED', 'Nama PIC pengiriman wajib diisi.');
  const driverMaster = driverId ? byId(db.drivers ?? [], driverId) : null;
  if (driverId) assert(driverMaster, 'DRIVER_NOT_FOUND', 'Driver tidak ditemukan di master.');
  const customer = byId(db.customers, invoice.customerId);
  const lines = invoice.lines
    .filter((line) => line.kind !== 'service')
    .map((line) => ({
      invoiceLineId: line.id,
      description: line.description,
      kind: line.kind,
      qtyMm: line.qtyMm,
      qtyPcs: line.qtyPcs,
      note: line.note ?? '',
    }));
  assert(lines.length > 0, 'EMPTY_LINES', 'Faktur ini tidak memiliki barang untuk dikirim.');

  const delivery = {
    id: nextId(db, 'delivery', 'SJ', 4),
    invoiceId,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    date,
    pic: cleanPic,
    address: String(address ?? '').trim() || customer?.address || '',
    courier: String(courier ?? 'internal').trim() || 'internal',
    driverId: driverMaster?.id ?? null,
    driver: driverMaster?.name ?? String(driver ?? '').trim(),
    driverPhone: driverMaster?.phone ?? String(driverPhone ?? '').trim(),
    vehicleType: driverMaster?.vehicleType ?? String(vehicleType ?? '').trim(),
    plateNumber: driverMaster?.plateNumber ?? String(plateNumber || vehicle || '').trim(),
    trackingRef: String(trackingRef ?? '').trim(),
    recipientName: String(recipientName ?? '').trim() || customer?.name || invoice.customerName,
    recipientPhone: String(recipientPhone ?? '').trim() || customer?.phone || '',
    service: String(service ?? 'REG').trim() || 'REG',
    weightKg: Math.max(0, Number(weightKg) || 0),
    pieces: Math.max(0, Math.round(Number(pieces) || 0)),
    shippingCost: Math.max(0, Number(shippingCost) || 0),
    insurance: Math.max(0, Number(insurance) || 0),
    codAmount: Math.max(0, Number(codAmount) || 0),
    instructions: String(instructions ?? '').trim(),
    notes: String(notes ?? '').trim(),
    status: 'draft',
    lines,
    receivedBy: '',
    confirmationNote: '',
    dispatchedAt: null,
    deliveredAt: null,
    confirmedAt: null,
    createdAt: isoNow(),
    createdBy: user?.name ?? 'Sistem',
    history: [{ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Surat jalan dibuat', note: '' }],
  };
  db.deliveries = db.deliveries ?? [];
  db.deliveries.unshift(delivery);
  invoice.deliveryId = delivery.id;
  audit(db, user, 'buat_surat_jalan', 'delivery', delivery.id, `${invoiceId} · PIC ${cleanPic}`);
  return delivery;
}

export function updateDelivery(db, {
  id, pic, date, address, courier = 'internal', driverId = null, driver = '', driverPhone = '',
  vehicleType = '', plateNumber = '', trackingRef = '', recipientName = '', recipientPhone = '',
  service = 'REG', weightKg = 0, pieces = 0, shippingCost = 0, insurance = 0, codAmount = 0,
  instructions = '', notes, user,
}) {
  const delivery = requireDelivery(db, id);
  assert(delivery.status === 'draft', 'INVALID_STATUS', 'Surat jalan hanya dapat diubah sebelum dikirim.');
  const cleanPic = String(pic ?? delivery.pic).trim();
  assert(cleanPic.length >= 2, 'PIC_REQUIRED', 'Nama PIC pengiriman wajib diisi.');
  const driverMaster = driverId ? byId(db.drivers ?? [], driverId) : null;
  if (driverId) assert(driverMaster, 'DRIVER_NOT_FOUND', 'Driver tidak ditemukan di master.');
  Object.assign(delivery, {
    pic: cleanPic,
    date: date || delivery.date,
    address: String(address ?? delivery.address).trim(),
    courier: String(courier ?? delivery.courier ?? 'internal').trim() || 'internal',
    driverId: driverMaster?.id ?? null,
    driver: driverMaster?.name ?? String(driver ?? delivery.driver ?? '').trim(),
    driverPhone: driverMaster?.phone ?? String(driverPhone ?? delivery.driverPhone ?? '').trim(),
    vehicleType: driverMaster?.vehicleType ?? String(vehicleType ?? delivery.vehicleType ?? '').trim(),
    plateNumber: driverMaster?.plateNumber ?? String(plateNumber ?? delivery.plateNumber ?? '').trim(),
    trackingRef: String(trackingRef ?? delivery.trackingRef ?? '').trim(),
    recipientName: String(recipientName ?? delivery.recipientName ?? '').trim(),
    recipientPhone: String(recipientPhone ?? delivery.recipientPhone ?? '').trim(),
    service: String(service ?? delivery.service ?? 'REG').trim() || 'REG',
    weightKg: Math.max(0, Number(weightKg ?? delivery.weightKg) || 0),
    pieces: Math.max(0, Math.round(Number(pieces ?? delivery.pieces) || 0)),
    shippingCost: Math.max(0, Number(shippingCost ?? delivery.shippingCost) || 0),
    insurance: Math.max(0, Number(insurance ?? delivery.insurance) || 0),
    codAmount: Math.max(0, Number(codAmount ?? delivery.codAmount) || 0),
    instructions: String(instructions ?? delivery.instructions ?? '').trim(),
    notes: String(notes ?? delivery.notes).trim(),
    updatedAt: isoNow(),
  });
  pushHistory(delivery, 'Surat jalan diubah', user, `PIC ${cleanPic}`);
  audit(db, user, 'ubah_surat_jalan', 'delivery', delivery.id, `PIC ${cleanPic}`);
  return delivery;
}

export function dispatchDelivery(db, { id, user, note = '' }) {
  const delivery = requireDelivery(db, id);
  assert(delivery.status === 'draft', 'INVALID_STATUS', 'Surat jalan sudah dikirim.');
  delivery.status = 'dispatched';
  delivery.dispatchedAt = isoNow();
  pushHistory(delivery, 'Barang dikirim', user, note);
  audit(db, user, 'kirim_surat_jalan', 'delivery', delivery.id, note);
  return delivery;
}

export function markDelivered(db, { id, user, note = '' }) {
  const delivery = requireDelivery(db, id);
  assert(delivery.status === 'dispatched', 'INVALID_STATUS', 'Tandai tiba hanya setelah dikirim.');
  delivery.status = 'delivered';
  delivery.deliveredAt = isoNow();
  pushHistory(delivery, 'Barang tiba di pelanggan', user, note);
  audit(db, user, 'tiba_surat_jalan', 'delivery', delivery.id, note);
  return delivery;
}

export function confirmDelivery(db, { id, receivedBy, note = '', user }) {
  const delivery = requireDelivery(db, id);
  assert(delivery.status === 'delivered', 'INVALID_STATUS', 'Konfirmasi dilakukan setelah barang tiba.');
  const cleanReceiver = String(receivedBy ?? '').trim();
  assert(cleanReceiver.length >= 2, 'RECEIVER_REQUIRED', 'Nama PIC penerima wajib diisi.');
  delivery.status = 'confirmed';
  delivery.receivedBy = cleanReceiver;
  delivery.confirmationNote = String(note ?? '').trim();
  delivery.confirmedAt = isoNow();
  pushHistory(delivery, 'Penerimaan dikonfirmasi', user, `${cleanReceiver}${delivery.confirmationNote ? ` · ${delivery.confirmationNote}` : ''}`);
  audit(db, user, 'konfirmasi_surat_jalan', 'delivery', delivery.id, cleanReceiver);
  return delivery;
}
