/**
 * Demo authentication: per-user PIN with PBKDF2 hashing and a session.
 *
 * This is deliberately honest about its limits: everything runs in the browser,
 * so a determined user can edit storage. It is a product-flow demo, not a
 * security boundary. Production must authenticate on the server.
 */

import { USERS } from '../domain/seed.js';

const ACCOUNTS = Object.values(USERS);

const AUTH_KEY = 'lajur.v3.auth';
const SESSION_KEY = 'lajur.v3.session';
const ATTEMPT_KEY = 'lajur.v3.attempts';

const ITERATIONS = 120_000;
const SESSION_HOURS = 8;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60_000;

/** Demo-only starting PINs. Changing a PIN removes it from the login hint. */
export const DEFAULT_PINS = {
  'u-mgr': '2468',
  'u-op': '1357',
  'u-sales': '8642',
  'u-drv1': '1212',
  'u-drv2': '2323',
  'u-drv3': '3434',
};

export const ROLE_HOME = {
  manager: '#/ringkasan',
  operator: '#/ringkasan',
  sales: '#/penjualan',
  driver: '#/pengiriman',
};

let cached = null;

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function writeSession(value) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* session storage can be blocked */
  }
}

const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)));

export async function hashPin(pin, saltHex) {
  if (!globalThis.crypto?.subtle) throw new Error('Browser ini tidak mendukung Web Crypto.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export function validPinFormat(pin) {
  return /^\d{4,6}$/.test(String(pin ?? ''));
}

export function weakPin(pin) {
  const p = String(pin);
  if (!validPinFormat(p)) return true;
  if (/^(\d)\1+$/.test(p)) return true;
  if (['1234', '4321', '0000', '1111', '2468', '1357', '8642', '2580'].includes(p)) return true;
  return false;
}

export async function ensureAccounts(users = Object.values(USERS)) {
  const data = readJson(AUTH_KEY) ?? { version: 1, users: {} };
  if (!data.users) data.users = {};
  let changed = false;
  for (const user of users) {
    if (!data.users[user.id]) {
      const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
      const seedPin = DEFAULT_PINS[user.id] ?? String(Math.floor(100000 + Math.random() * 900000));
      const hash = await hashPin(seedPin, salt);
      data.users[user.id] = {
        salt,
        hash,
        defaultPin: Boolean(DEFAULT_PINS[user.id]),
        updatedAt: new Date().toISOString(),
        failed: 0,
        lockedUntil: 0,
      };
      changed = true;
    }
  }
  if (changed) writeJson(AUTH_KEY, data);
  cached = data;
  return data;
}

function accountOf(userId) {
  const data = cached ?? (cached = readJson(AUTH_KEY) ?? { version: 1, users: {} });
  return data.users?.[userId] ?? null;
}

function readAttempts() {
  return readJson(ATTEMPT_KEY) ?? {};
}

function writeAttempts(value) {
  writeJson(ATTEMPT_KEY, value);
}

function userRecord(userId, users = ACCOUNTS) {
  return users.find((u) => u.id === userId) ?? null;
}

export function pendingLock(userId) {
  const attempts = readAttempts();
  const entry = attempts[userId];
  if (!entry?.lockedUntil) return 0;
  const remaining = entry.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

export async function verifyPin(userId, pin) {
  const account = accountOf(userId);
  if (!account) throw new Error('Akun tidak ditemukan.');
  const hash = await hashPin(pin, account.salt);
  return hash === account.hash;
}

export async function login(userId, pin, users = ACCOUNTS) {
  const user = userRecord(userId, users);
  if (!user) {
    const err = new Error('Pilih pengguna terlebih dahulu.');
    err.code = 'USER_REQUIRED';
    throw err;
  }
  if (user.active === false) {
    const err = new Error('Akun ini dinonaktifkan. Hubungi manajer.');
    err.code = 'USER_INACTIVE';
    throw err;
  }
  const locked = pendingLock(userId);
  if (locked) {
    const err = new Error(`Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(locked / 1000)} detik.`);
    err.code = 'LOCKED';
    err.remainingMs = locked;
    throw err;
  }
  if (!validPinFormat(pin)) {
    const err = new Error('PIN harus 4â€“6 angka.');
    err.code = 'PIN_FORMAT';
    throw err;
  }

  const ok = await verifyPin(userId, pin);
  const attempts = readAttempts();
  if (!ok) {
    const entry = attempts[userId] ?? { failed: 0, lockedUntil: 0 };
    entry.failed = (entry.failed ?? 0) + 1;
    if (entry.failed >= MAX_ATTEMPTS) {
      entry.lockedUntil = Date.now() + LOCK_MS;
      entry.failed = 0;
    }
    attempts[userId] = entry;
    writeAttempts(attempts);
    const err = new Error(entry.lockedUntil
      ? 'PIN salah 5 kali. Masuk dikunci 60 detik.'
      : `PIN salah. Sisa ${MAX_ATTEMPTS - (entry.failed || 0)} percobaan.`);
    err.code = entry.lockedUntil ? 'LOCKED' : 'INVALID_PIN';
    err.remainingMs = entry.lockedUntil ? LOCK_MS : 0;
    throw err;
  }

  delete attempts[userId];
  writeAttempts(attempts);

  const session = {
    userId,
    at: Date.now(),
    expiresAt: Date.now() + SESSION_HOURS * 3_600_000,
  };
  writeSession(session);
  return { ...user, pinChanged: !accountOf(userId)?.defaultPin };
}

export function sessionUser(users = ACCOUNTS) {
  const session = readSession();
  if (!session?.userId) return null;
  if (!session.expiresAt || session.expiresAt < Date.now()) {
    writeSession(null);
    return null;
  }
  const user = userRecord(session.userId, users);
  if (!user || user.active === false) {
    writeSession(null);
    return null;
  }
  return { ...user, expiresAt: session.expiresAt };
}

export function sessionRemainingMs() {
  const session = readSession();
  return session?.expiresAt ? Math.max(0, session.expiresAt - Date.now()) : 0;
}

export function logout() {
  writeSession(null);
}

export async function changePin(userId, currentPin, nextPin) {
  const locked = pendingLock(userId);
  if (locked) throw new Error(`Akun dikunci. Coba lagi dalam ${Math.ceil(locked / 1000)} detik.`);
  const account = accountOf(userId);
  if (!account) throw new Error('Akun tidak ditemukan.');
  if (!(await verifyPin(userId, currentPin))) {
    const err = new Error('PIN saat ini salah.');
    err.code = 'INVALID_PIN';
    throw err;
  }
  if (!validPinFormat(nextPin)) {
    const err = new Error('PIN baru harus 4-6 angka.');
    err.code = 'PIN_FORMAT';
    throw err;
  }
  if (String(nextPin) === String(currentPin)) {
    const err = new Error('PIN baru harus berbeda dari PIN saat ini.');
    err.code = 'PIN_SAME';
    throw err;
  }
  if (weakPin(nextPin)) {
    const err = new Error('PIN terlalu mudah ditebak. Hindari 1234, 0000, atau angka berulang.');
    err.code = 'PIN_WEAK';
    throw err;
  }
  await setAccountPin(userId, nextPin, false);
  return true;
}

async function setAccountPin(userId, pin, defaultPin = false) {
  const data = cached ?? readJson(AUTH_KEY) ?? { version: 1, users: {} };
  if (!data.users) data.users = {};
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPin(pin, salt);
  data.users[userId] = {
    ...(data.users[userId] ?? {}),
    salt,
    hash,
    defaultPin,
    updatedAt: new Date().toISOString(),
    failed: 0,
    lockedUntil: 0,
  };
  cached = data;
  writeJson(AUTH_KEY, data);
}

/** Manager creates an account for a new staff member. */
export async function createAccount(userId, pin, { defaultPin = false } = {}) {
  if (!validPinFormat(pin)) {
    const err = new Error('PIN awal harus 4-6 angka.');
    err.code = 'PIN_FORMAT';
    throw err;
  }
  await setAccountPin(userId, pin, defaultPin);
}

/** Manager resets another user's PIN without knowing the old PIN. */
export async function adminSetPin(userId, pin) {
  if (!validPinFormat(pin)) {
    const err = new Error('PIN baru harus 4-6 angka.');
    err.code = 'PIN_FORMAT';
    throw err;
  }
  await setAccountPin(userId, pin, false);
  const attempts = readAttempts();
  delete attempts[userId];
  writeAttempts(attempts);
  return true;
}

export function pinStatus(userId) {
  const account = accountOf(userId);
  if (!account) return { exists: false, defaultPin: false, updatedAt: null };
  return { exists: true, defaultPin: Boolean(account.defaultPin), updatedAt: account.updatedAt ?? null };
}

/** Demo credentials are shown only while a user still has the default PIN. */
export function demoCredentials(users = ACCOUNTS) {
  const data = cached ?? readJson(AUTH_KEY);
  return users
    .filter((u) => data?.users?.[u.id]?.defaultPin !== false)
    .filter((u) => DEFAULT_PINS[u.id])
    .map((u) => ({ ...u, pin: DEFAULT_PINS[u.id] }));
}
