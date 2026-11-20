/**
 * Optional shared-dataset sync through the Vercel `/api/cloud` function and
 * Neon Postgres. The browser only holds the workspace sync key; DATABASE_URL
 * stays in Vercel environment variables.
 */

const CONFIG_KEY = 'lajur.v2.cloud';
const REVISION_KEY = 'lajur.v2.cloud.revision';
const DIRTY_KEY = 'lajur.v2.cloud.dirty';

export const CLOUD_ERROR = {
  CONFIG: 'Belum dikonfigurasi. Isi kunci sinkronisasi dan workspace.',
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function readCloudConfig() {
  const raw = readJson(CONFIG_KEY, null);
  if (!raw || typeof raw !== 'object') return null;
  const url = String(raw.url || '').trim().replace(/\/+$/, '');
  return {
    url,
    key: String(raw.key ?? raw.secret ?? '').trim(),
    workspace: String(raw.workspace || '').trim(),
    auto: raw.auto !== false,
  };
}

export function cloudConfigured(config = readCloudConfig()) {
  return Boolean(config?.key && config.workspace);
}

export function saveCloudConfig(patch) {
  const next = { ...(readCloudConfig() ?? {}), ...patch };
  next.url = String(next.url || '').trim().replace(/\/+$/, '');
  next.key = String(next.key ?? '').trim();
  next.workspace = String(next.workspace || '').trim();
  next.auto = next.auto !== false;
  delete next.secret;
  delete next.anonKey;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  return next;
}

export function clearCloudConfig() {
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(REVISION_KEY);
  localStorage.removeItem(DIRTY_KEY);
}

/** Local edits not yet accepted by the cloud. */
export function isCloudDirty() {
  return localStorage.getItem(DIRTY_KEY) === '1';
}

export function setCloudDirty(dirty = true) {
  if (dirty) localStorage.setItem(DIRTY_KEY, '1');
  else localStorage.removeItem(DIRTY_KEY);
}

export function getLocalCloudRevision() {
  const value = Number(localStorage.getItem(REVISION_KEY));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function setLocalCloudRevision(revision) {
  localStorage.setItem(REVISION_KEY, String(Number(revision) || 0));
}

function endpoint(config) {
  return `${config.url || ''}/api/cloud?workspace=${encodeURIComponent(config.workspace)}`;
}

async function encodeBody(json) {
  if (typeof CompressionStream === 'undefined') return { body: json, encoding: null };
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const body = await new Response(stream).arrayBuffer();
  return { body, encoding: 'gzip' };
}

async function request(method, { payload = null, config = readCloudConfig() } = {}) {
  if (!cloudConfigured(config)) throw new Error(CLOUD_ERROR.CONFIG);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30_000);
  const headers = {
    'x-lajur-key': config.key,
    accept: 'application/json',
  };
  let body;
  if (payload) {
    const encoded = await encodeBody(JSON.stringify(payload));
    body = encoded.body;
    headers['content-type'] = 'application/json';
    if (encoded.encoding) headers['content-encoding'] = encoded.encoding;
  }

  let response;
  try {
    response = await fetch(endpoint(config), {
      method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'Cloud timeout. Periksa koneksi.' : `Cloud tidak terjangkau: ${err.message}`);
  } finally {
    window.clearTimeout(timer);
  }

  const text = await response.text();
  let result = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = text;
  }
  if (!response.ok) {
    const message = result?.error || result?.message || text || `HTTP ${response.status}`;
    const error = new Error(String(message));
    error.code = result?.code;
    error.status = response.status;
    throw error;
  }
  return result;
}

export async function cloudPull(config = readCloudConfig()) {
  const result = await request('GET', { config });
  return {
    revision: Number(result?.revision) || 0,
    data: result?.data ?? null,
    updatedAt: result?.updatedAt ?? null,
    updatedBy: result?.updatedBy ?? null,
  };
}

export async function cloudPush(data, { baseRevision = 0, actor = '', config = readCloudConfig() } = {}) {
  const result = await request('POST', {
    config,
    payload: { baseRevision: Number(baseRevision) || 0, data, actor },
  });
  return Number(result?.revision) || 0;
}

export async function testCloud(config = readCloudConfig()) {
  return cloudPull(config);
}
