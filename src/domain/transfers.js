/**
 * Permintaan Gudang / PO Internal — internal transfers between warehouses.
 *
 * Approval does NOT reserve stock. Availability is re-checked at dispatch,
 * which is the moment goods physically leave the source warehouse. Receiving
 * is recorded independently, so the three quantities stay distinct:
 *
 *   outstanding dispatch = requested - dispatched
 *   in transit           = dispatched - received
 *
 * Transfers never create revenue, receivables, or supplier payables, and they
 * preserve both total metres and unit cost.
 */

import {
  DomainError, MM_PER_M, assert, audit, byId, daysBetween, isoNow, nextId, todayJakarta,
} from './core.js';
import {
  assertWarehouseOpen, availableMm, createRoll, recordMovement, requireRoll,
} from './inventory.js';

export const TRANSFER_STATUS = {
  draft: { label: 'Draf', tone: 'muted' },
  submitted: { label: 'Menunggu persetujuan', tone: 'warn' },
  approved: { label: 'Disetujui', tone: 'info' },
  rejected: { label: 'Ditolak', tone: 'danger' },
  dispatched: { label: 'Dikirim sebagian', tone: 'copper' },
  partially_received: { label: 'Diterima sebagian', tone: 'copper' },
  received: { label: 'Diterima lengkap', tone: 'ok' },
  cancelled: { label: 'Dibatalkan', tone: 'muted' },
};

export const lineStats = (line) => {
  const outstandingMm = Math.max(0, line.requestedMm - line.dispatchedMm);
  const inTransitMm = Math.max(0, line.dispatchedMm - line.receivedMm);
  return {
    outstandingMm,
    inTransitMm,
    receivedPct: line.requestedMm ? Math.round((line.receivedMm / line.requestedMm) * 100) : 0,
    dispatchPct: line.requestedMm ? Math.round((line.dispatchedMm / line.requestedMm) * 100) : 0,
  };
};

export const transferTotals = (transfer) => {
  const totals = transfer.lines.reduce(
    (acc, line) => {
      const s = lineStats(line);
      acc.requestedMm += line.requestedMm;
      acc.dispatchedMm += line.dispatchedMm;
      acc.receivedMm += line.receivedMm;
      acc.outstandingMm += s.outstandingMm;
      acc.inTransitMm += s.inTransitMm;
      return acc;
    },
    { requestedMm: 0, dispatchedMm: 0, receivedMm: 0, outstandingMm: 0, inTransitMm: 0 },
  );
  return totals;
};

export function getTransfer(db, id) {
  return db.transfers.find((t) => t.id === id) ?? null;
}

export function requireTransfer(db, id) {
  const t = getTransfer(db, id);
  if (!t) throw new DomainError('TRANSFER_NOT_FOUND', 'Permintaan gudang tidak ditemukan.');
  return t;
}

/* -------------------------------------------------------------------------- */
/* Create / approve                                                           */
/* -------------------------------------------------------------------------- */

export function createTransfer(db, { fromWarehouseId, toWarehouseId, neededBy, reason, projectId = null, lines, user }) {
  assert(fromWarehouseId && toWarehouseId, 'MISSING_WAREHOUSE', 'Gudang sumber dan tujuan wajib dipilih.');
  assert(fromWarehouseId !== toWarehouseId, 'SAME_WAREHOUSE', 'Gudang sumber dan tujuan tidak boleh sama.');
  byId(db.warehouses, fromWarehouseId);
  assert(Array.isArray(lines) && lines.length > 0, 'EMPTY_LINES', 'Permintaan harus memiliki minimal satu baris barang.');
  const clean = lines
    .filter((l) => l.skuId && Number(l.requestedMm) > 0)
    .map((l) => ({
      id: nextId(db, 'transferLine', 'TL', 5),
      skuId: l.skuId,
      requestedMm: Math.round(Number(l.requestedMm)),
      dispatchedMm: 0,
      receivedMm: 0,
      allocations: [],
      note: l.note ?? '',
    }));
  assert(clean.length > 0, 'EMPTY_LINES', 'Tidak ada baris dengan jumlah valid.');

  const transfer = {
    id: nextId(db, 'transfer', 'TRF', 4),
    fromWarehouseId,
    toWarehouseId,
    neededBy: neededBy || todayJakarta(),
    reason: reason || '',
    projectId,
    status: 'draft',
    lines: clean,
    requestedById: user?.id ?? 'system',
    requestedByName: user?.name ?? 'Sistem',
    createdAt: isoNow(),
    createdDate: todayJakarta(),
    approvedBy: null,
    approvedAt: null,
    rejectionNote: '',
    cancelledAt: null,
    notes: '',
    history: [],
  };
  db.transfers.unshift(transfer);
  audit(db, user, 'buat_permintaan', 'transfer', transfer.id, `${clean.length} baris dari ${fromWarehouseId} ke ${toWarehouseId}`);
  return transfer;
}

export function submitTransfer(db, { id, user }) {
  const t = requireTransfer(db, id);
  assert(t.status === 'draft', 'INVALID_STATUS', 'Hanya draf yang dapat diajukan.');
  assert(t.lines.some((l) => l.requestedMm > 0), 'EMPTY_LINES', 'Permintaan kosong.');
  t.status = 'submitted';
  t.submittedAt = isoNow();
  t.history.push({ at: isoNow(), by: user?.name, action: 'Diajukan', note: '' });
  audit(db, user, 'ajukan_permintaan', 'transfer', t.id, '');
  return t;
}

export function approveTransfer(db, { id, user, note = '' }) {
  const t = requireTransfer(db, id);
  assert(user?.role === 'manager', 'FORBIDDEN', 'Hanya manajer yang dapat menyetujui permintaan gudang.');
  assert(t.status === 'submitted', 'INVALID_STATUS', 'Permintaan belum diajukan atau sudah diproses.');
  t.status = 'approved';
  t.approvedBy = user.name;
  t.approvedAt = isoNow();
  t.approvalNote = note;
  t.history.push({ at: isoNow(), by: user?.name, action: 'Disetujui', note });
  audit(db, user, 'setujui_permintaan', 'transfer', t.id, note);
  return t;
}

export function rejectTransfer(db, { id, user, note }) {
  const t = requireTransfer(db, id);
  assert(user?.role === 'manager', 'FORBIDDEN', 'Hanya manajer yang dapat menolak permintaan.');
  assert(t.status === 'submitted', 'INVALID_STATUS', 'Permintaan tidak dalam status diajukan.');
  assert(note && note.trim().length >= 3, 'REASON_REQUIRED', 'Alasan penolakan wajib diisi.');
  t.status = 'rejected';
  t.rejectionNote = note.trim();
  t.history.push({ at: isoNow(), by: user?.name, action: 'Ditolak', note: note.trim() });
  audit(db, user, 'tolak_permintaan', 'transfer', t.id, note);
  return t;
}

export function cancelTransfer(db, { id, user, note = '' }) {
  const t = requireTransfer(db, id);
  assert(['draft', 'submitted', 'approved', 'rejected'].includes(t.status), 'INVALID_STATUS', 'Permintaan yang sudah dikirim tidak dapat dibatalkan.');
  assert(!t.lines.some((l) => l.dispatchedMm > 0), 'ALREADY_DISPATCHED', 'Barang sudah dikirim; gunakan alur retur transit.');
  t.status = 'cancelled';
  t.cancelledAt = isoNow();
  t.cancelNote = note;
  t.history.push({ at: isoNow(), by: user?.name, action: 'Dibatalkan', note });
  audit(db, user, 'batalkan_permintaan', 'transfer', t.id, note);
  return t;
}

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Dispatch one line. `allocations` is [{ rollId, qtyMm }]. Stock is re-checked
 * here — approval deliberately does not hold inventory.
 */
export function dispatchLine(db, { transferId, lineId, allocations, user, date = todayJakarta(), note = '' }) {
  const t = requireTransfer(db, transferId);
  assert(['approved', 'dispatched', 'partially_received'].includes(t.status), 'INVALID_STATUS', 'Permintaan belum disetujui atau sudah selesai.');
  const line = t.lines.find((l) => l.id === lineId);
  assert(line, 'LINE_NOT_FOUND', 'Baris permintaan tidak ditemukan.');
  assertWarehouseOpen(db, t.fromWarehouseId, 'Pengiriman transfer');

  const stats = lineStats(line);
  const requested = (allocations || []).reduce((acc, a) => acc + Math.round(Number(a.qtyMm) || 0), 0);
  assert(requested > 0, 'INVALID_QTY', 'Jumlah kirim harus lebih dari 0 m.');
  assert(requested <= stats.outstandingMm, 'OVER_DISPATCH',
    `Jumlah kirim ${requested / MM_PER_M} m melebihi sisa yang belum dikirim ${stats.outstandingMm / MM_PER_M} m.`);

  const prepared = [];
  for (const alloc of allocations) {
    const qty = Math.round(Number(alloc.qtyMm) || 0);
    if (!qty) continue;
    const roll = requireRoll(db, alloc.rollId);
    assert(roll.skuId === line.skuId, 'SKU_MISMATCH', `Roll ${roll.id} bukan SKU yang diminta.`);
    assert(roll.warehouseId === t.fromWarehouseId && !roll.transit, 'WRONG_WAREHOUSE', `Roll ${roll.id} tidak berada di gudang sumber.`);
    assert(availableMm(roll) >= qty, 'INSUFFICIENT_AVAILABLE',
      `Roll ${roll.id} hanya tersedia ${availableMm(roll) / MM_PER_M} m (${roll.reservedMm / MM_PER_M} m terpesan).`);
    prepared.push({ roll, qty });
  }
  assert(prepared.length > 0, 'EMPTY_ALLOCATION', 'Pilih minimal satu roll sumber.');

  for (const { roll, qty } of prepared) {
    const whole = qty === roll.currentMm && (roll.reservedMm || 0) === 0;
    let piece;
    if (whole) {
      // Move the physical roll itself, preserving its identity.
      piece = roll;
      piece.warehouseId = null;
      piece.transit = {
        transferId: t.id,
        lineId: line.id,
        fromWarehouseId: t.fromWarehouseId,
        toWarehouseId: t.toWarehouseId,
        dispatchedAt: isoNow(),
      };
      recordMovement(db, {
        type: 'transfer_out',
        ref: t.id,
        warehouseId: t.fromWarehouseId,
        warehouseToId: t.toWarehouseId,
        skuId: roll.skuId,
        rollId: roll.id,
        qtyMm: qty,
        beforeMm: qty,
        afterMm: 0,
        unitCost: roll.costPerM,
        value: Math.round((qty / MM_PER_M) * roll.costPerM),
        user,
        note: note || `Transfer ke ${t.toWarehouseId}`,
      });
    } else {
      const before = roll.currentMm;
      roll.currentMm = before - qty;
      piece = createRoll(db, {
        skuId: roll.skuId,
        lot: roll.lot,
        receivedAt: roll.receivedAt,
        receiptRef: roll.receiptRef,
        originalMm: qty,
        currentMm: qty,
        warehouseId: null,
        bin: roll.bin,
        status: 'available',
        condition: roll.condition,
        costPerM: roll.costPerM,
        transit: {
          transferId: t.id,
          lineId: line.id,
          fromWarehouseId: t.fromWarehouseId,
          toWarehouseId: t.toWarehouseId,
          dispatchedAt: isoNow(),
        },
        parentRollId: roll.id,
        rootRollId: roll.rootRollId || roll.id,
        user,
      });
      recordMovement(db, {
        type: 'transfer_out',
        ref: t.id,
        warehouseId: t.fromWarehouseId,
        warehouseToId: t.toWarehouseId,
        skuId: roll.skuId,
        rollId: piece.id,
        parentRollId: roll.id,
        qtyMm: qty,
        beforeMm: before,
        afterMm: roll.currentMm,
        unitCost: roll.costPerM,
        value: Math.round((qty / MM_PER_M) * roll.costPerM),
        user,
        note: note || `Transfer ke ${t.toWarehouseId}`,
      });
    }
    line.allocations.push({ rollId: piece.id, dispatchedMm: qty, receivedMm: 0, date });
    line.dispatchedMm += qty;
  }

  t.status = t.lines.some((l) => l.receivedMm > 0) ? 'partially_received' : 'dispatched';
  t.history.push({
    at: isoNow(),
    by: user?.name,
    action: `Kirim ${requested / MM_PER_M} m`,
    note: note || `${prepared.length} roll dari ${t.fromWarehouseId}`,
  });
  audit(db, user, 'kirim_transfer', 'transfer', t.id, `${line.skuId} ${requested / MM_PER_M} m`);
  return t;
}

/* -------------------------------------------------------------------------- */
/* Receive                                                                    */
/* -------------------------------------------------------------------------- */

export function receiveLine(db, { transferId, lineId, qtyMm, user, date = todayJakarta(), bin = '', note = '' }) {
  const t = requireTransfer(db, transferId);
  assert(['dispatched', 'partially_received'].includes(t.status), 'INVALID_STATUS', 'Belum ada barang yang dikirim.');
  const line = t.lines.find((l) => l.id === lineId);
  assert(line, 'LINE_NOT_FOUND', 'Baris tidak ditemukan.');
  assertWarehouseOpen(db, t.toWarehouseId, 'Penerimaan transfer');

  const stats = lineStats(line);
  const qty = Math.round(Number(qtyMm));
  assert(qty > 0, 'INVALID_QTY', 'Jumlah terima harus lebih dari 0 m.');
  assert(qty <= stats.inTransitMm, 'OVER_RECEIVE',
    `Jumlah terima ${qty / MM_PER_M} m melebihi barang dalam perjalanan ${stats.inTransitMm / MM_PER_M} m.`);

  let remaining = qty;
  for (const alloc of line.allocations) {
    if (remaining <= 0) break;
    const outstanding = alloc.dispatchedMm - alloc.receivedMm;
    if (outstanding <= 0) continue;
    const roll = requireRoll(db, alloc.rollId);
    if (!roll.transit || roll.transit.transferId !== t.id) continue;
    const take = Math.min(outstanding, remaining, roll.currentMm);

    if (take === roll.currentMm) {
      // Whole transit piece lands at the destination.
      roll.transit = null;
      roll.warehouseId = t.toWarehouseId;
      roll.bin = bin || defaultBin(db, t.toWarehouseId, roll.skuId);
      recordMovement(db, {
        type: 'transfer_in',
        ref: t.id,
        warehouseId: t.toWarehouseId,
        skuId: roll.skuId,
        rollId: roll.id,
        qtyMm: take,
        beforeMm: 0,
        afterMm: take,
        unitCost: roll.costPerM,
        value: Math.round((take / MM_PER_M) * roll.costPerM),
        user,
        note: note || `Diterima dari ${t.fromWarehouseId}`,
      });
    } else {
      // Partial receipt: split the transit piece; remainder stays in transit.
      const before = roll.currentMm;
      roll.currentMm = before - take;
      const landed = createRoll(db, {
        skuId: roll.skuId,
        lot: roll.lot,
        receivedAt: date,
        receiptRef: t.id,
        originalMm: take,
        currentMm: take,
        warehouseId: t.toWarehouseId,
        bin: bin || defaultBin(db, t.toWarehouseId, roll.skuId),
        status: 'available',
        condition: roll.condition,
        costPerM: roll.costPerM,
        parentRollId: roll.id,
        rootRollId: roll.rootRollId || roll.id,
        user,
      });
      recordMovement(db, {
        type: 'transfer_in',
        ref: t.id,
        warehouseId: t.toWarehouseId,
        skuId: roll.skuId,
        rollId: landed.id,
        parentRollId: roll.id,
        qtyMm: take,
        beforeMm: before,
        afterMm: roll.currentMm,
        unitCost: roll.costPerM,
        value: Math.round((take / MM_PER_M) * roll.costPerM),
        user,
        note: note || `Diterima sebagian dari ${t.fromWarehouseId}; sisa ${(before - take) / MM_PER_M} m masih transit`,
      });
    }

    alloc.receivedMm += take;
    line.receivedMm += take;
    remaining -= take;
  }

  assert(remaining === 0, 'ALLOCATION_MISMATCH', 'Barang transit tidak konsisten dengan alokasi pengiriman.');

  const allReceived = t.lines.every((l) => l.receivedMm >= l.requestedMm);
  const anyReceived = t.lines.some((l) => l.receivedMm > 0);
  t.status = allReceived ? 'received' : anyReceived ? 'partially_received' : 'dispatched';
  if (allReceived) t.receivedAt = isoNow();
  t.history.push({ at: isoNow(), by: user?.name, action: `Terima ${qty / MM_PER_M} m`, note: note || '' });
  audit(db, user, 'terima_transfer', 'transfer', t.id, `${line.skuId} ${qty / MM_PER_M} m`);
  return t;
}

function defaultBin(db, warehouseId, skuId) {
  const wh = byId(db.warehouses, warehouseId);
  const prefix = wh?.binPrefix ?? 'A';
  const count = db.rolls.filter((r) => r.warehouseId === warehouseId && r.skuId === skuId).length + 1;
  return `${prefix}-${String(count).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

export function transfersByStatus(db, status) {
  return db.transfers.filter((t) => t.status === status);
}

export function pendingApprovals(db) {
  return db.transfers.filter((t) => t.status === 'submitted');
}

export function lateTransfers(db, today = todayJakarta()) {
  return db.transfers.filter(
    (t) => ['approved', 'dispatched', 'partially_received'].includes(t.status) && t.neededBy < today,
  );
}

export function transitRollsFor(db, transferId) {
  return db.rolls.filter((r) => r.transit?.transferId === transferId);
}

export function transferQuantityCheck(db, transferId) {
  const t = requireTransfer(db, transferId);
  const transit = transitRollsFor(db, transferId).reduce((acc, r) => acc + r.currentMm, 0);
  const totals = transferTotals(t);
  return {
    totals,
    transitMm: transit,
    consistent: transit === totals.inTransitMm,
    ageDays: daysBetween(t.createdDate, todayJakarta()),
  };
}

export function eligibleRolls(db, transferId, line) {
  const t = requireTransfer(db, transferId);
  return db.rolls
    .filter((r) => r.skuId === line.skuId && r.warehouseId === t.fromWarehouseId && !r.transit && availableMm(r) > 0)
    .sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)) || a.id.localeCompare(b.id));
}
