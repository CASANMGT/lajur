/**
 * Sales orders (pesanan penjualan). An order reserves fabric and parts but posts
 * no stock; converting it to an invoice consumes the reservation and is the
 * single stock-issue event.
 */

import {
  DomainError, MM_PER_M, assert, audit, byId, isoNow, money, nextId, todayJakarta,
} from './core.js';
import {
  availableMm, partReservedFor, partStockRow, releaseAllReservations, releasePartReservation,
  requireRoll, reservePart, reserveRoll,
} from './inventory.js';
import { createInvoice, postInvoice, reservedFor } from './sales.js';

export const ORDER_STATUS = {
  draft: { label: 'Draf', tone: 'muted' },
  confirmed: { label: 'Dikonfirmasi', tone: 'info' },
  converted: { label: 'Menjadi faktur', tone: 'ok' },
  cancelled: { label: 'Dibatalkan', tone: 'danger' },
};

export function getOrder(db, id) {
  return db.orders.find((o) => o.id === id) ?? null;
}

export function requireOrder(db, id) {
  const order = getOrder(db, id);
  if (!order) throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan.');
  return order;
}

function buildOrderLines(db, { lines, orderId = null }) {
  return lines.map((line) => {
    if (line.kind === 'part') {
      const part = byId(db.parts, line.partId);
      assert(part, 'PART_NOT_FOUND', 'Spare part tidak ditemukan.');
      assert(part.active !== false, 'INACTIVE_PART', 'Spare part nonaktif tidak dapat dipesan.');
      const qty = Math.round(Number(line.qtyPcs));
      assert(qty > 0, 'INVALID_QTY', 'Jumlah part harus bilangan bulat lebih dari 0.');
      assert(line.warehouseId, 'WAREHOUSE_REQUIRED', 'Gudang part wajib dipilih.');
      const row = partStockRow(db, part.id, line.warehouseId);
      const held = orderId && row ? partReservedFor(row, orderId) : 0;
      const free = row ? row.qty - (row.reserved || 0) + held : 0;
      assert(row && free >= qty, 'INSUFFICIENT_PART', `Tersedia ${Math.max(0, free)} pcs di gudang ini.`);
      const unitPrice = money(line.unitPrice ?? part.sellPrice);
      return {
        id: nextId(db, 'orderLine', 'OL', 5),
        kind: 'part', partId: part.id, rollId: null,
        description: part.name, qtyPcs: qty, qtyMm: null, unitPrice,
        amount: qty * unitPrice, warehouseId: line.warehouseId,
      };
    }
    const roll = requireRoll(db, line.rollId);
    const sku = byId(db.skus, roll.skuId);
    assert(sku && sku.active !== false && !sku.dormant, 'DORMANT_PRODUCT', 'Produk nonaktif/dormant tidak dapat dipesan.');
    const whole = line.mode === 'whole';
    const held = orderId ? reservedFor(roll, orderId) : 0;
    let qtyMm;
    if (whole) {
      assert((roll.reservedMm || 0) - held === 0, 'ROLL_RESERVED', 'Roll memiliki reservasi lain.');
      qtyMm = roll.currentMm;
      assert(qtyMm > 0, 'ROLL_EMPTY', 'Roll sudah habis.');
    } else {
      qtyMm = Math.round(Number(line.qtyMm));
      assert(qtyMm > 0, 'INVALID_LENGTH', 'Panjang harus lebih dari 0 m.');
      assert(qtyMm <= availableMm(roll) + held, 'INSUFFICIENT_AVAILABLE',
        `Tersedia ${(availableMm(roll) + held) / MM_PER_M} m pada ${roll.id}.`);
    }
    const unitPrice = money(line.unitPrice ?? sku.sellPrice);
    return {
      id: nextId(db, 'orderLine', 'OL', 5),
      kind: 'fabric', skuId: sku.id, rollId: roll.id, lot: roll.lot,
      mode: whole ? 'whole' : 'cut',
      description: `${sku.collectionName} — ${sku.colourName || sku.colourCode} (${sku.code})`,
      qtyMm, qtyPcs: null, unitPrice,
      amount: money((qtyMm / MM_PER_M) * unitPrice),
      warehouseId: roll.warehouseId,
    };
  });
}

function applyReservations(db, orderId, built, user) {
  for (const line of built) {
    if (line.kind === 'fabric') {
      reserveRoll(db, { rollId: line.rollId, qtyMm: line.qtyMm, ref: orderId, user, note: `Pesanan ${orderId}` });
    } else {
      reservePart(db, { partId: line.partId, warehouseId: line.warehouseId, qty: line.qtyPcs, ref: orderId, user, note: `Pesanan ${orderId}` });
    }
  }
}

export function createSalesOrder(db, { customerId, projectId = null, date = todayJakarta(), lines, notes = '', user }) {
  const customer = byId(db.customers, customerId);
  assert(customer, 'CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan.');
  assert(Array.isArray(lines) && lines.length > 0, 'EMPTY_LINES', 'Pesanan harus memiliki minimal satu baris.');

  const built = buildOrderLines(db, { lines });
  const id = nextId(db, 'order', 'SO', 4);
  applyReservations(db, id, built, user);

  const order = {
    id,
    customerId,
    customerName: customer.name,
    projectId,
    date,
    status: 'draft',
    lines: built,
    total: built.reduce((acc, l) => acc + l.amount, 0),
    notes,
    invoiceId: null,
    createdAt: isoNow(),
    createdBy: user?.name ?? 'Sistem',
    userId: user?.id ?? 'system',
    history: [{ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Pesanan dibuat' }],
  };
  db.orders.unshift(order);
  audit(db, user, 'buat_pesanan', 'order', order.id, `${customer.name} · ${order.total}`);
  return order;
}

/**
 * Edit a draft order. Reservations are rebuilt from the new lines: the old
 * reservation is released and the new one is placed in the same transaction.
 */
export function updateSalesOrder(db, {
  id, customerId, projectId = null, date, lines, notes = '', user,
}) {
  const order = requireOrder(db, id);
  assert(order.status === 'draft', 'INVALID_STATUS', 'Hanya pesanan draf yang dapat diubah.');
  const customer = byId(db.customers, customerId ?? order.customerId);
  assert(customer, 'CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan.');
  assert(Array.isArray(lines) && lines.length > 0, 'EMPTY_LINES', 'Pesanan harus memiliki minimal satu baris.');

  const built = buildOrderLines(db, { lines, orderId: order.id });
  releaseAllReservations(db, order.id, user, `Ubah pesanan ${order.id}`);
  for (const line of order.lines.filter((l) => l.kind === 'part')) {
    releasePartReservation(db, { partId: line.partId, warehouseId: line.warehouseId, ref: order.id, user });
  }
  applyReservations(db, order.id, built, user);

  order.customerId = customer.id;
  order.customerName = customer.name;
  order.projectId = projectId ?? null;
  order.date = date ?? order.date;
  order.lines = built;
  order.total = built.reduce((acc, l) => acc + l.amount, 0);
  order.notes = notes;
  order.updatedAt = isoNow();
  order.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Pesanan diubah' });
  audit(db, user, 'ubah_pesanan', 'order', order.id, `${customer.name} · ${order.total}`);
  return order;
}

export function confirmOrder(db, { id, user }) {
  const order = requireOrder(db, id);
  assert(order.status === 'draft', 'INVALID_STATUS', 'Hanya draf yang dapat dikonfirmasi.');
  order.status = 'confirmed';
  order.confirmedAt = isoNow();
  order.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Dikonfirmasi' });
  audit(db, user, 'konfirmasi_pesanan', 'order', order.id, '');
  return order;
}

export function cancelOrder(db, { id, reason = '', user }) {
  const order = requireOrder(db, id);
  assert(['draft', 'confirmed'].includes(order.status), 'INVALID_STATUS', 'Pesanan sudah menjadi faktur.');
  releaseAllReservations(db, order.id, user, `Batal pesanan ${order.id}`);
  for (const line of order.lines.filter((l) => l.kind === 'part')) {
    releasePartReservation(db, { partId: line.partId, warehouseId: line.warehouseId, ref: order.id, user });
  }
  order.status = 'cancelled';
  order.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Dibatalkan', note: reason });
  audit(db, user, 'batalkan_pesanan', 'order', order.id, reason);
  return order;
}

export function convertOrderToInvoice(db, { id, user, dueDays = 14 }) {
  const order = requireOrder(db, id);
  assert(['draft', 'confirmed'].includes(order.status), 'INVALID_STATUS', 'Pesanan sudah dikonversi atau dibatalkan.');
  const lines = order.lines.map((l) => l.kind === 'part'
    ? { kind: 'part', partId: l.partId, qtyPcs: l.qtyPcs, unitPrice: l.unitPrice, warehouseId: l.warehouseId }
    : { kind: 'fabric', rollId: l.rollId, mode: l.mode, qtyMm: l.qtyMm, unitPrice: l.unitPrice });
  const invoice = createInvoice(db, {
    customerId: order.customerId,
    projectId: order.projectId,
    lines,
    dueDays,
    notes: order.notes || `Pesanan ${order.id}`,
    user,
  });
  postInvoice(db, { id: invoice.id, user, reservationRef: order.id });
  releaseAllReservations(db, order.id, user, `Pesanan ${order.id} difakturkan`);
  for (const line of order.lines.filter((l) => l.kind === 'part')) {
    releasePartReservation(db, { partId: line.partId, warehouseId: line.warehouseId, ref: order.id, user });
  }
  order.status = 'converted';
  order.invoiceId = invoice.id;
  order.convertedAt = isoNow();
  order.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: `Faktur ${invoice.id} diterbitkan` });
  audit(db, user, 'konversi_pesanan', 'order', order.id, invoice.id);
  return { order, invoice };
}
