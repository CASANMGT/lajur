/**
 * Shared dataset API for Neon Postgres, deployed as a Vercel Function.
 *
 * The browser never sees DATABASE_URL. It sends the workspace sync key in
 * `x-lajur-key`; Vercel compares it with LAJUR_SYNC_KEY.
 *
 *   GET  /api/cloud?workspace=lavishome
 *   POST /api/cloud?workspace=lavishome   { baseRevision, data, actor }
 *
 * Request bodies may be gzip-encoded (`content-encoding: gzip`) so the full
 * JSON dataset stays below Vercel's 4.5 MB function limit.
 */

import { gzipSync, gunzipSync } from 'node:zlib';
import crypto from 'node:crypto';
import { attachDatabasePool } from '@vercel/functions';

const WORKSPACE_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const MAX_DECOMPRESSED_BYTES = 60 * 1024 * 1024;

function sameKey(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** Pure request logic; the adapter supplies get/push and the configured key. */
export async function handleCloud({ method, workspace, key, baseRevision, data, actor, db, syncKey }) {
  if (!syncKey) {
    return { status: 503, body: { error: 'Sinkron cloud belum aktif. Set LAJUR_SYNC_KEY di Vercel.' } };
  }
  if (!sameKey(key, syncKey)) {
    return { status: 401, body: { error: 'Kunci sinkronisasi salah.' } };
  }
  if (!WORKSPACE_RE.test(String(workspace ?? ''))) {
    return { status: 400, body: { error: 'Workspace tidak valid.' } };
  }

  if (method === 'GET') {
    const row = await db.get(workspace);
    return {
      status: 200,
      body: row ?? { revision: 0, data: null, updatedAt: null, updatedBy: null },
    };
  }

  if (method === 'POST') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { status: 422, body: { error: 'Data harus berupa objek dataset.' } };
    }
    if (!Number.isFinite(Number(baseRevision)) || Number(baseRevision) < 0) {
      return { status: 422, body: { error: 'baseRevision tidak valid.' } };
    }
    return db.push(workspace, Number(baseRevision), data, String(actor ?? '').slice(0, 120));
  }

  return { status: 405, body: { error: 'Metode tidak didukung.' } };
}

const SCHEMA_SQL = `
  create table if not exists lajur_cloud (
    workspace   text primary key,
    revision    bigint not null default 0,
    data        jsonb,
    updated_at  timestamptz not null default now(),
    updated_by  text
  )
`;

export function createPgDb(pool) {
  let schemaReady = null;
  const ensureSchema = () => {
    if (!schemaReady) {
      schemaReady = pool.query(SCHEMA_SQL).catch((err) => {
        schemaReady = null;
        throw err;
      });
    }
    return schemaReady;
  };

  return {
    async get(workspace) {
      await ensureSchema();
      const { rows } = await pool.query(
        'select revision, data, updated_at, updated_by from lajur_cloud where workspace = $1',
        [workspace],
      );
      if (!rows.length) return null;
      const row = rows[0];
      return {
        revision: Number(row.revision),
        data: row.data,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by,
      };
    },

    async push(workspace, baseRevision, data, actor) {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('insert into lajur_cloud (workspace) values ($1) on conflict (workspace) do nothing', [workspace]);
        const { rows } = await client.query(
          'select revision from lajur_cloud where workspace = $1 for update',
          [workspace],
        );
        const current = Number(rows[0].revision);
        if (baseRevision !== current) {
          await client.query('rollback');
          return { status: 409, body: { error: 'revision conflict', revision: current } };
        }
        const next = current + 1;
        await client.query(
          'update lajur_cloud set revision = $2, data = $3, updated_at = now(), updated_by = $4 where workspace = $1',
          [workspace, next, data, actor || null],
        );
        await client.query('commit');
        return { status: 200, body: { revision: next } };
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

async function readRaw(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_DECOMPRESSED_BYTES) throw new Error('Payload terlalu besar.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function send(res, status, body) {
  const raw = Buffer.from(JSON.stringify(body));
  const gz = gzipSync(raw);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-encoding', 'gzip');
  res.setHeader('cache-control', 'no-store');
  res.end(gz);
}

let pool = null;
async function getPool() {
  if (pool) return pool;
  const { default: pg } = await import('pg');
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    ssl: /sslmode=require|neon\.tech/i.test(process.env.DATABASE_URL ?? '')
      ? { rejectUnauthorized: false }
      : undefined,
  });
  // Vercel Fluid compute: release idle clients before the function suspends.
  attachDatabasePool(pool);
  return pool;
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const workspace = url.searchParams.get('workspace') ?? 'lavishome';
    const method = req.method === 'POST' ? 'POST' : req.method === 'GET' ? 'GET' : req.method;
    let payload = {};
    if (method === 'POST') {
      let raw = await readRaw(req);
      if (String(req.headers['content-encoding'] ?? '').includes('gzip')) raw = gunzipSync(raw);
      if (raw.length > MAX_DECOMPRESSED_BYTES) return send(res, 413, { error: 'Payload terlalu besar.' });
      payload = JSON.parse(raw.toString('utf8') || '{}');
    }

    if (!process.env.DATABASE_URL) {
      return send(res, 503, { error: 'DATABASE_URL belum diset di Vercel.' });
    }

    const result = await handleCloud({
      method,
      workspace,
      key: req.headers['x-lajur-key'],
      baseRevision: payload.baseRevision,
      data: payload.data,
      actor: payload.actor,
      syncKey: process.env.LAJUR_SYNC_KEY ?? '',
      db: createPgDb(await getPool()),
    });
    return send(res, result.status, result.body);
  } catch (err) {
    return send(res, 500, { error: err.message || 'Kesalahan server.' });
  }
}
