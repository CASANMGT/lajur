/**
 * Optional Supabase cloud sync.
 *
 * The browser talks to two SECURITY DEFINER RPC functions only:
 *   lajur_cloud_pull(workspace, key)
 *   lajur_cloud_push(workspace, key, base_revision, data, actor)
 *
 * The anon key is public by design; the workspace secret is the write
 * credential and is kept in this browser's localStorage. Run db/supabase.sql
 * once in the Supabase SQL editor before enabling sync.
 */

const CONFIG_KEY = 'lajur.v2.cloud';
const REVISION_KEY = 'lajur.v2.cloud.revision';
const DIRTY_KEY = 'lajur.v2.cloud.dirty';

export const CLOUD_ERROR = {
  CONFIG: 'Belum dikonfigurasi. Isi URL proyek, anon key, workspace dan kunci workspace.',
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
    anonKey: String(raw.anonKey || '').trim(),
    workspace: String(raw.workspace || '').trim(),
    secret: String(raw.secret || '').trim(),
    auto: raw.auto !== false,
  };
}

export function cloudConfigured(config = readCloudConfig()) {
  return Boolean(config?.url && config.anonKey && config.workspace && config.secret);
}

export function saveCloudConfig(patch) {
  const next = { ...(readCloudConfig() ?? {}), ...patch };
  next.url = String(next.url || '').trim().replace(/\/+$/, '');
  next.anonKey = String(next.anonKey || '').trim();
  next.workspace = String(next.workspace || '').trim();
  next.secret = String(next.secret || '').trim();
  next.auto = next.auto !== false;
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

async function rpc(name, payload, config = readCloudConfig()) {
  if (!cloudConfigured(config)) throw new Error(CLOUD_ERROR.CONFIG);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 25_000);
  let response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${config.anonKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'Cloud timeout. Periksa koneksi.' : `Cloud tidak terjangkau: ${err.message}`);
  } finally {
    window.clearTimeout(timer);
  }

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = body?.message || body?.error || text || `HTTP ${response.status}`;
    const error = new Error(String(message));
    error.code = body?.code;
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function cloudPull(config = readCloudConfig()) {
  const result = await rpc('lajur_cloud_pull', {
    p_workspace: config.workspace,
    p_key: config.secret,
  }, config);
  return {
    revision: Number(result?.revision) || 0,
    data: result?.data ?? null,
    updatedAt: result?.updatedAt ?? null,
    updatedBy: result?.updatedBy ?? null,
  };
}

export async function cloudPush(data, { baseRevision = 0, actor = '', config = readCloudConfig() } = {}) {
  const result = await rpc('lajur_cloud_push', {
    p_workspace: config.workspace,
    p_key: config.secret,
    p_base_revision: Number(baseRevision) || 0,
    p_data: data,
    p_actor: actor,
  }, config);
  return Number(result?.revision) || 0;
}

export async function testCloud(config = readCloudConfig()) {
  const result = await cloudPull(config);
  return result;
}
