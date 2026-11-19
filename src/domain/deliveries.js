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
import { fleetAssetOfDriver } from './master.js';

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

export const SERVICES_BY_COURIER = {
  internal: ['REG', 'CARGO'],
  lalamove: ['MOTOR', 'MOBIL', 'CARGO'],
  gosend: ['INSTANT', 'SAMEDAY'],
  grabexpress: ['INSTANT', 'SAMEDAY'],
  'bali-kargo': ['REG', 'CARGO'],
  jnt: ['EZ', 'ECO', 'CARGO'],
  jne: ['REG', 'YES', 'OKS'],
  sicepat: ['REG', 'BEST', 'CARGO'],
  anteraja: ['REG', 'NEXTDAY'],
};

export function servicesForCourier(courier) {
  return SERVICES_BY_COURIER[courier] ?? ['REG'];
}

/**
 * Official tracking pages. App-only couriers (Grab/GoSend/Lalamove) have no
 * public tracking page here; their share link is pasted from the courier app
 * and stored on the delivery.
 */
export const TRACKING_PAGES = {
  internal: null,
  jne: { label: 'Lacak JNE', url: 'https://www.jne.co.id/id/tracking/trace' },
  jnt: { label: 'Lacak J&T', url: 'https://www.jet.co.id/track' },
  sicepat: { label: 'Lacak SiCepat', url: 'https://www.sicepat.com/checkAwb' },
  anteraja: { label: 'Lacak AnterAja', url: 'https://anteraja.id/tracking' },
  'bali-kargo': { label: 'Lacak Bali Kargo', url: 'https://balikargo.co.id/' },
  lalamove: null,
  gosend: null,
  grabexpress: null,
};

export function normalizeTrackingUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new DomainError('INVALID_TRACKING_URL', 'Link lacak harus berupa URL http/https yang valid.');
  }
  assert(['http:', 'https:'].includes(url.protocol), 'INVALID_TRACKING_URL', 'Link lacak harus http atau https.');
  return url.href;
}

/** Tracking link: pasted app share link wins, else the courier's public page. */
export function deliveryTrackingUrl(delivery) {
  const custom = String(delivery?.trackingUrl ?? '').trim();
  if (custom) return custom;
  return TRACKING_PAGES[delivery?.courier]?.url ?? '';
}

export function trackingLabel(delivery) {
  if (delivery?.trackingUrl) return 'Buka link dari aplikasi';
  return TRACKING_PAGES[delivery?.courier]?.label ?? '';
}

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

/** Posted invoices that still need a surat jalan. */
export function invoicesWithoutDelivery(db) {
  return db.invoices.filter((i) => i.status === 'posted' && !deliveryForInvoice(db, i.id));
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

function fleetForDriver(db, driverId) {
  if (!driverId) return null;
  return fleetAssetOfDriver(db, driverId);
}

/**
 * Resolve the armada/transport snapshot for a surat jalan. An explicit choice
 * wins; otherwise a third-party courier maps to its transport master, an
 * internal delivery follows the driver's transport, and a blank courier falls
 * back to the internal transport record.
 */
export function resolveTransport(db, { transportId = null, driver = null, courier = 'internal' } = {}) {
  const transports = db.transportCompanies ?? [];
  const requested = transportId ? transports.find((t) => t.id === transportId) : null;
  if (transportId) assert(requested, 'TRANSPORT_NOT_FOUND', 'Transport tidak ditemukan.');
  const courierTransport = transports.find((t) => t.code === courier) ?? null;
  const driverTransport = driver?.transportId
    ? transports.find((t) => t.id === driver.transportId) ?? null
    : null;
  return requested ?? (courier !== 'internal' ? courierTransport : null) ?? driverTransport ?? courierTransport ?? null;
}

function pushHistory(delivery, action, user, note = '') {
  delivery.history.unshift({ at: isoNow(), by: user?.name ?? 'Sistem', action, note });
}

export function createDelivery(db, {
  invoiceId, pic, picUserId = null, date = todayJakarta(), address = '', courier = 'internal', transportId = null,
  fleetAssetId = null, driverId = null, driver = '', driverPhone = '', vehicleType = '',
  plateNumber = '', vehicle = '', trackingRef = '', trackingUrl = '', awbImage = '', recipientCustomerId = null,
  eta = '', recipientName = '', recipientPhone = '',
  service = null, weightKg = 0, pieces = 0, shippingCost = 0, insurance = 0, codAmount = 0,
  instructions = '', notes = '', user,
}) {
  const invoice = requireInvoice(db, invoiceId);
  assert(invoice.status === 'posted', 'INVOICE_NOT_POSTED', 'Surat jalan dibuat setelah faktur diterbitkan.');
  assert(!deliveryForInvoice(db, invoiceId), 'DELIVERY_EXISTS', 'Faktur ini sudah memiliki surat jalan.');
  const requestedPicUserId = String(picUserId ?? '').trim();
  const picUser = requestedPicUserId ? byId(db.users ?? [], requestedPicUserId) : null;
  if (requestedPicUserId) assert(picUser, 'USER_NOT_FOUND', 'Akun PIC tidak ditemukan.');
  const cleanPic = String(picUser?.name ?? pic ?? '').trim();
  assert(cleanPic.length >= 2, 'PIC_REQUIRED', 'Nama PIC pengiriman wajib diisi.');
  const driverMaster = driverId ? byId(db.drivers ?? [], driverId) : null;
  if (driverId) assert(driverMaster, 'DRIVER_NOT_FOUND', 'Driver tidak ditemukan di master.');
  const nextCourier = String(courier ?? 'internal').trim() || 'internal';
  const nextService = String(service ?? '').trim() || servicesForCourier(nextCourier)[0];
  assert(servicesForCourier(nextCourier).includes(nextService), 'INVALID_SERVICE',
    `Layanan ${nextService} tidak tersedia untuk ${COURIERS[nextCourier]?.label ?? nextCourier}.`);
  const explicitFleet = fleetAssetId ? (db.fleetAssets ?? []).find((a) => a.id === fleetAssetId) : null;
  if (fleetAssetId) assert(explicitFleet, 'FLEET_NOT_FOUND', 'Kendaraan internal tidak ditemukan.');
  const fleet = nextCourier === 'internal'
    ? (explicitFleet ?? fleetForDriver(db, driverMaster?.id))
    : null;
  const transport = resolveTransport(db, {
    transportId: fleet?.transportId ?? transportId,
    driver: driverMaster,
    courier: nextCourier,
  });
  const customer = byId(db.customers, invoice.customerId);
  const recipientId = String(recipientCustomerId ?? '').trim() || invoice.customerId;
  assert(byId(db.customers, recipientId), 'CUSTOMER_NOT_FOUND', 'Pelanggan penerima tidak ditemukan.');
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
    picUserId: picUser?.id ?? null,
    picRole: picUser?.role ?? '',
    address: String(address ?? '').trim() || customer?.address || '',
    courier: nextCourier,
    transportId: transport?.id ?? null,
    transportName: transport?.name ?? '',
    fleetAssetId: fleet?.id ?? null,
    vehicleName: fleet?.name ?? '',
    driverId: driverMaster?.id ?? null,
    driver: driverMaster?.name ?? String(driver ?? '').trim(),
    driverPhone: driverMaster?.phone ?? String(driverPhone ?? '').trim(),
    vehicleType: fleet?.type ?? driverMaster?.vehicleType ?? String(vehicleType ?? '').trim(),
    plateNumber: fleet?.code ?? driverMaster?.plateNumber ?? String(plateNumber || vehicle || '').trim(),
    trackingRef: String(trackingRef ?? '').trim(),
    trackingUrl: normalizeTrackingUrl(trackingUrl),
    awbImage: String(awbImage ?? ''),
    recipientCustomerId: recipientId,
    eta: String(eta ?? '').trim(),
    recipientName: String(recipientName ?? '').trim() || customer?.name || invoice.customerName,
    recipientPhone: String(recipientPhone ?? '').trim() || customer?.phone || '',
    service: nextService,
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
  id, pic, picUserId = null, date, address, courier = 'internal', transportId = null, fleetAssetId = null,
  driverId = null, driver = '', driverPhone = '', vehicleType = '', plateNumber = '', trackingRef = '',
  trackingUrl = null, awbImage = '', recipientCustomerId = null, eta = '', recipientName = '', recipientPhone = '',
  service = null, weightKg = 0, pieces = 0, shippingCost = 0, insurance = 0, codAmount = 0,
  instructions = '', notes, user,
}) {
  const delivery = requireDelivery(db, id);
  assert(delivery.status === 'draft', 'INVALID_STATUS', 'Surat jalan hanya dapat diubah sebelum dikirim.');
  const requestedPicUserId = String(picUserId ?? delivery.picUserId ?? '').trim();
  const picUser = requestedPicUserId ? byId(db.users ?? [], requestedPicUserId) : null;
  if (requestedPicUserId) assert(picUser, 'USER_NOT_FOUND', 'Akun PIC tidak ditemukan.');
  const cleanPic = String(picUser?.name ?? pic ?? delivery.pic ?? '').trim();
  assert(cleanPic.length >= 2, 'PIC_REQUIRED', 'Nama PIC pengiriman wajib diisi.');
  const recipientId = String(recipientCustomerId ?? delivery.recipientCustomerId ?? delivery.customerId ?? '').trim();
  if (recipientId) assert(byId(db.customers, recipientId), 'CUSTOMER_NOT_FOUND', 'Pelanggan penerima tidak ditemukan.');
  const driverMaster = driverId ? byId(db.drivers ?? [], driverId) : null;
  if (driverId) assert(driverMaster, 'DRIVER_NOT_FOUND', 'Driver tidak ditemukan di master.');
  const nextCourier = String(courier ?? delivery.courier ?? 'internal').trim() || 'internal';
  const nextService = String(service ?? '').trim() || servicesForCourier(nextCourier)[0];
  assert(servicesForCourier(nextCourier).includes(nextService), 'INVALID_SERVICE',
    `Layanan ${nextService} tidak tersedia untuk ${COURIERS[nextCourier]?.label ?? nextCourier}.`);
  const explicitFleet = fleetAssetId ? (db.fleetAssets ?? []).find((a) => a.id === fleetAssetId) : null;
  if (fleetAssetId) assert(explicitFleet, 'FLEET_NOT_FOUND', 'Kendaraan internal tidak ditemukan.');
  const fleet = nextCourier === 'internal'
    ? (explicitFleet ?? fleetForDriver(db, driverMaster?.id))
    : null;
  const transport = resolveTransport(db, {
    transportId: fleet?.transportId ?? transportId,
    driver: driverMaster,
    courier: nextCourier,
  });
  Object.assign(delivery, {
    pic: cleanPic,
    picUserId: picUser?.id ?? null,
    picRole: picUser?.role ?? '',
    date: date || delivery.date,
    address: String(address ?? delivery.address).trim(),
    courier: nextCourier,
    transportId: transport?.id ?? null,
    transportName: transport?.name ?? '',
    fleetAssetId: fleet?.id ?? null,
    vehicleName: fleet?.name ?? '',
    driverId: driverMaster?.id ?? null,
    driver: driverMaster?.name ?? String(driver ?? delivery.driver ?? '').trim(),
    driverPhone: driverMaster?.phone ?? String(driverPhone ?? delivery.driverPhone ?? '').trim(),
    vehicleType: fleet?.type ?? driverMaster?.vehicleType ?? String(vehicleType ?? delivery.vehicleType ?? '').trim(),
    plateNumber: fleet?.code ?? driverMaster?.plateNumber ?? String(plateNumber ?? delivery.plateNumber ?? '').trim(),
    trackingRef: String(trackingRef ?? delivery.trackingRef ?? '').trim(),
    trackingUrl: normalizeTrackingUrl(trackingUrl ?? delivery.trackingUrl ?? ''),
    awbImage: String(awbImage ?? delivery.awbImage ?? ''),
    recipientCustomerId: recipientId,
    eta: String(eta ?? delivery.eta ?? '').trim(),
    recipientName: String(recipientName ?? delivery.recipientName ?? '').trim(),
    recipientPhone: String(recipientPhone ?? delivery.recipientPhone ?? '').trim(),
    service: nextService,
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
