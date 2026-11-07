/**
 * Stock opname: blind counting, review, adjustment posting.
 *
 * While a session is `counting` or `review`, physical mutations in that
 * warehouse are blocked (see assertWarehouseOpen). Approval never changes stock
 * unless the count is complete and cannot push a roll below its reservations.
 */

import {
  DomainError, MM_PER_M, assert, audit, byId, isoNow, nextId, todayJakarta,
} from './core.js';
import { availableMm, recordMovement, requireRoll } from './inventory.js';

export const OPNAME_STATUS = {
  counting: { label: 'Penghitungan', tone: 'warn' },
  review: { label: 'Menunggu review', tone: 'info' },
  posted: { label: 'Diposting', tone: 'ok' },
  cancelled: { label: 'Dibatalkan', tone: 'muted' },
};

export function activeSessions(db) {
  return db.opnameSessions.filter((s) => s.status === 'counting' || s.status === 'review');
}

export function getSession(db, id) {
  return db.opnameSessions.find((s) => s.id === id) ?? null;
}

export function startOpname(db, { warehouseId, user, note = '' }) {
  const wh = byId(db.warehouses, warehouseId);
  assert(wh, 'WAREHOUSE_NOT_FOUND', 'Gudang tidak ditemukan.');
  const existing = db.opnameSessions.find(
    (s) => s.warehouseId === warehouseId && (s.status === 'counting' || s.status === 'review'),
  );
  assert(!existing, 'OPNAME_ACTIVE', `Sudah ada opname aktif di ${wh.name} (${existing?.id}).`);

  const rolls = db.rolls.filter(
    (r) => r.warehouseId === warehouseId && !r.transit && ['available', 'quarantine'].includes(r.status),
  );
  assert(rolls.length > 0, 'NO_STOCK', 'Tidak ada roll fisik untuk dihitung.');

  const session = {
    id: nextId(db, 'opname', 'OPN', 3),
    warehouseId,
    status: 'counting',
    startedAt: isoNow(),
    startedDate: todayJakarta(),
    countedBy: user?.name ?? 'Sistem',
    note,
    lines: rolls.map((r) => ({
      rollId: r.id,
      skuId: r.skuId,
      lot: r.lot,
      expectedMm: r.currentMm,
      reservedMm: r.reservedMm || 0,
      unitCost: r.costPerM,
      countedMm: null,
      note: '',
    })),
    submittedAt: null,
    postedAt: null,
    postedBy: null,
    approveReason: '',
    adjustments: [],
    history: [{ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Sesi dimulai' }],
  };
  db.opnameSessions.unshift(session);
  audit(db, user, 'mulai_opname', 'opname', session.id, `${wh.name} · ${rolls.length} roll`);
  return session;
}

export function saveCounts(db, { sessionId, counts, user }) {
  const session = getSession(db, sessionId);
  assert(session, 'OPNAME_NOT_FOUND', 'Sesi opname tidak ditemukan.');
  assert(session.status === 'counting', 'INVALID_STATUS', 'Sesi tidak dalam penghitungan.');
  for (const count of counts) {
    const line = session.lines.find((l) => l.rollId === count.rollId);
    if (!line) continue;
    if (count.countedMm === null || count.countedMm === undefined || count.countedMm === '') {
      line.countedMm = null;
    } else {
      const mm = Math.round(Number(count.countedMm));
      assert(mm >= 0, 'INVALID_LENGTH', 'Jumlah hitung tidak boleh negatif.');
      line.countedMm = mm;
    }
    if (count.note !== undefined) line.note = String(count.note);
  }
  session.updatedAt = isoNow();
  session.countedBy = user?.name ?? session.countedBy;
  audit(db, user, 'simpan_hitung', 'opname', session.id, `${counts.length} baris`);
  return session;
}

export function submitOpname(db, { sessionId, user }) {
  const session = getSession(db, sessionId);
  assert(session, 'OPNAME_NOT_FOUND', 'Sesi opname tidak ditemukan.');
  assert(session.status === 'counting', 'INVALID_STATUS', 'Sesi tidak dalam penghitungan.');
  const missing = session.lines.filter((l) => l.countedMm === null);
  assert(missing.length === 0, 'INCOMPLETE_COUNT',
    `Masih ada ${missing.length} roll yang belum dihitung.`);
  session.status = 'review';
  session.submittedAt = isoNow();
  session.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Diajukan untuk review' });
  audit(db, user, 'ajukan_opname', 'opname', session.id, '');
  return session;
}

export function opnameVariance(session) {
  return session.lines.map((l) => ({
    ...l,
    varianceMm: l.countedMm === null ? null : l.countedMm - l.expectedMm,
    value: l.countedMm === null ? 0 : Math.round(((l.countedMm - l.expectedMm) / MM_PER_M) * (l.unitCost ?? 0)),
  }));
}

export function opnameSummary(session) {
  let expectedMm = 0;
  let countedMm = 0;
  let varianceMm = 0;
  let countedLines = 0;
  for (const l of session.lines) {
    expectedMm += l.expectedMm;
    if (l.countedMm !== null) {
      countedMm += l.countedMm;
      varianceMm += l.countedMm - l.expectedMm;
      countedLines += 1;
    }
  }
  return {
    lines: session.lines.length,
    countedLines,
    expectedMm,
    countedMm,
    varianceMm,
    variancePct: expectedMm ? (varianceMm / expectedMm) * 100 : 0,
    complete: countedLines === session.lines.length,
  };
}

/** Manager review: recount or approve. Approval posts adjustments atomically. */
export function approveOpname(db, { sessionId, user, reason, recount = false }) {
  const session = getSession(db, sessionId);
  assert(session, 'OPNAME_NOT_FOUND', 'Sesi opname tidak ditemukan.');
  assert(user?.role === 'manager', 'FORBIDDEN', 'Hanya manajer yang dapat menyetujui opname.');
  assert(session.status === 'review', 'INVALID_STATUS', 'Sesi belum diajukan.');
  assert(session.lines.every((l) => l.countedMm !== null), 'INCOMPLETE_COUNT', 'Hitungan belum lengkap.');
  assert(reason && reason.trim().length >= 3, 'REASON_REQUIRED', 'Alasan persetujuan / selisih wajib diisi.');

  if (recount) {
    session.status = 'counting';
    for (const l of session.lines) l.countedMm = null;
    session.history.push({ at: isoNow(), by: user.name, action: 'Hitung ulang diminta', note: reason });
    audit(db, user, 'hitung_ulang_opname', 'opname', session.id, reason);
    return session;
  }

  // Validate that no roll would fall below its committed reservations.
  for (const line of session.lines) {
    const roll = requireRoll(db, line.rollId);
    const reserved = roll.reservedMm || 0;
    if (line.countedMm < reserved) {
      throw new DomainError(
        'ALLOCATION_CONFLICT',
        `Roll ${roll.id}: hitung ${line.countedMm / MM_PER_M} m lebih kecil dari reservasi ${reserved / MM_PER_M} m. Selesaikan alokasi terlebih dahulu.`,
        { rollId: roll.id, reservedMm: reserved, countedMm: line.countedMm },
      );
    }
  }

  const adjustments = [];
  for (const line of session.lines) {
    const roll = requireRoll(db, line.rollId);
    const variance = line.countedMm - roll.currentMm;
    if (variance === 0) continue;
    const before = roll.currentMm;
    const beforeStatus = roll.status;
    roll.currentMm = line.countedMm;
    if (line.countedMm === 0) roll.status = 'consumed';
    const value = Math.round((variance / MM_PER_M) * roll.costPerM);
    recordMovement(db, {
      type: 'adjust',
      ref: `${session.id}`,
      date: session.startedDate,
      warehouseId: session.warehouseId,
      skuId: roll.skuId,
      rollId: roll.id,
      qtyMm: variance,
      beforeMm: before,
      afterMm: line.countedMm,
      unitCost: roll.costPerM,
      value,
      user,
      note: `Opname ${session.id}: ${reason.trim()}`,
    });
    adjustments.push({
      rollId: roll.id,
      beforeMm: before,
      afterMm: line.countedMm,
      varianceMm: variance,
      value,
      reason: reason.trim(),
      beforeStatus,
    });
  }

  session.status = 'posted';
  session.postedAt = isoNow();
  session.postedBy = user.name;
  session.approveReason = reason.trim();
  session.adjustments = adjustments;
  session.history.push({ at: isoNow(), by: user.name, action: 'Disetujui & diposting', note: reason.trim() });
  audit(db, user, 'posting_opname', 'opname', session.id,
    `${adjustments.length} penyesuaian · ${adjustments.reduce((a, b) => a + b.varianceMm, 0) / MM_PER_M} m`);
  return session;
}

export function cancelOpname(db, { sessionId, user, reason }) {
  const session = getSession(db, sessionId);
  assert(session, 'OPNAME_NOT_FOUND', 'Sesi opname tidak ditemukan.');
  assert(['counting', 'review'].includes(session.status), 'INVALID_STATUS', 'Sesi sudah selesai.');
  session.status = 'cancelled';
  session.cancelReason = reason ?? '';
  session.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Dibatalkan', note: reason ?? '' });
  audit(db, user, 'batalkan_opname', 'opname', session.id, reason ?? '');
  return session;
}
