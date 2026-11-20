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
    lines: rolls.map((r) => {
      const sku = byId(db.skus, r.skuId);
      return {
        rollId: r.id,
        skuId: r.skuId,
        collectionName: sku?.collectionName ?? '',
        motifName: sku?.colourName || sku?.colourCode || sku?.code || '',
        lot: r.lot,
        expectedMm: r.currentMm,
        reservedMm: r.reservedMm || 0,
        unitCost: r.costPerM,
        countedMm: null,
        present: null,
        countedBy: null,
        countedAt: null,
        note: '',
      };
    }).sort((a, b) => String(a.collectionName).localeCompare(String(b.collectionName))
      || String(a.motifName).localeCompare(String(b.motifName))
      || String(a.rollId).localeCompare(String(b.rollId))),
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
    const hasMeter = count.countedMm !== null && count.countedMm !== undefined && count.countedMm !== '';
    if (hasMeter) {
      const mm = Math.round(Number(count.countedMm));
      assert(mm >= 0, 'INVALID_LENGTH', 'Jumlah hitung tidak boleh negatif.');
      line.countedMm = mm;
      line.present = mm > 0;
    } else if (count.present === false) {
      line.countedMm = 0;
      line.present = false;
    } else if (count.present === true) {
      line.countedMm = null;
      line.present = true;
    } else {
      line.countedMm = null;
      line.present = null;
    }
    if (line.present !== null) {
      line.countedBy = user?.name ?? 'Sistem';
      line.countedAt = isoNow();
    } else {
      line.countedBy = null;
      line.countedAt = null;
    }
    if (count.note !== undefined) line.note = String(count.note);
  }
  session.updatedAt = isoNow();
  session.countedBy = user?.name ?? session.countedBy;
  audit(db, user, 'simpan_hitung', 'opname', session.id, `${counts.length} baris`);
  return session;
}

export function opnameLineDone(line) {
  return line.present === true || line.present === false || line.countedMm !== null;
}

/** Presence-only counts keep the system metres; missing rolls count as 0. */
export function opnameEffectiveMm(line) {
  if (line.countedMm !== null && line.countedMm !== undefined) return line.countedMm;
  if (line.present === true) return line.expectedMm;
  return 0;
}

export function submitOpname(db, { sessionId, user }) {
  const session = getSession(db, sessionId);
  assert(session, 'OPNAME_NOT_FOUND', 'Sesi opname tidak ditemukan.');
  assert(session.status === 'counting', 'INVALID_STATUS', 'Sesi tidak dalam penghitungan.');
  const missing = session.lines.filter((l) => !opnameLineDone(l));
  assert(missing.length === 0, 'INCOMPLETE_COUNT',
    `Masih ada ${missing.length} roll yang belum dicek.`);
  session.status = 'review';
  session.submittedAt = isoNow();
  session.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Diajukan untuk review' });
  audit(db, user, 'ajukan_opname', 'opname', session.id, '');
  return session;
}

export function opnameVariance(session) {
  return session.lines.map((l) => {
    const effective = opnameEffectiveMm(l);
    return {
      ...l,
      effectiveMm: effective,
      varianceMm: opnameLineDone(l) ? effective - l.expectedMm : null,
      value: opnameLineDone(l) ? Math.round(((effective - l.expectedMm) / MM_PER_M) * (l.unitCost ?? 0)) : 0,
    };
  });
}

export function opnameSummary(session) {
  let expectedMm = 0;
  let countedMm = 0;
  let varianceMm = 0;
  let countedLines = 0;
  let presenceOnly = 0;
  let measuredLines = 0;
  let missingLines = 0;
  for (const l of session.lines) {
    expectedMm += l.expectedMm;
    if (opnameLineDone(l)) {
      const effective = opnameEffectiveMm(l);
      countedMm += effective;
      varianceMm += effective - l.expectedMm;
      countedLines += 1;
      if (l.countedMm === null && l.present === true) presenceOnly += 1;
      if (l.countedMm !== null && l.countedMm > 0) measuredLines += 1;
      if (l.present === false || l.countedMm === 0) missingLines += 1;
    }
  }
  return {
    lines: session.lines.length,
    countedLines,
    measuredLines,
    presenceOnly,
    missingLines,
    expectedMm,
    countedMm,
    varianceMm,
    variancePct: expectedMm ? (varianceMm / expectedMm) * 100 : 0,
    complete: countedLines === session.lines.length,
  };
}

/** Result summary used by the UI and berita acara. */
export function opnameResult(session) {
  const summary = opnameSummary(session);
  const participants = [...new Set(session.lines.map((l) => l.countedBy).filter(Boolean))];
  if (!participants.length && session.countedBy) participants.push(session.countedBy);
  const start = session.startedAt ? new Date(session.startedAt).getTime() : null;
  const end = session.postedAt || session.submittedAt;
  const endTime = end ? new Date(end).getTime() : null;
  return {
    ...summary,
    participants,
    startedAt: session.startedAt,
    endedAt: end,
    durationMinutes: start && endTime ? Math.max(0, Math.round((endTime - start) / 60000)) : 0,
    missingRolls: session.lines.filter((l) => l.present === false || l.countedMm === 0).map((l) => l.rollId),
  };
}

/** Manager review: recount or approve. Approval posts adjustments atomically. */
export function approveOpname(db, { sessionId, user, reason, recount = false }) {
  const session = getSession(db, sessionId);
  assert(session, 'OPNAME_NOT_FOUND', 'Sesi opname tidak ditemukan.');
  assert(user?.role === 'manager', 'FORBIDDEN', 'Hanya manajer yang dapat menyetujui opname.');
  assert(session.status === 'review', 'INVALID_STATUS', 'Sesi belum diajukan.');
  assert(session.lines.every((l) => opnameLineDone(l)), 'INCOMPLETE_COUNT', 'Pemeriksaan belum lengkap.');
  assert(reason && reason.trim().length >= 3, 'REASON_REQUIRED', 'Alasan persetujuan / selisih wajib diisi.');

  if (recount) {
    session.status = 'counting';
    for (const l of session.lines) {
      l.countedMm = null;
      l.present = null;
      l.countedBy = null;
      l.countedAt = null;
    }
    session.history.push({ at: isoNow(), by: user.name, action: 'Hitung ulang diminta', note: reason });
    audit(db, user, 'hitung_ulang_opname', 'opname', session.id, reason);
    return session;
  }

  // Validate that no roll would fall below its committed reservations.
  for (const line of session.lines) {
    const roll = requireRoll(db, line.rollId);
    const reserved = roll.reservedMm || 0;
    const effective = opnameEffectiveMm(line);
    if (effective < reserved) {
      throw new DomainError(
        'ALLOCATION_CONFLICT',
        `Roll ${roll.id}: hitung ${effective / MM_PER_M} m lebih kecil dari reservasi ${reserved / MM_PER_M} m. Selesaikan alokasi terlebih dahulu.`,
        { rollId: roll.id, reservedMm: reserved, countedMm: effective },
      );
    }
  }

  const adjustments = [];
  for (const line of session.lines) {
    const roll = requireRoll(db, line.rollId);
    const effective = opnameEffectiveMm(line);
    const variance = effective - roll.currentMm;
    if (variance === 0) continue;
    const before = roll.currentMm;
    const beforeStatus = roll.status;
    roll.currentMm = effective;
    if (effective === 0) roll.status = 'consumed';
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
      afterMm: effective,
      unitCost: roll.costPerM,
      value,
      user,
      note: `Opname ${session.id}: ${reason.trim()}`,
    });
    adjustments.push({
      rollId: roll.id,
      beforeMm: before,
      afterMm: effective,
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
