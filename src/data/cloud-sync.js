/**
 * Cloud sync orchestration: pull on start, debounced push after local writes.
 * Only the `main` dataset is synced; the simulation dataset stays local.
 */

import { store } from './store.js';
import { BACKUP_FORMAT, BACKUP_VERSION } from './backup.js';
import {
  cloudConfigured, cloudPull, cloudPush, getLocalCloudRevision, isCloudDirty, readCloudConfig,
  setCloudDirty, setLocalCloudRevision,
} from './cloud.js';

const listeners = new Set();
const status = { state: 'off', message: 'Cloud sync belum aktif', revision: 0, at: null };
let started = false;
let applyingRemote = false;
let pushTimer = 0;
let pushing = false;

function publish(patch) {
  Object.assign(status, patch, { at: new Date().toISOString() });
  for (const fn of listeners) fn({ ...status });
}

export function cloudStatus() {
  return { ...status };
}

export function subscribeCloud(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyRemote(data) {
  applyingRemote = true;
  try {
    store.restore({ format: BACKUP_FORMAT, version: BACKUP_VERSION, data });
  } finally {
    applyingRemote = false;
  }
}

function schedulePush() {
  const config = readCloudConfig();
  if (!cloudConfigured(config) || !config.auto || applyingRemote || store.dataset !== 'main') return;
  setCloudDirty(true);
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => { pushNow(); }, 1200);
}

async function pushNow({ force = false } = {}) {
  const config = readCloudConfig();
  if (!cloudConfigured(config) || (!config.auto && !force)) return;
  if (pushing) return;
  pushing = true;
  publish({ state: 'syncing', message: 'Mengirim ke cloud…' });
  try {
    const base = getLocalCloudRevision();
    let revision;
    try {
      revision = await cloudPush(store.db, { baseRevision: base, actor: store.ui?.role ?? '', config });
    } catch (err) {
      // Revision conflict: pull the latest revision, then apply local as the
      // newest write. The whole document is intentionally last-write-wins.
      const remote = await cloudPull(config);
      if (!remote.data) throw err;
      revision = await cloudPush(store.db, { baseRevision: remote.revision, actor: store.ui?.role ?? '', config });
    }
    setLocalCloudRevision(revision);
    setCloudDirty(false);
    publish({ state: 'ok', message: `Tersimpan ke cloud · revisi ${revision}`, revision });
  } catch (err) {
    publish({ state: 'error', message: err.message || 'Gagal mengirim ke cloud' });
  } finally {
    pushing = false;
  }
}

export async function pullNow({ silent = false, preferRemote = false } = {}) {
  const config = readCloudConfig();
  if (!cloudConfigured(config)) {
    publish({ state: 'off', message: 'Isi konfigurasi Supabase terlebih dahulu.' });
    return null;
  }
  publish({ state: 'syncing', message: silent ? 'Memeriksa cloud…' : 'Menarik data dari cloud…' });
  try {
    const remote = await cloudPull(config);
    const localRevision = getLocalCloudRevision();
    if (!remote.data || remote.revision === 0) {
      await pushNow({ force: true });
      return remote;
    }
    // Offline edits win over an equal or older cloud copy. If the cloud has a
    // newer revision, the pending local write is still pushed: this is the
    // documented last-write-wins behaviour, never a silent local overwrite.
    if (!preferRemote && (isCloudDirty() || remote.revision < localRevision)) {
      await pushNow({ force: true });
    } else if (preferRemote || remote.revision >= localRevision) {
      applyRemote(remote.data);
      setLocalCloudRevision(remote.revision);
      setCloudDirty(false);
      publish({ state: 'ok', message: `Ditarik dari cloud · revisi ${remote.revision}`, revision: remote.revision });
    }
    return remote;
  } catch (err) {
    publish({ state: 'error', message: err.message || 'Gagal menarik data cloud' });
    return null;
  }
}

export function startCloudSync() {
  if (!started) {
    started = true;
    window.addEventListener('lajur:persist', schedulePush);
    window.addEventListener('online', () => schedulePush());
  }
  const config = readCloudConfig();
  if (!cloudConfigured(config)) {
    publish({ state: 'off', message: 'Cloud sync belum dikonfigurasi' });
    return Promise.resolve(null);
  }
  return pullNow({ silent: true });
}

export function syncNow() {
  return pushNow({ force: true });
}
