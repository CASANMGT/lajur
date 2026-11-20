import test from 'node:test';
import assert from 'node:assert/strict';

function installBrowserStubs() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
  globalThis.window = globalThis;
  return store;
}

test('cloud config normalizes the URL and validates required fields', async () => {
  installBrowserStubs();
  const cloud = await import('../src/data/cloud.js');
  assert.equal(cloud.cloudConfigured(), false);

  const saved = cloud.saveCloudConfig({
    url: 'https://demo.supabase.co/',
    anonKey: 'sb_publishable_demo_key_123456',
    workspace: ' lavishome ',
    secret: 'a-long-workspace-secret',
  });
  assert.equal(saved.url, 'https://demo.supabase.co');
  assert.equal(saved.workspace, 'lavishome');
  assert.equal(saved.auto, true);
  assert.equal(cloud.cloudConfigured(saved), true);

  const read = cloud.readCloudConfig();
  assert.equal(read.url, 'https://demo.supabase.co');
  assert.equal(read.secret, 'a-long-workspace-secret');
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
    url: 'https://demo.supabase.co',
    anonKey: 'sb_publishable_demo_key_123456',
    workspace: 'lavishome',
    secret: 'a-long-workspace-secret',
  });
  cloud.clearCloudConfig();
  assert.equal(cloud.readCloudConfig(), null);
  assert.equal(cloud.getLocalCloudRevision(), 0);
});

test('cloud push calls the Supabase RPC with the workspace secret and base revision', async () => {
  installBrowserStubs();
  const cloud = await import('../src/data/cloud.js');
  const config = {
    url: 'https://demo.supabase.co',
    anonKey: 'sb_publishable_demo_key_123456',
    workspace: 'lavishome',
    secret: 'a-long-workspace-secret',
    auto: true,
  };
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, status: 200, text: async () => JSON.stringify({ revision: 5 }) };
  };

  const revision = await cloud.cloudPush({ meta: { version: 20 } }, { baseRevision: 4, actor: 'manager', config });
  assert.equal(revision, 5);
  assert.equal(captured.url, 'https://demo.supabase.co/rest/v1/rpc/lajur_cloud_push');
  assert.equal(captured.options.headers.apikey, config.anonKey);
  const body = JSON.parse(captured.options.body);
  assert.equal(body.p_workspace, 'lavishome');
  assert.equal(body.p_key, 'a-long-workspace-secret');
  assert.equal(body.p_base_revision, 4);
  assert.deepEqual(body.p_data, { meta: { version: 20 } });
});
