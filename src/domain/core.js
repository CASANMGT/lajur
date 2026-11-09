/**
 * Core primitives: units, money, dates, identifiers, audit.
 *
 * Numeric policy
 * --------------
 * Fabric lengths are stored as integer MILLIMETRES (1 mm precision). UI input
 * is in metres with an Indonesian decimal comma. Money is stored as integer
 * RUPIAH. Piece goods are integer PIECES. Metres, pieces and rupiah are never
 * mixed in one arithmetic operation.
 *
 * Business dates use Asia/Jakarta. Timestamps are stored as ISO-8601 UTC and
 * rendered in Jakarta time.
 */

export class DomainError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.detail = detail;
  }
}

export const MM_PER_M = 1000;
export const TZ = 'Asia/Jakarta';

/* -------------------------------------------------------------------------- */
/* Numbers and units                                                          */
/* -------------------------------------------------------------------------- */

const nf = (opts) => new Intl.NumberFormat('id-ID', opts);

const fmtNumber = nf({ maximumFractionDigits: 2 });
const fmtInt = nf({ maximumFractionDigits: 0 });
const fmtMoney = nf({ style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const fmtMoneyCompact = nf({ notation: 'compact', style: 'currency', currency: 'IDR', maximumFractionDigits: 1 });

export function formatM(mm, { unit = true, signed = false } = {}) {
  if (mm === null || mm === undefined || Number.isNaN(mm)) return '—';
  const m = mm / MM_PER_M;
  const sign = signed && m > 0 ? '+' : '';
  return `${sign}${fmtNumber.format(m)}${unit ? ' m' : ''}`;
}

export function formatMValue(mm, decimals = 1) {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(mm / MM_PER_M);
}

/** Parse "61,2", "61.2", 61.2 (metres) into integer mm. */
export function parseM(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Math.round(value * MM_PER_M);
  const clean = String(value).trim().replace(/\s|m$/gi, '').replace(',', '.');
  const n = Number(clean);
  if (!Number.isFinite(n)) throw new DomainError('INVALID_LENGTH', `Panjang tidak valid: ${value}`);
  return Math.round(n * MM_PER_M);
}

/** Parse a positive integer (pieces, days). */
export function parsePcs(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Math.round(Number(String(value).replace(/\./g, '').replace(',', '.')));
  if (!Number.isFinite(n)) throw new DomainError('INVALID_QTY', `Jumlah tidak valid: ${value}`);
  return n;
}

export function formatPcs(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return fmtInt.format(n);
}

export function formatMoney(n, { compact = false } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return (compact ? fmtMoneyCompact : fmtMoney).format(n);
}

export function formatMoneyValue(n) {
  return fmtInt.format(n ?? 0);
}

export function formatPercent(n, digits = 1) {
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(n)}%`;
}

/** Round to the nearest whole rupiah (all posted money is integer). */
export function money(n) {
  return Math.round(Number(n) || 0);
}

export function sum(list, fn = (x) => x) {
  return list.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0);
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

const dateFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric',
});
const dateLongFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric',
});
const dateTimeFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

export function formatDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return dateFmt.format(d);
}

export function formatDateLong(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return dateLongFmt.format(d);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return dateTimeFmt.format(d);
}

/** Business date (YYYY-MM-DD) in Asia/Jakarta. */
export function businessDate(date = new Date()) {
  return partsFmt.format(date);
}

export function todayJakarta() {
  return businessDate(new Date());
}

export function isoNow() {
  return new Date().toISOString();
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return businessDate(d);
}

/** Whole days between two business dates (b - a). */
export function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00+07:00`).getTime();
  const db = new Date(`${b}T00:00:00+07:00`).getTime();
  return Math.round((db - da) / 86_400_000);
}

export function isPast(dateStr, today = todayJakarta()) {
  return Boolean(dateStr) && dateStr < today;
}

/* -------------------------------------------------------------------------- */
/* Identifiers                                                                */
/* -------------------------------------------------------------------------- */

const pad = (n, width) => String(n).padStart(width, '0');

/** Sequential, human-readable document id, e.g. RL-0007. */
export function nextId(db, key, prefix, width = 4) {
  if (!db.sequences) db.sequences = {};
  const next = (db.sequences[key] ?? 0) + 1;
  db.sequences[key] = next;
  return `${prefix}-${pad(next, width)}`;
}

export function peekId(db, key, prefix, width = 4) {
  return `${prefix}-${pad((db.sequences?.[key] ?? 0) + 1, width)}`;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/* -------------------------------------------------------------------------- */
/* Collections / helpers                                                      */
/* -------------------------------------------------------------------------- */

export function byId(list, id) {
  return list.find((x) => x.id === id) ?? null;
}

export function requireRef(list, id, label) {
  const found = byId(list, id);
  if (!found) throw new DomainError('MISSING_REF', `${label} tidak ditemukan (${id}).`);
  return found;
}

export function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function unique(list) {
  return [...new Set(list)];
}

/** Deep clone via structuredClone with a JSON fallback (older Safari). */
export function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function audit(db, user, action, entity, entityId, detail = '') {
  const entry = {
    id: `AUD-${db.audit.length + 1}`,
    at: isoNow(),
    date: todayJakarta(),
    userId: user?.id ?? 'system',
    userName: user?.name ?? 'Sistem',
    role: user?.role ?? 'system',
    action,
    entity,
    entityId,
    detail,
  };
  db.audit.unshift(entry);
  if (db.audit.length > 2000) db.audit.length = 2000;
  return entry;
}

export function assert(condition, code, message, detail) {
  if (!condition) throw new DomainError(code, message, detail);
}

/**
 * NPWP is optional on a customer and on a faktur pajak. When present, accept
 * the usual dotted format and the newer 16-digit NIK/NPWP form; reject letters
 * or implausible lengths so a blank field stays clear of garbage.
 */
export function normalizeNpwp(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  assert(/^[\d.\-\s]+$/.test(raw), 'INVALID_NPWP', 'NPWP hanya boleh berisi angka, titik, dan strip.');
  const digits = raw.replace(/\D/g, '');
  assert(digits.length === 15 || digits.length === 16, 'INVALID_NPWP', 'NPWP harus 15 atau 16 digit.');
  return raw;
}
