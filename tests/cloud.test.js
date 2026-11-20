import test from 'node:test';
import assert from 'node:assert/strict';

import { handleCloud } from '../api/cloud.js';

function installBrowserStubs() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
  globalThis.window = globalThis;
  globalThis.CompressionStream = undefined;
  return store;
}

test('cloud config normalizes the API URL and sync key', async () => {
  installBrowserStubs();
  const cloud = await import('../src/data/cloud.js');
  assert.equal(cloud.cloudConfigured(), false);

  const saved = cloud.saveCloudConfig({
    url: 'https://app.example.com/',
    workspace: ' lavishome ',
    key: 'a-long-sync-key',
  });
  assert.equal(saved.url, 'https://app.example.com');
  assert.equal(saved.workspace, 'lavishome');
  assert.equal(saved.auto, true);
  assert.equal(cloud.cloudConfigured(saved), true);

  const read = cloud.readCloudConfig();
  assert.equal(read.url, 'https://app.example.com');
  assert.equal(read.key, 'a-long-sync-key');
  assert.equal(cloud.isCloudDirty(), false);
  cloud.setCloudDirty(true);
  assert.equal(cloud.isCloudDirty(), true);
  cloud.setCloudDirty(false);
  assert.equal(cloud.isCloudDirty(), false);
});

test('cloud revision is stored locally and reset when cloud is disabled', async () => {
  installBrowserStubs();
  const cloud = await import('../src/data/cloud.js');
  assert.equal(cloud.getLocalCloudRevision(), 0);
  cloud.setLocalCloudRevision(12);
  assert.equal(cloud.getLocalCloudRevision(), 12);
  cloud.saveCloudConfig({
    url: '',
    workspace: 'lavishome',
    key: 'a-long-sync-key',
  });
  cloud.clearCloudConfig();
  assert.equal(cloud.readCloudConfig(), null);
  assert.equal(cloud.getLocalCloudRevision(), 0);
});

test('cloud push calls /api/cloud with the sync key and base revision', async () => {
  installBrowserStubs();
  const cloud = await import('../src/data/cloud.js');
  const config = {
    url: 'https://app.example.com',
    workspace: 'lavishome',
    key: 'a-long-sync-key',
    auto: true,
  };
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, status: 200, text: async () => JSON.stringify({ revision: 5 }) };
  };

  const revision = await cloud.cloudPush({ meta: { version: 20 } }, { baseRevision: 4, actor: 'manager', config });
  assert.equal(revision, 5);
  assert.equal(captured.url, 'https://app.example.com/api/cloud?workspace=lavishome');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers['x-lajur-key'], config.key);
  const body = JSON.parse(captured.options.body);
  assert.equal(body.baseRevision, 4);
  assert.equal(body.actor, 'manager');
  assert.deepEqual(body.data, { meta: { version: 20 } });
});

test('cloud pull reads the shared revision over GET', async () => {
  installBrowserStubs();
  const cloud = await import('../src/data/cloud.js');
  const config = { url: '', workspace: 'lavishome', key: 'a-long-sync-key', auto: true };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ revision: 9, data: { meta: { version: 20 } } }),
  });
  const result = await cloud.cloudPull(config);
  assert.equal(result.revision, 9);
  assert.deepEqual(result.data, { meta: { version: 20 } });
});

test('API rejects a missing or wrong sync key before touching the database', async () => {
  const db = {
    get: async () => { throw new Error('must not read'); },
    push: async () => { throw new Error('must not write'); },
  };
  const missing = await handleCloud({ method: 'GET', workspace: 'lavishome', key: '', db, syncKey: '' });
  assert.equal(missing.status, 503);
  const wrong = await handleCloud({ method: 'GET', workspace: 'lavishome', key: 'wrong-key', db, syncKey: 'correct-key' });
  assert.equal(wrong.status, 401);
});

test('API returns the shared dataset and validates pushes', async () => {
  const db = {
    get: async () => ({ revision: 3, data: { rolls: 1 }, updatedAt: null, updatedBy: null }),
    push: async (workspace, baseRevision, data, actor) => ({
      status: 200,
      body: { revision: baseRevision + 1, workspace, actor, rolls: data.rolls },
    }),
  };
  const common = { workspace: 'lavishome', key: 'correct-key', db, syncKey: 'correct-key' };

  const read = await handleCloud({ ...common, method: 'GET' });
  assert.equal(read.status, 200);
  assert.equal(read.body.revision, 3);

  const invalid = await handleCloud({ ...common, method: 'POST', baseRevision: 3, data: [] });
  assert.equal(invalid.status, 422);

  const written = await handleCloud({ ...common, method: 'POST', baseRevision: 3, data: { rolls: 2 }, actor: 'manager' });
  assert.equal(written.status, 200);
  assert.equal(written.body.revision, 4);
  assert.equal(written.body.rolls, 2);

  const badWorkspace = await handleCloud({ ...common, workspace: '../etc', method: 'GET' });
  assert.equal(badWorkspace.status, 400);
});
