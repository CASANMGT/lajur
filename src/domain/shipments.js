/**
 * Import shipments: track a purchase order from the overseas supplier to the
 * destination warehouse, including freight/duty costs used in landed COGS.
 */

import {
  DomainError, assert, audit, byId, isoNow, money, nextId, todayJakarta,
} from './core.js';

export const SHIPMENT_STATUS = {
  preparing: { label: 'Persiapan', tone: 'muted' },
  in_transit: { label: 'Dalam transit', tone: 'info' },
  customs: { label: 'Bea cukai', tone: 'warn' },
  arrived: { label: 'Tiba di pelabuhan', tone: 'copper' },
  received: { label: 'Diterima gudang', tone: 'ok' },
  cancelled: { label: 'Dibatalkan', tone: 'danger' },
};

export const SHIPMENT_FLOW = ['preparing', 'in_transit', 'customs', 'arrived', 'received'];

export const SHIPMENT_MODE = {
  sea: { label: 'Laut (FCL/LCL)', days: 28 },
  air: { label: 'Udara', days: 7 },
  land: { label: 'Darat', days: 5 },
};

export function getShipment(db, id) {
  return db.shipments.find((s) => s.id === id) ?? null;
}

export function requireShipment(db, id) {
  const shipment = getShipment(db, id);
  if (!shipment) throw new DomainError('SHIPMENT_NOT_FOUND', 'Pengiriman tidak ditemukan.');
  return shipment;
}

export function shipmentCosts(costs = {}) {
  const freight = money(costs.freightIdr);
  const insurance = money(costs.insuranceIdr);
  const duty = money(costs.dutyIdr);
  const other = money(costs.otherIdr);
  return { freightIdr: freight, insuranceIdr: insurance, dutyIdr: duty, otherIdr: other, totalIdr: freight + insurance + duty + other };
}

export function createShipment(db, {
  poId, mode = 'sea', reference, container = '', etd, eta,
  costs = {}, notes = '', attachment = null, user,
}) {
  const po = db.purchaseOrders.find((p) => p.id === poId);
  assert(po, 'PO_NOT_FOUND', 'PO tidak ditemukan.');
  assert(['approved', 'partial'].includes(po.status), 'INVALID_STATUS', 'PO harus disetujui sebelum dikirim.');
  assert(SHIPMENT_MODE[mode], 'INVALID_MODE', 'Moda pengiriman tidak dikenal.');
  assert(reference && reference.trim().length >= 3, 'REF_REQUIRED', 'Nomor pengiriman / BL / AWB wajib diisi.');
  assert(etd && eta && eta >= etd, 'INVALID_DATE', 'ETA harus setelah ETD.');
  assert(!db.shipments.some((s) => s.reference.toLowerCase() === reference.trim().toLowerCase()), 'DUPLICATE_SHIPMENT', 'Nomor pengiriman sudah dipakai.');

  const shipment = {
    id: nextId(db, 'shipment', 'SHP', 4),
    poId,
    supplierId: po.supplierId,
    mode,
    reference: reference.trim(),
    container: container.trim(),
    etd,
    eta,
    actualArrival: null,
    status: 'preparing',
    costs: shipmentCosts(costs),
    landedCostIdr: shipmentCosts(costs).totalIdr,
    notes: notes.trim(),
    attachments: [],
    history: [{ at: isoNow(), status: 'preparing', date: todayJakarta(), note: 'Pengiriman dibuat', by: user?.name ?? 'Sistem' }],
    createdAt: isoNow(),
    createdBy: user?.name ?? 'Sistem',
  };
  if (attachment) {
    shipment.attachments.push({ ...attachment, note: 'Dokumen pengiriman', at: isoNow(), by: user?.name ?? 'Sistem' });
  }
  db.shipments.unshift(shipment);
  audit(db, user, 'buat_pengiriman', 'shipment', shipment.id, `${po.id} · ${shipment.reference}`);
  return shipment;
}

export function updateShipmentStatus(db, { id, status, date = todayJakarta(), note = '', location = '', user }) {
  const shipment = requireShipment(db, id);
  assert(SHIPMENT_STATUS[status], 'INVALID_STATUS', 'Status pengiriman tidak dikenal.');
  assert(shipment.status !== 'cancelled', 'INVALID_STATUS', 'Pengiriman sudah dibatalkan.');
  shipment.status = status;
  if (status === 'arrived' || status === 'received') shipment.actualArrival = date;
  if (location) shipment.location = location;
  shipment.history.push({ at: isoNow(), status, date, note: note.trim(), location, by: user?.name ?? 'Sistem' });
  audit(db, user, 'update_pengiriman', 'shipment', shipment.id, `${status} · ${note}`);
  return shipment;
}

export function shipmentsForPO(db, poId) {
  return db.shipments.filter((s) => s.poId === poId);
}

export function activeShipmentForPO(db, poId) {
  return db.shipments
    .filter((s) => s.poId === poId && s.status !== 'cancelled')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null;
}

export function shipmentProgress(shipment) {
  const idx = SHIPMENT_FLOW.indexOf(shipment.status);
  return SHIPMENT_FLOW.map((key, i) => ({
    key,
    label: SHIPMENT_STATUS[key].label,
    state: i < idx ? 'done' : i === idx ? 'current' : 'todo',
  }));
}

/** Landed cost added per unit, allocated by line value share. */
export function landedAddPerUnit(db, poId) {
  const shipment = activeShipmentForPO(db, poId);
  if (!shipment || !shipment.landedCostIdr) return null;
  const po = db.purchaseOrders.find((p) => p.id === poId);
  if (!po) return null;
  const totalValue = po.lines.reduce((acc, l) => {
    const qty = l.kind === 'fabric' ? l.qtyMm / 1000 : l.qtyPcs;
    return acc + qty * (l.unitCostIdr ?? Math.round(l.unitPrice * (po.fxRate ?? 1)));
  }, 0);
  if (!totalValue) return null;
  const map = new Map();
  for (const line of po.lines) {
    const qty = line.kind === 'fabric' ? line.qtyMm / 1000 : line.qtyPcs;
    const lineValue = qty * (line.unitCostIdr ?? Math.round(line.unitPrice * (po.fxRate ?? 1)));
    const allocated = (shipment.landedCostIdr * lineValue) / totalValue;
    map.set(line.id, qty ? allocated / qty : 0);
  }
  return { shipmentId: shipment.id, totals: map, landedCostIdr: shipment.landedCostIdr };
}

export function shipmentStats(db) {
  const active = db.shipments.filter((s) => !['received', 'cancelled'].includes(s.status));
  return {
    total: db.shipments.length,
    active: active.length,
    inTransit: db.shipments.filter((s) => s.status === 'in_transit').length,
    customs: db.shipments.filter((s) => s.status === 'customs').length,
    late: active.filter((s) => s.eta < todayJakarta()).length,
    value: active.reduce((acc, s) => {
      const po = db.purchaseOrders.find((p) => p.id === s.poId);
      return acc + (po?.total ?? 0);
    }, 0),
    landed: active.reduce((acc, s) => acc + (s.landedCostIdr ?? 0), 0),
  };
}
