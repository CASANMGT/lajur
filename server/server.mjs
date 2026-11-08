/**
 * Reference shared backend for Lajur — Node built-ins only.
 *
 * This is deliberately small but real: HTTP-only cookies, scrypt PIN hashes,
 * RBAC per action, revisioned shared state and atomic file writes. Run it with
 * `npm run server`; the static Vercel demo stays browser-only unless a client
 * is pointed at this API.
 *
 * Not production-grade by itself: single process, file storage, no rate limit
 * per IP, no TLS termination, no multi-node locking.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildSeed } from '../src/domain/seed.js';
import { clone } from '../src/domain/core.js';
import { validateBackup, BACKUP_FORMAT, BACKUP_VERSION } from '../src/data/backup.js';
import { completeTask, createTask, startTask } from '../src/domain/tasks.js';
import { cutOrder, qcPiece, sewPiece } from '../src/domain/production.js';
import { receiveLine } from '../src/domain/transfers.js';
import { confirmOrder, convertOrderToInvoice, createSalesOrder } from '../src/domain/orders.js';
import { postInvoice } from '../src/domain/sales.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(dir, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const PORT = Number(process.env.PORT ?? 8790);
const SESSION_MS = 8 * 3_600_000;

const DEFAULT_PINS = { 'u-mgr': '2468', 'u-op': '1357', 'u-sales': '8642' };

const CAPS = {
  manager: new Set(['*']),
  operator: new Set(['task.start', 'task.complete', 'production.cut', 'production.sew', 'production.qc', 'transfer.receive']),
  sales: new Set(['task.create', 'order.create', 'order.confirm', 'order.convert', 'invoice.post']),
};

fs.mkdirSync(DATA_DIR, { recursive: true });

const hash = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');

function loadAuth() {
  if (fs.existsSync(AUTH_FILE)) return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  const seed = buildSeed();
  const users = seed.users.map((u) => {
    const salt = crypto.randomBytes(16).toString('hex');
    return { id: u.id, name: u.name, role: u.role, active: true, salt, hash: hash(DEFAULT_PINS[u.id], salt) };
  });
  const data = { users };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
  return data;
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const data = buildSeed();
  const state = { revision: 1, data };
  writeState(state);
  return state;
}

function writeState(state) {
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, STATE_FILE);
}

let auth = loadAuth();
let state = loadState();
const sessions = new Map();

const json = (res, status, body, headers = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(payload);
};

function cookies(req) {
  return Object.fromEntries((req.headers.cookie ?? '').split(';').filter(Boolean).map((part) => {
    const [k, ...v] = part.trim().split('=');
    return [k, decodeURIComponent(v.join('='))];
  }));
}

function currentUser(req) {
  const token = cookies(req).lajur_session;
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt < Date.now()) return null;
  const user = auth.users.find((u) => u.id === session.userId);
  if (!user || user.active === false) return null;
  return user;
}

function can(user, action) {
  const caps = CAPS[user.role] ?? new Set();
  return caps.has('*') || caps.has(action);
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 5_000_000) throw new Error('Payload too large');
  }
  return raw ? JSON.parse(raw) : {};
}

const ACTIONS = {
  'task.create': (db, payload, user) => createTask(db, { ...payload, user }),
  'task.start': (db, payload, user) => startTask(db, { id: payload.taskId, user }),
  'task.complete': (db, payload, user) => completeTask(db, { id: payload.taskId, note: payload.note, user }),
  'production.cut': (db, payload, user) => cutOrder(db, { id: payload.orderId, user }),
  'production.sew': (db, payload, user) => sewPiece(db, { pieceId: payload.pieceId, user }),
  'production.qc': (db, payload, user) => qcPiece(db, { pieceId: payload.pieceId, pass: payload.pass, note: payload.note, user }),
  'transfer.receive': (db, payload, user) => receiveLine(db, { transferId: payload.transferId, lineId: payload.lineId, qtyMm: payload.qtyMm, user }),
  'order.create': (db, payload, user) => createSalesOrder(db, { ...payload, user }),
  'order.confirm': (db, payload, user) => confirmOrder(db, { id: payload.orderId, user }),
  'order.convert': (db, payload, user) => convertOrderToInvoice(db, { id: payload.orderId, user }),
  'invoice.post': (db, payload, user) => postInvoice(db, { id: payload.invoiceId, user }),
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, revision: state.revision });

    if (url.pathname === '/api/login' && req.method === 'POST') {
      const { userId, pin } = await body(req);
      const user = auth.users.find((u) => u.id === userId);
      if (!user || user.active === false) return json(res, 401, { error: 'Akun tidak ditemukan/nonaktif.' });
      const candidate = hash(pin, user.salt);
      if (!crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(user.hash, 'hex'))) {
        return json(res, 401, { error: 'PIN salah.' });
      }
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, { userId, expiresAt: Date.now() + SESSION_MS });
      return json(res, 200, { user: { id: user.id, name: user.name, role: user.role }, expiresIn: SESSION_MS }, {
        'set-cookie': `lajur_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`,
      });
    }

    if (url.pathname === '/api/logout' && req.method === 'POST') {
      const token = cookies(req).lajur_session;
      if (token) sessions.delete(token);
      return json(res, 200, { ok: true }, { 'set-cookie': 'lajur_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    }

    const user = currentUser(req);
    if (!user) return json(res, 401, { error: 'Sesi tidak valid.' });

    if (url.pathname === '/api/me') return json(res, 200, { user: { id: user.id, name: user.name, role: user.role } });

    if (url.pathname === '/api/state' && req.method === 'GET') {
      return json(res, 200, { revision: state.revision, data: state.data });
    }

    if (url.pathname === '/api/state' && req.method === 'PUT') {
      if (user.role !== 'manager') return json(res, 403, { error: 'Hanya manajer dapat mengganti seluruh dataset.' });
      const payload = await body(req);
      if (payload.baseRevision !== state.revision) return json(res, 409, { error: 'Revisi berubah.', revision: state.revision });
      const check = validateBackup({ format: BACKUP_FORMAT, version: BACKUP_VERSION, data: payload.data });
      if (!check.valid) return json(res, 422, { error: 'Referensi tidak valid.', errors: check.errors });
      state = { revision: state.revision + 1, data: payload.data };
      writeState(state);
      return json(res, 200, { revision: state.revision });
    }

    if (url.pathname.startsWith('/api/actions/') && req.method === 'POST') {
      const action = url.pathname.slice('/api/actions/'.length);
      const handler = ACTIONS[action];
      if (!handler) return json(res, 404, { error: 'Aksi tidak dikenal.' });
      if (!can(user, action)) return json(res, 403, { error: 'Peran tidak berwenang.' });
      const payload = await body(req);
      const draft = clone(state.data);
      const result = handler(draft, payload, { id: user.id, name: user.name, role: user.role });
      state = { revision: state.revision + 1, data: draft };
      writeState(state);
      return json(res, 200, { revision: state.revision, result });
    }

    return json(res, 404, { error: 'Tidak ditemukan.' });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Lajur API: http://127.0.0.1:${PORT} · revision ${state.revision}`);
});
