/**
 * WIP production orders: cutting → sewing → QC per piece, with payroll entries
 * and work-centre capacity load.
 *
 * Cutting consumes raw fabric into WIP pieces. A piece keeps its source roll,
 * lot and code until QC. Production never creates a sales invoice; invoicing
 * remains a separate commercial event.
 */

import {
  DomainError, MM_PER_M, assert, audit, byId, isoNow, money, nextId, todayJakarta,
} from './core.js';
import { availableMm, consumeReservation, recordMovement, requireRoll, reserveRoll, releaseAllReservations } from './inventory.js';

export const STAGE = {
  cutting: { label: 'Potong', tone: 'info', seq: 1 },
  sewing: { label: 'Jahit', tone: 'copper', seq: 2 },
  qc: { label: 'QC', tone: 'warn', seq: 3 },
  done: { label: 'Selesai', tone: 'ok', seq: 4 },
  rejected: { label: 'Ditolak QC', tone: 'danger', seq: 4 },
};

export const ORDER_STATUS = {
  draft: { label: 'Draf', tone: 'muted' },
  released: { label: 'Siap produksi', tone: 'info' },
  in_progress: { label: 'Berjalan', tone: 'copper' },
  qc: { label: 'Menunggu QC', tone: 'warn' },
  done: { label: 'Selesai', tone: 'ok' },
  cancelled: { label: 'Dibatalkan', tone: 'danger' },
};

export const FLOW = ['cutting', 'sewing', 'qc', 'done'];

export function getOrder(db, id) {
  return db.productionOrders.find((o) => o.id === id) ?? null;
}

export function requireOrder(db, id) {
  const order = getOrder(db, id);
  if (!order) throw new DomainError('PRODUCTION_NOT_FOUND', 'Order produksi tidak ditemukan.');
  return order;
}

export function workCenter(db, stage) {
  return db.workCenters.find((w) => w.stage === stage) ?? null;
}

export function createProductionOrder(db, {
  customerId = null, projectId = null, salesOrderId = null, warehouseId,
  targetDate, lines, notes = '', user,
}) {
  const wh = byId(db.warehouses, warehouseId);
  assert(wh, 'WAREHOUSE_NOT_FOUND', 'Gudang produksi tidak ditemukan.');
  assert(wh.active !== false, 'WAREHOUSE_INACTIVE', 'Gudang nonaktif.');
  assert(Array.isArray(lines) && lines.length > 0, 'EMPTY_LINES', 'Order produksi harus memiliki minimal satu baris.');
  const id = nextId(db, 'productionOrder', 'WO', 4);
  const built = lines.map((line) => {
    const roll = requireRoll(db, line.rollId);
    const qty = Math.round(Number(line.qtyMm));
    assert(qty > 0, 'INVALID_LENGTH', 'Jumlah kain harus lebih dari 0 m.');
    assert(roll.warehouseId === warehouseId && !roll.transit && roll.status === 'available', 'ROLL_LOCATION', 'Roll harus tersedia di gudang produksi.');
    assert(qty <= availableMm(roll), 'INSUFFICIENT_AVAILABLE', `Tersedia ${availableMm(roll) / MM_PER_M} m pada ${roll.id}.`);
    const pieceLength = Math.round(Number(line.pieceLengthMm) || 2400);
    assert(pieceLength > 0 && pieceLength <= qty, 'INVALID_PIECE', 'Panjang per piece harus antara 1 mm dan total.');
    const sku = byId(db.skus, roll.skuId);
    return {
      id: nextId(db, 'productionLine', 'WL', 5),
      skuId: roll.skuId,
      rollId: roll.id,
      lot: roll.lot,
      description: `${sku.collectionName} — ${sku.colourName || sku.colourCode}`,
      qtyMm: qty,
      pieceLengthMm: pieceLength,
      cut: false,
      pieceIds: [],
    };
  });

  for (const line of built) {
    reserveRoll(db, { rollId: line.rollId, qtyMm: line.qtyMm, ref: id, user, note: `Produksi ${id}` });
  }

  const order = {
    id,
    customerId,
    projectId,
    salesOrderId,
    warehouseId,
    status: 'draft',
    targetDate: targetDate || todayJakarta(),
    lines: built,
    notes,
    createdAt: isoNow(),
    createdBy: user?.name ?? 'Sistem',
    history: [{ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Order produksi dibuat' }],
  };
  db.productionOrders.unshift(order);
  audit(db, user, 'buat_produksi', 'production', order.id, `${built.length} baris`);
  return order;
}

export function releaseOrder(db, { id, user }) {
  const order = requireOrder(db, id);
  assert(order.status === 'draft', 'INVALID_STATUS', 'Hanya draf yang dapat dirilis.');
  order.status = 'released';
  order.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Dirilis ke lantai produksi' });
  audit(db, user, 'rilis_produksi', 'production', order.id, '');
  return order;
}

export function cutOrder(db, { id, user }) {
  const order = requireOrder(db, id);
  assert(['draft', 'released'].includes(order.status), 'INVALID_STATUS', 'Produksi sudah dipotong.');
  assert(!order.lines.some((l) => l.cut), 'ALREADY_CUT', 'Kain sudah dipotong.');
  const wc = workCenter(db, 'cutting');
  const today = todayJakarta();
  for (const line of order.lines) {
    const roll = requireRoll(db, line.rollId);
    const before = roll.currentMm;
    consumeReservation(roll, order.id, line.qtyMm);
    roll.currentMm = before - line.qtyMm;
    let remaining = line.qtyMm;
    let index = 1;
    while (remaining > 0) {
      const qty = Math.min(line.pieceLengthMm, remaining);
      const piece = {
        id: nextId(db, 'piece', 'PC', 4),
        orderId: order.id,
        lineId: line.id,
        skuId: line.skuId,
        rollId: line.rollId,
        lot: line.lot,
        qtyMm: qty,
        stage: 'cutting',
        status: 'wip',
        qcNote: '',
        workerId: user?.id ?? null,
        createdAt: isoNow(),
        operations: [{ stage: 'cutting', at: isoNow(), by: user?.name ?? 'Sistem', workerId: user?.id ?? null, rate: wc?.ratePerPiece ?? 5000, amount: wc?.ratePerPiece ?? 5000 }],
      };
      db.productionPieces.unshift(piece);
      line.pieceIds.push(piece.id);
      addPayroll(db, { piece, stage: 'cutting', workerId: user?.id ?? null, rate: wc?.ratePerPiece ?? 5000, date: today });
      remaining -= qty;
      index += 1;
    }
    line.cut = true;
    recordMovement(db, {
      type: 'production_cut',
      ref: order.id,
      warehouseId: order.warehouseId,
      skuId: line.skuId,
      rollId: roll.id,
      qtyMm: line.qtyMm,
      beforeMm: before,
      afterMm: roll.currentMm,
      unitCost: roll.costPerM,
      value: Math.round((line.qtyMm / MM_PER_M) * roll.costPerM),
      user,
      note: `${line.pieceIds.length} piece untuk ${order.id}`,
    });
  }
  order.status = 'in_progress';
  order.cutAt = isoNow();
  order.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Kain dipotong menjadi piece' });
  audit(db, user, 'potong_produksi', 'production', order.id, '');
  return order;
}

function addPayroll(db, { piece, stage, workerId, rate, date }) {
  const amount = money(rate);
  db.payrollEntries.unshift({
    id: nextId(db, 'payroll', 'PRL', 5),
    orderId: piece.orderId,
    pieceId: piece.id,
    stage,
    workerId: workerId ?? null,
    qty: 1,
    rate: amount,
    amount,
    date,
    paid: false,
    createdAt: isoNow(),
  });
}

export function sewPiece(db, { pieceId, workerId = null, user }) {
  const piece = requirePiece(db, pieceId);
  assert(piece.stage === 'cutting', 'INVALID_STAGE', 'Piece belum siap dijahit.');
  const wc = workCenter(db, 'sewing');
  const rate = wc?.ratePerPiece ?? 12000;
  piece.stage = 'sewing';
  piece.workerId = workerId ?? piece.workerId;
  piece.operations.push({ stage: 'sewing', at: isoNow(), by: user?.name ?? 'Sistem', workerId: piece.workerId, rate, amount: rate });
  addPayroll(db, { piece, stage: 'sewing', workerId: piece.workerId, rate, date: todayJakarta() });
  refreshOrderStatus(db, piece.orderId);
  audit(db, user, 'jahit_piece', 'productionPiece', piece.id, '');
  return piece;
}

export function qcPiece(db, { pieceId, pass, note = '', workerId = null, user, attachment = null }) {
  const piece = requirePiece(db, pieceId);
  assert(piece.stage === 'sewing', 'INVALID_STAGE', 'QC hanya setelah jahit.');
  const wc = workCenter(db, 'qc');
  const rate = wc?.ratePerPiece ?? 3000;
  piece.stage = pass ? 'done' : 'rejected';
  piece.status = pass ? 'done' : 'rejected';
  piece.qcNote = note;
  piece.workerId = workerId ?? piece.workerId;
  piece.operations.push({ stage: 'qc', at: isoNow(), by: user?.name ?? 'Sistem', workerId: piece.workerId, rate, amount: rate, pass: Boolean(pass), note });
  if (attachment) {
    piece.attachments = piece.attachments ?? [];
    piece.attachments.push({ ...attachment, at: isoNow(), by: user?.name ?? 'Sistem' });
  }
  addPayroll(db, { piece, stage: 'qc', workerId: piece.workerId, rate, date: todayJakarta() });
  refreshOrderStatus(db, piece.orderId);
  audit(db, user, 'qc_piece', 'productionPiece', piece.id, pass ? 'lulus' : `gagal: ${note}`);
  return piece;
}

export function reworkPiece(db, { pieceId, user }) {
  const piece = requirePiece(db, pieceId);
  assert(piece.stage === 'rejected', 'INVALID_STAGE', 'Hanya piece gagal QC yang dapat dijahit ulang.');
  piece.stage = 'sewing';
  piece.status = 'wip';
  piece.qcNote = '';
  piece.operations.push({ stage: 'sewing', at: isoNow(), by: user?.name ?? 'Sistem', workerId: piece.workerId, rate: 0, amount: 0, rework: true });
  refreshOrderStatus(db, piece.orderId);
  audit(db, user, 'rework_piece', 'productionPiece', piece.id, '');
  return piece;
}

export function requirePiece(db, id) {
  const piece = db.productionPieces.find((p) => p.id === id);
  if (!piece) throw new DomainError('PIECE_NOT_FOUND', 'Piece produksi tidak ditemukan.');
  return piece;
}

function refreshOrderStatus(db, orderId) {
  const order = requireOrder(db, orderId);
  const pieces = db.productionPieces.filter((p) => p.orderId === orderId);
  if (!pieces.length) return order;
  const done = pieces.filter((p) => p.stage === 'done').length;
  const rejected = pieces.filter((p) => p.stage === 'rejected').length;
  const waitingQc = pieces.filter((p) => p.stage === 'sewing').length;
  if (done + rejected === pieces.length) order.status = 'done';
  else if (waitingQc === 0) order.status = 'qc';
  else order.status = 'in_progress';
  return order;
}

export function cancelOrder(db, { id, user, reason = '' }) {
  const order = requireOrder(db, id);
  assert(!order.lines.some((l) => l.cut), 'ALREADY_CUT', 'Order yang sudah dipotong tidak dapat dibatalkan; gunakan alur scrap.');
  releaseAllReservations(db, order.id, user, `Batal produksi ${order.id}`);
  order.status = 'cancelled';
  order.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Dibatalkan', note: reason });
  audit(db, user, 'batalkan_produksi', 'production', order.id, reason);
  return order;
}

export function payPayroll(db, { orderId, user }) {
  const entries = db.payrollEntries.filter((p) => p.orderId === orderId && !p.paid);
  entries.forEach((p) => { p.paid = true; p.paidAt = isoNow(); });
  audit(db, user, 'bayar_payroll', 'production', orderId, `${entries.length} entri`);
  return entries.length;
}

export function orderPieces(db, orderId) {
  return db.productionPieces.filter((p) => p.orderId === orderId);
}

export function orderStats(db, order) {
  const pieces = orderPieces(db, order.id);
  const payroll = db.payrollEntries.filter((p) => p.orderId === order.id);
  const byStage = FLOW.reduce((acc, stage) => {
    acc[stage] = pieces.filter((p) => p.stage === stage).length;
    return acc;
  }, {});
  byStage.rejected = pieces.filter((p) => p.stage === 'rejected').length;
  return {
    pieces: pieces.length,
    byStage,
    done: byStage.done,
    rejected: byStage.rejected,
    payroll: payroll.reduce((a, p) => a + p.amount, 0),
    unpaid: payroll.filter((p) => !p.paid).reduce((a, p) => a + p.amount, 0),
    progress: pieces.length ? Math.round((byStage.done / pieces.length) * 100) : 0,
  };
}

export function capacityLoad(db) {
  const stages = ['cutting', 'sewing', 'qc'];
  return stages.map((stage) => {
    const wc = workCenter(db, stage);
    const capacity = wc?.capacityPerDay ?? 20;
    const load = db.productionPieces.filter((p) => {
      if (stage === 'cutting') return p.stage === 'cutting';
      if (stage === 'sewing') return p.stage === 'sewing';
      return p.stage === 'sewing';
    }).length;
    return {
      stage,
      label: STAGE[stage].label,
      capacity,
      load,
      utilPct: capacity ? Math.round((load / capacity) * 100) : 0,
      days: capacity ? Math.ceil(load / capacity) : null,
      rate: wc?.ratePerPiece ?? 0,
    };
  });
}

export function productionStats(db) {
  const active = db.productionOrders.filter((o) => !['done', 'cancelled'].includes(o.status));
  const pieces = db.productionPieces.filter((p) => p.status === 'wip');
  return {
    activeOrders: active.length,
    wipPieces: pieces.length,
    wipMm: pieces.reduce((a, p) => a + p.qtyMm, 0),
    payrollOpen: db.payrollEntries.filter((p) => !p.paid).reduce((a, p) => a + p.amount, 0),
    rejected: db.productionPieces.filter((p) => p.stage === 'rejected').length,
    done: db.productionPieces.filter((p) => p.stage === 'done').length,
    capacity: capacityLoad(db),
  };
}
