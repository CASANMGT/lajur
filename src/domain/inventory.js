/**
 * Inventory: physical rolls, availability, splits, parts, movements.
 *
 * Invariants enforced here:
 *  - quantity never goes negative;
 *  - available = physical - reserved, and cuts may never consume reserved metres;
 *  - a split conserves length (parent + child === before);
 *  - in-transit stock is never counted as stock at a warehouse;
 *  - metres and pieces never share an arithmetic total.
 */

import {
  DomainError, MM_PER_M, assert, audit, byId, isoNow, nextId, todayJakarta,
} from './core.js';

export const ROLL_STATUS = {
  available: { label: 'Tersedia', tone: 'ok' },
  quarantine: { label: 'Karantina', tone: 'warn' },
  sold: { label: 'Terjual', tone: 'muted' },
  consumed: { label: 'Terpakai', tone: 'muted' },
  void: { label: 'Dibatalkan', tone: 'danger' },
};

export const isPhysical = (r) => !r.transit && (r.status === 'available' || r.status === 'quarantine');
export const isSellable = (r) => !r.transit && r.status === 'available';
export const availableMm = (r) => (isSellable(r) ? Math.max(0, r.currentMm - (r.reservedMm || 0)) : 0);
export const physicalMm = (r) => (isPhysical(r) ? r.currentMm : 0);

export function getRoll(db, rollId) {
  return db.rolls.find((r) => r.id === rollId) ?? null;
}

export function requireRoll(db, rollId) {
  const roll = getRoll(db, rollId);
  if (!roll) throw new DomainError('ROLL_NOT_FOUND', `Roll ${rollId} tidak ditemukan.`);
  return roll;
}

/* -------------------------------------------------------------------------- */
/* Warehouse freeze (stock opname)                                            */
/* -------------------------------------------------------------------------- */

export function activeOpname(db, warehouseId) {
  return db.opnameSessions.find(
    (s) => s.warehouseId === warehouseId && (s.status === 'counting' || s.status === 'review'),
  ) ?? null;
}

export function assertWarehouseOpen(db, warehouseId, action = 'transaksi') {
  const session = activeOpname(db, warehouseId);
  if (session) {
    throw new DomainError(
      'WAREHOUSE_FROZEN',
      `Gudang dibekukan oleh opname ${session.id} (${session.status === 'counting' ? 'penghitungan' : 'review'}). ${action} diblokir.`,
      { opnameId: session.id },
    );
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* Summaries                                                                  */
/* -------------------------------------------------------------------------- */

export function summarizeRolls(rolls) {
  let physical = 0;
  let available = 0;
  let reserved = 0;
  let quarantine = 0;
  let incoming = 0;
  let outgoing = 0;
  let count = 0;

  for (const r of rolls) {
    if (r.transit) {
      if (r.transit.toWarehouseId) incoming += r.currentMm;
      if (r.transit.fromWarehouseId) outgoing += r.currentMm;
      continue;
    }
    if (r.status === 'available') {
      count += 1;
      physical += r.currentMm;
      available += availableMm(r);
      reserved += r.reservedMm || 0;
    } else if (r.status === 'quarantine') {
      count += 1;
      physical += r.currentMm;
      quarantine += r.currentMm;
    }
  }

  return {
    count,
    physicalMm: physical,
    availableMm: available,
    reservedMm: reserved,
    quarantineMm: quarantine,
    incomingMm: incoming,
    outgoingMm: outgoing,
    inTransitMm: incoming,
  };
}

export function stockSummary(db, { warehouseId = null, skuId = null } = {}) {
  const rolls = db.rolls.filter(
    (r) =>
      (!skuId || r.skuId === skuId) &&
      (!warehouseId ||
        r.warehouseId === warehouseId ||
        r.transit?.toWarehouseId === warehouseId ||
        r.transit?.fromWarehouseId === warehouseId),
  );
  return summarizeRolls(rolls);
}

export function warehouseStock(db, warehouseId) {
  return stockSummary(db, { warehouseId });
}

export function skuStockByWarehouse(db, skuId) {
  const map = new Map();
  for (const wh of db.warehouses) {
    const s = stockSummary(db, { warehouseId: wh.id, skuId });
    if (s.physicalMm || s.inTransitMm) map.set(wh.id, s);
  }
  return map;
}

export function rollsAt(db, warehouseId, { skuId = null, includeReserved = true } = {}) {
  return db.rolls
    .filter((r) => r.warehouseId === warehouseId && !r.transit)
    .filter((r) => (skuId ? r.skuId === skuId : true))
    .filter((r) => (includeReserved ? true : availableMm(r) > 0))
    .filter((r) => r.status === 'available' || r.status === 'quarantine')
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function sellableRolls(db, skuId, warehouseId) {
  return db.rolls
    .filter((r) => r.skuId === skuId && r.warehouseId === warehouseId && availableMm(r) > 0)
    .sort((a, b) => {
      // Whole untouched rolls first, then by receipt date (FIFO).
      const untouched = Number(a.currentMm !== a.originalMm) - Number(b.currentMm !== b.originalMm);
      if (untouched !== 0) return untouched;
      return String(a.receivedAt).localeCompare(String(b.receivedAt)) || a.id.localeCompare(b.id);
    });
}

/* -------------------------------------------------------------------------- */
/* Part stock                                                                 */
/* -------------------------------------------------------------------------- */

export function partStockRow(db, partId, warehouseId) {
  return db.partStock.find((p) => p.partId === partId && p.warehouseId === warehouseId) ?? null;
}

export function partQty(db, partId, warehouseId) {
  const row = partStockRow(db, partId, warehouseId);
  return row ? row.qty : 0;
}

export function partAvailable(db, partId, warehouseId) {
  const row = partStockRow(db, partId, warehouseId);
  return row ? Math.max(0, row.qty - (row.reserved || 0)) : 0;
}

function ensurePartRow(db, partId, warehouseId) {
  let row = partStockRow(db, partId, warehouseId);
  if (!row) {
    row = { partId, warehouseId, qty: 0, reserved: 0 };
    db.partStock.push(row);
  }
  return row;
}

export function totalParts(db, warehouseId = null) {
  const rows = db.partStock.filter((p) => !warehouseId || p.warehouseId === warehouseId);
  return rows.reduce((acc, p) => acc + p.qty, 0);
}

/* -------------------------------------------------------------------------- */
/* Movements                                                                  */
/* -------------------------------------------------------------------------- */

export function recordMovement(db, data) {
  const mv = {
    id: `MV-${String(db.movements.length + 1).padStart(5, '0')}`,
    at: isoNow(),
    date: data.date ?? todayJakarta(),
    type: data.type,
    ref: data.ref ?? '',
    warehouseId: data.warehouseId ?? null,
    warehouseToId: data.warehouseToId ?? null,
    skuId: data.skuId ?? null,
    partId: data.partId ?? null,
    rollId: data.rollId ?? null,
    parentRollId: data.parentRollId ?? null,
    qtyMm: data.qtyMm ?? null,
    qtyPcs: data.qtyPcs ?? null,
    beforeMm: data.beforeMm ?? null,
    afterMm: data.afterMm ?? null,
    beforePcs: data.beforePcs ?? null,
    afterPcs: data.afterPcs ?? null,
    unitCost: data.unitCost ?? null,
    value: data.value ?? null,
    userId: data.user?.id ?? 'system',
    userName: data.user?.name ?? 'Sistem',
    role: data.user?.role ?? 'system',
    note: data.note ?? '',
  };
  db.movements.unshift(mv);
  return mv;
}

export function rollTrail(db, rollId) {
  const roll = getRoll(db, rollId);
  const lineage = [];
  if (roll?.parentRollId) lineage.push(roll.parentRollId);
  if (roll?.rootRollId && roll.rootRollId !== roll.id) lineage.push(roll.rootRollId);
  const related = new Set([rollId, ...lineage].filter(Boolean));
  db.movements.forEach((m) => {
    if (m.rollId === rollId || m.parentRollId === rollId || (m.rollId && related.has(m.rollId))) {
      related.add(m.rollId);
    }
  });
  return db.movements
    .filter((m) => m.rollId === rollId || m.parentRollId === rollId || related.has(m.parentRollId))
    .slice(0, 60);
}

export function rollChildren(db, rollId) {
  return db.rolls.filter((r) => r.parentRollId === rollId || r.rootRollId === rollId && r.id !== rollId);
}

/* -------------------------------------------------------------------------- */
/* Creation and splits                                                        */
/* -------------------------------------------------------------------------- */

export function createRoll(db, input) {
  const sku = byId(db.skus, input.skuId);
  assert(sku, 'SKU_NOT_FOUND', `SKU ${input.skuId} tidak ditemukan.`);
  assert(input.currentMm > 0, 'INVALID_LENGTH', 'Panjang roll harus lebih dari 0 m.');
  const id = input.id ?? nextId(db, 'roll', 'RL');
  const roll = {
    id,
    skuId: input.skuId,
    lot: input.lot || 'TANPA-LOT',
    receivedAt: input.receivedAt ?? todayJakarta(),
    receiptRef: input.receiptRef ?? '',
    originalMm: input.originalMm ?? input.currentMm,
    currentMm: input.currentMm,
    reservedMm: 0,
    warehouseId: input.warehouseId ?? null,
    bin: input.bin ?? '',
    status: input.status ?? 'available',
    condition: input.condition ?? 'good',
    costPerM: input.costPerM ?? sku.buyPrice ?? 0,
    transit: input.transit ?? null,
    parentRollId: input.parentRollId ?? null,
    rootRollId: input.rootRollId ?? input.parentRollId ?? id,
    reservations: [],
    notes: input.notes ?? '',
    createdBy: input.user?.id ?? 'system',
    createdAt: isoNow(),
  };
  db.rolls.push(roll);
  return roll;
}

/**
 * Cut `qtyMm` from a roll. The cut piece becomes its own identified roll
 * (`parentRollId` points at the source), so every metre stays traceable.
 */
export function splitRoll(db, { rollId, qtyMm, user, ref = '', reason = '', pieceStatus = 'available', warehouseId, transit = null, note = '' }) {
  const roll = requireRoll(db, rollId);
  const qty = Math.round(Number(qtyMm));
  assert(Number.isFinite(qty) && qty > 0, 'INVALID_LENGTH', 'Panjang potong harus lebih dari 0 m.');
  if (!roll.transit && roll.warehouseId) assertWarehouseOpen(db, roll.warehouseId, 'Pemotongan roll');
  assert(isSellable(roll) || (roll.status === 'quarantine' && pieceStatus === 'quarantine'), 'ROLL_NOT_AVAILABLE', `Roll ${roll.id} tidak dapat dipotong (${ROLL_STATUS[roll.status]?.label ?? roll.status}).`);
  assert(roll.currentMm >= qty, 'CUT_EXCEEDS_ROLL', `Potongan ${qty / MM_PER_M} m melebihi panjang roll ${roll.currentMm / MM_PER_M} m.`);
  assert(availableMm(roll) >= qty, 'CUT_RESERVED', `Potongan melebihi stok tersedia. ${(roll.reservedMm || 0) / MM_PER_M} m pada roll ini terpesan.`);

  const before = roll.currentMm;
  roll.currentMm = before - qty;

  const piece = createRoll(db, {
    skuId: roll.skuId,
    lot: roll.lot,
    receivedAt: roll.receivedAt,
    receiptRef: roll.receiptRef,
    originalMm: qty,
    currentMm: qty,
    warehouseId: warehouseId ?? roll.warehouseId,
    bin: roll.bin,
    status: pieceStatus,
    condition: roll.condition,
    costPerM: roll.costPerM,
    transit,
    parentRollId: roll.id,
    rootRollId: roll.rootRollId || roll.id,
    notes: note,
    user,
  });

  recordMovement(db, {
    type: 'cut',
    ref,
    warehouseId: roll.warehouseId,
    skuId: roll.skuId,
    rollId: roll.id,
    parentRollId: piece.id,
    qtyMm: qty,
    beforeMm: before,
    afterMm: roll.currentMm,
    unitCost: roll.costPerM,
    value: Math.round((qty / MM_PER_M) * roll.costPerM),
    user,
    note: reason || `Potong ${qty / MM_PER_M} m → ${piece.id}`,
  });

  audit(db, user, 'potong_roll', 'roll', roll.id, `${qty / MM_PER_M} m → ${piece.id}; sisa ${roll.currentMm / MM_PER_M} m`);
  return { roll, piece };
}

/** Sell an untouched (or complete remaining) roll without splitting it. */
export function sellWholeRoll(db, { rollId, user, ref, invoiceId, note = '' }) {
  const roll = requireRoll(db, rollId);
  assert(isSellable(roll), 'ROLL_NOT_AVAILABLE', `Roll ${roll.id} tidak tersedia untuk dijual.`);
  assert((roll.reservedMm || 0) === 0, 'ROLL_RESERVED', `Roll ${roll.id} memiliki ${roll.reservedMm / MM_PER_M} m terpesan dan tidak bisa dijual utuh.`);
  assert(roll.currentMm > 0, 'ROLL_EMPTY', 'Roll sudah habis.');

  const before = roll.currentMm;
  roll.status = 'sold';
  roll.soldAt = isoNow();
  roll.soldRef = ref;

  recordMovement(db, {
    type: 'sale_whole',
    ref,
    warehouseId: roll.warehouseId,
    skuId: roll.skuId,
    rollId: roll.id,
    qtyMm: before,
    beforeMm: before,
    afterMm: 0,
    unitCost: roll.costPerM,
    value: Math.round((before / MM_PER_M) * roll.costPerM),
    user,
    note: note || `Roll utuh terjual (${invoiceId ?? ref})`,
  });
  audit(db, user, 'jual_roll_utuh', 'roll', roll.id, `${before / MM_PER_M} m (${invoiceId ?? ref})`);
  return roll;
}

export function markRollConsumed(db, { rollId, user, ref, note = '' }) {
  const roll = requireRoll(db, rollId);
  roll.status = 'consumed';
  recordMovement(db, {
    type: 'consume',
    ref,
    warehouseId: roll.warehouseId,
    skuId: roll.skuId,
    rollId: roll.id,
    qtyMm: roll.currentMm,
    beforeMm: roll.currentMm,
    afterMm: 0,
    unitCost: roll.costPerM,
    user,
    note,
  });
  return roll;
}

export function quarantineRoll(db, { rollId, user, reason, ref }) {
  const roll = requireRoll(db, rollId);
  assert(!roll.transit, 'ROLL_IN_TRANSIT', 'Roll dalam perjalanan tidak dapat dikarantina.');
  if (roll.warehouseId) assertWarehouseOpen(db, roll.warehouseId, 'Karantina');
  const before = roll.status;
  roll.status = 'quarantine';
  roll.condition = 'damaged';
  recordMovement(db, {
    type: 'quarantine', ref, warehouseId: roll.warehouseId, skuId: roll.skuId, rollId: roll.id,
    qtyMm: roll.currentMm, unitCost: roll.costPerM, user, note: reason,
  });
  audit(db, user, 'karantina', 'roll', roll.id, `${before} → quarantine: ${reason}`);
  return roll;
}

/* -------------------------------------------------------------------------- */
/* Receiving fabric                                                           */
/* -------------------------------------------------------------------------- */

export function receiveFabricRolls(db, { skuId, warehouseId, lot, receivedAt, receiptRef, lengthsMm, costPerM, binPrefix = '', user, condition = 'good' }) {
  assertWarehouseOpen(db, warehouseId, 'Penerimaan barang');
  const sku = byId(db.skus, skuId);
  assert(sku, 'SKU_NOT_FOUND', 'SKU kain tidak ditemukan.');
  assert(Array.isArray(lengthsMm) && lengthsMm.length > 0, 'EMPTY_RECEIPT', 'Minimal satu roll harus dicatat.');
  const created = [];
  lengthsMm.forEach((len, idx) => {
    assert(Number.isFinite(len) && len > 0, 'INVALID_LENGTH', `Panjang roll ke-${idx + 1} tidak valid.`);
    const roll = createRoll(db, {
      skuId,
      lot,
      receivedAt,
      receiptRef,
      originalMm: len,
      currentMm: len,
      warehouseId,
      bin: `${binPrefix || whBinPrefix(db, warehouseId)}-${String(idx + 1).padStart(2, '0')}`,
      status: 'available',
      condition,
      costPerM: costPerM ?? sku.buyPrice,
      user,
    });
    recordMovement(db, {
      type: 'receive',
      ref: receiptRef,
      warehouseId,
      skuId,
      rollId: roll.id,
      qtyMm: len,
      beforeMm: 0,
      afterMm: len,
      unitCost: roll.costPerM,
      value: Math.round((len / MM_PER_M) * roll.costPerM),
      user,
      note: `Penerimaan lot ${lot}`,
    });
    created.push(roll);
  });
  audit(db, user, 'terima_roll', 'roll', created.map((r) => r.id).join(','), `${created.length} roll / ${lengthsMm.reduce((a, b) => a + b, 0) / MM_PER_M} m`);
  return created;
}

export function receiveParts(db, { partId, warehouseId, qty, user, ref = '', unitCost = null }) {  assertWarehouseOpen(db, warehouseId, 'Penerimaan barang');
  const part = byId(db.parts, partId);
  assert(part, 'PART_NOT_FOUND', 'Spare part tidak ditemukan.');
  const n = Math.round(Number(qty));
  assert(Number.isFinite(n) && n > 0, 'INVALID_QTY', 'Jumlah barang harus bilangan bulat lebih dari 0.');
  const row = ensurePartRow(db, partId, warehouseId);
  const before = row.qty;
  row.qty += n;
  recordMovement(db, {
    type: 'receive',
    ref,
    warehouseId,
    partId,
    qtyPcs: n,
    beforePcs: before,
    afterPcs: row.qty,
    unitCost: unitCost ?? part.buyPrice,
    value: n * (unitCost ?? part.buyPrice),
    user,
    note: 'Penerimaan spare part',
  });
  return row;
}

export function issueParts(db, { partId, warehouseId, qty, user, ref = '', note = '' }) {
  assertWarehouseOpen(db, warehouseId, 'Pengeluaran barang');
  const row = partStockRow(db, partId, warehouseId);
  const n = Math.round(Number(qty));
  assert(Number.isInteger(n) && n > 0, 'INVALID_QTY', 'Jumlah spare part harus bilangan bulat.');
  assert(row, 'NO_STOCK', 'Stok spare part tidak ada di gudang ini.');
  assert(row.qty - (row.reserved || 0) >= n, 'INSUFFICIENT_PART', `Stok tersedia hanya ${row.qty - (row.reserved || 0)} pcs.`);
  const before = row.qty;
  row.qty -= n;
  recordMovement(db, {
    type: 'issue_part',
    ref,
    warehouseId,
    partId,
    qtyPcs: n,
    beforePcs: before,
    afterPcs: row.qty,
    unitCost: byId(db.parts, partId)?.buyPrice ?? 0,
    user,
    note,
  });
  return row;
}

/**
 * Direct stock intake without a PO (opening balance, correction, consignment).
 * It still creates a receipt document with a unique reference, individual roll
 * IDs, lot, cost and movements, so no stock appears without a trace.
 */
export function receiveAdhocStock(db, {
  warehouseId, ref, date = todayJakarta(), kind = 'fabric', skuId, partId,
  lot, lengthsMm = [], qtyPcs = 0, unitCost = 0, reason, user,
}) {
  const wh = byId(db.warehouses, warehouseId);
  assert(wh, 'WAREHOUSE_NOT_FOUND', 'Gudang tidak ditemukan.');
  assert(wh.active !== false, 'WAREHOUSE_INACTIVE', 'Gudang nonaktif tidak dapat menerima stok.');
  assertWarehouseOpen(db, warehouseId, 'Penerimaan stok');

  const cleanRef = String(ref ?? '').trim();
  assert(cleanRef.length >= 3, 'REF_REQUIRED', 'Nomor dokumen wajib diisi (minimal 3 karakter).');
  const duplicate = db.goodsReceipts.find((r) => r.ref.toLowerCase() === cleanRef.toLowerCase());
  assert(!duplicate, 'DUPLICATE_RECEIPT', `Nomor ${cleanRef} sudah dipakai (${duplicate?.id ?? ''}).`);
  assert(reason && reason.trim().length >= 3, 'REASON_REQUIRED', 'Alasan penerimaan wajib diisi.');

  const lines = [];
  let rolls = [];
  let total = 0;

  if (kind === 'fabric') {
    const sku = byId(db.skus, skuId);
    assert(sku, 'SKU_NOT_FOUND', 'SKU kain tidak ditemukan.');
    assert(sku.active !== false && !sku.dormant, 'DORMANT_PRODUCT', 'SKU nonaktif tidak dapat menerima stok baru.');
    const lengths = (lengthsMm ?? []).map((x) => Math.round(Number(x))).filter((x) => x > 0);
    assert(lengths.length > 0, 'EMPTY_RECEIPT', 'Minimal satu panjang roll harus diisi.');
    const cost = Math.max(0, Math.round(Number(unitCost) || 0)) || sku.buyPrice;
    const lotCode = String(lot ?? '').trim() || `ADH-${date.replaceAll('-', '')}`;

    rolls = lengths.map((len, idx) => {
      const roll = createRoll(db, {
        skuId: sku.id,
        lot: lotCode,
        receivedAt: date,
        receiptRef: cleanRef,
        originalMm: len,
        currentMm: len,
        warehouseId,
        bin: `${wh.binPrefix}-AD${String(idx + 1).padStart(2, '0')}`,
        costPerM: cost,
        user,
        notes: reason.trim(),
      });
      recordMovement(db, {
        type: 'adhoc_receive',
        ref: cleanRef,
        date,
        warehouseId,
        skuId: sku.id,
        rollId: roll.id,
        qtyMm: len,
        beforeMm: 0,
        afterMm: len,
        unitCost: cost,
        value: Math.round((len / MM_PER_M) * cost),
        user,
        note: reason.trim(),
      });
      return roll;
    });
    const qtyMm = lengths.reduce((a, b) => a + b, 0);
    total = Math.round((qtyMm / MM_PER_M) * cost);
    lines.push({
      kind: 'fabric',
      skuId: sku.id,
      description: `${sku.collectionName} — ${sku.colourName || sku.colourCode} (${sku.code})`,
      lot: lotCode,
      lengthsMm: lengths,
      rollIds: rolls.map((r) => r.id),
      qtyMm,
      unitCost: cost,
    });
  } else if (kind === 'part') {
    const part = byId(db.parts, partId);
    assert(part, 'PART_NOT_FOUND', 'Spare part tidak ditemukan.');
    const qty = Math.round(Number(qtyPcs));
    assert(Number.isInteger(qty) && qty > 0, 'INVALID_QTY', 'Jumlah part harus bilangan bulat lebih dari 0.');
    const cost = Math.max(0, Math.round(Number(unitCost) || 0)) || part.buyPrice;
    receiveParts(db, { partId: part.id, warehouseId, qty, user, ref: cleanRef, unitCost: cost });
    total = qty * cost;
    lines.push({
      kind: 'part',
      partId: part.id,
      description: part.name,
      qtyPcs: qty,
      unitCost: cost,
    });
  } else {
    throw new DomainError('INVALID_KIND', 'Jenis penerimaan tidak dikenal.');
  }

  const receipt = {
    id: nextId(db, 'goodsReceipt', 'GR', 4),
    ref: cleanRef,
    kind: 'adhoc',
    poId: null,
    supplierId: null,
    date,
    warehouseId,
    lines,
    total,
    note: reason.trim(),
    supplierInvoiceId: null,
    createdAt: isoNow(),
    createdBy: user?.name ?? 'Sistem',
  };
  db.goodsReceipts.unshift(receipt);
  audit(db, user, 'terima_stok_langsung', 'goodsReceipt', receipt.id, `${cleanRef} · ${lines.length} baris · ${total}`);
  return { receipt, rolls };
}

export function whBinPrefix(db, warehouseId) {
  const wh = byId(db.warehouses, warehouseId);
  return wh?.binPrefix ?? 'A';
}

/* -------------------------------------------------------------------------- */
/* Reservations                                                               */
/* -------------------------------------------------------------------------- */

export function reserveRoll(db, { rollId, qtyMm, ref, user, note = '' }) {  const roll = requireRoll(db, rollId);
  const qty = Math.round(qtyMm);
  assert(qty > 0, 'INVALID_LENGTH', 'Jumlah reservasi harus lebih dari 0 m.');
  assert(availableMm(roll) >= qty, 'INSUFFICIENT_AVAILABLE', `Tersedia hanya ${availableMm(roll) / MM_PER_M} m pada ${roll.id}.`);
  roll.reservedMm = (roll.reservedMm || 0) + qty;
  roll.reservations = roll.reservations || [];
  roll.reservations.push({ ref, qtyMm: qty, at: isoNow(), by: user?.id ?? 'system', note });
  recordMovement(db, {
    type: 'reserve', ref, warehouseId: roll.warehouseId, skuId: roll.skuId, rollId: roll.id,
    qtyMm: qty, unitCost: roll.costPerM, user, note: note || `Reservasi ${qty / MM_PER_M} m`,
  });
  return roll;
}

export function partReservedFor(row, ref) {
  if (!row || !ref) return 0;
  return (row.reservations ?? []).filter((r) => r.ref === ref).reduce((acc, r) => acc + r.qty, 0);
}

export function reservePart(db, { partId, warehouseId, qty, ref, user, note = '' }) {
  const row = partStockRow(db, partId, warehouseId);
  const n = Math.round(Number(qty));
  assert(n > 0, 'INVALID_QTY', 'Jumlah reservasi part harus lebih dari 0.');
  assert(row, 'NO_STOCK', 'Stok part tidak ada di gudang ini.');
  assert(row.qty - (row.reserved || 0) >= n, 'INSUFFICIENT_PART', `Tersedia ${row.qty - (row.reserved || 0)} pcs.`);
  row.reserved = (row.reserved || 0) + n;
  row.reservations = row.reservations ?? [];
  row.reservations.push({ ref, qty: n, at: isoNow(), by: user?.id ?? 'system', note });
  recordMovement(db, {
    type: 'reserve_part', ref, warehouseId, partId, qtyPcs: n, unitCost: byId(db.parts, partId)?.buyPrice ?? 0,
    user, note: note || `Reservasi ${n} pcs`,
  });
  return row;
}

export function consumePartReservation(row, ref, qty) {
  if (!row || !ref) return;
  let remaining = Math.round(Number(qty));
  for (const res of row.reservations ?? []) {
    if (res.ref !== ref || remaining <= 0) continue;
    const take = Math.min(res.qty, remaining);
    res.qty -= take;
    remaining -= take;
  }
  row.reservations = (row.reservations ?? []).filter((r) => r.qty > 0);
  row.reserved = Math.max(0, (row.reserved || 0) - Math.round(Number(qty)));
}

export function releasePartReservation(db, { partId, warehouseId, ref, user, note = '' }) {
  const row = partStockRow(db, partId, warehouseId);
  const qty = partReservedFor(row, ref);
  if (!row || !qty) return row;
  row.reserved = Math.max(0, (row.reserved || 0) - qty);
  row.reservations = (row.reservations ?? []).filter((r) => r.ref !== ref);
  recordMovement(db, {
    type: 'release_part', ref, warehouseId, partId, qtyPcs: qty, user,
    note: note || `Reservasi part dilepas ${qty} pcs`,
  });
  return row;
}

export function releaseReservation(db, { rollId, ref, user, note = '' }) {
  const roll = requireRoll(db, rollId);
  const active = (roll.reservations || []).filter((r) => r.ref === ref);
  const qty = active.reduce((acc, r) => acc + r.qtyMm, 0);
  if (!qty) return roll;
  roll.reservedMm = Math.max(0, (roll.reservedMm || 0) - qty);
  roll.reservations = (roll.reservations || []).filter((r) => r.ref !== ref);
  recordMovement(db, {
    type: 'release', ref, warehouseId: roll.warehouseId, skuId: roll.skuId, rollId: roll.id,
    qtyMm: qty, user, note: note || `Reservasi dilepas ${qty / MM_PER_M} m`,
  });
  return roll;
}

export function releaseAllReservations(db, ref, user, note = '') {
  const rolls = db.rolls.filter((r) => (r.reservations || []).some((x) => x.ref === ref));
  for (const roll of rolls) releaseReservation(db, { rollId: roll.id, ref, user, note });
  return rolls.length;
}

/** Consume a reservation when the reserved metres are actually issued. */
export function consumeReservation(roll, ref, qtyMm) {
  const active = (roll.reservations || []).filter((r) => r.ref === ref);
  let remaining = qtyMm;
  for (const res of active) {
    if (remaining <= 0) break;
    const take = Math.min(res.qtyMm, remaining);
    res.qtyMm -= take;
    remaining -= take;
  }
  roll.reservations = (roll.reservations || []).filter((r) => r.qtyMm > 0);
  roll.reservedMm = Math.max(0, (roll.reservedMm || 0) - Math.min(qtyMm, roll.reservedMm || 0));
}

export function binPrefixFor(db, warehouseId) {
  return whBinPrefix(db, warehouseId);
}
