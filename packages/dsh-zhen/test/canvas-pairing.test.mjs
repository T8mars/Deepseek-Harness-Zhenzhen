import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CanvasPairing } from '../lib/canvas-pairing.js';
import { canvasPairingSchema, canvasReadScopes, canvasHandoffScopes } from '../lib/canvas-pairing-schema.js';
import { canvasPairingFixture, assertOriginalCanvasAuthFixtures } from '../../../contracts/fixtures/canvas-pairing.mjs';

async function fixture(t, options) { const f = await canvasPairingFixture(options); t.after(() => f.dispose()); return f; }
test('immutable Canvas auth/client/store fixtures retain their original committed contracts', () => {
  const source = assertOriginalCanvasAuthFixtures(); assert.equal(source.revision, 'e6702dc7770bcbe7d4895be22a06f4c7123a085b');
});
test('default pairing uses original auth HTTP and secureStore, returns human code only, and waits for explicit window approval', async t => {
  const f = await fixture(t), pending = await f.pairing.begin(); assert.equal(pending.state, 'pending');
  assert.deepEqual(pending.scopes, [...canvasReadScopes]); assert.deepEqual(canvasPairingSchema.parse(pending), pending);
  const created = f.state.created[0], metadata = readFileSync(f.file, 'utf8'), native = readFileSync(f.credentialFile, 'utf8');
  for (const secret of [created.pollSecret, created.userCode]) assert.equal(metadata.includes(secret), false);
  assert.equal(native.includes(created.pollSecret), false); assert.equal(JSON.stringify(pending).includes(created.pollSecret), false);
  assert.equal((await f.pairing.complete()).state, 'pending');
  assert.equal(f.originalStore.loadSession(f.state.descriptor.instanceId, f.state.options), null);
  f.approve(); const paired = await f.pairing.complete(); assert.equal(paired.state, 'paired'); assert.equal(paired.userCode, ''); assert.deepEqual(paired.scopes, [...canvasReadScopes]);
  assert.equal(existsSync(f.file), false);
  const session = f.originalStore.loadSession(f.state.descriptor.instanceId, f.state.options);
  assert.equal(JSON.stringify(paired).includes(session.accessToken), false); assert.equal(readFileSync(f.credentialFile, 'utf8').includes(session.accessToken), false);
  assert.equal((await f.pairing.snapshot()).state, 'paired');
  assert.ok(f.state.requests.every(request => !request.path.includes('/approve') && !request.path.includes('/settings') && !request.path.includes('/run')));
});
test('handoff scopes require opt-in; concurrent begin and completion plus Host recovery do not create duplicate requests', async t => {
  const f = await fixture(t), [a, b] = await Promise.all([f.pairing.begin(true), f.pairing.begin(true)]);
  assert.equal(a.userCode, b.userCode); assert.equal(f.state.created.length, 1); assert.deepEqual(a.scopes, [...canvasReadScopes, ...canvasHandoffScopes]);
  f.pairing.close(); const recovered = new CanvasPairing(f.file, f.config); t.after(() => recovered.close());
  assert.equal((await recovered.snapshot()).userCode, a.userCode); f.approve(['canvas:read']);
  const completed = await Promise.all([recovered.complete(), recovered.complete()]); assert.ok(completed.every(item => item.state === 'paired')); assert.deepEqual(completed[0].scopes, ['canvas:read']);
  assert.equal(f.state.requests.filter(request => request.path.endsWith('/poll')).length, 1);
});
test('an unrelated native pending request is neither overwritten nor claimed', async t => {
  const f = await fixture(t), instance = f.state.descriptor;
  const foreign = f.auth.createPairing({ clientName: 'EXAMPLE_OTHER_AGENT', requestedScopes: ['canvas:read'] });
  f.originalStore.storePending(instance, foreign, f.state.options);
  await assert.rejects(f.pairing.begin(), error => error.code === 'PAIRING_ALREADY_PENDING');
  assert.equal((await f.pairing.complete()).state, 'none'); assert.equal(f.state.requests.length, 0);
  assert.equal(f.originalStore.loadPending(instance.instanceId, f.state.options).pairingId, foreign.pairingId);
});
test('denial and ambiguous one-time claim preserve authority and never automatically poll or create a replacement', async t => {
  const f = await fixture(t); await f.pairing.begin(); f.auth.denyPairing(f.state.created[0].pairingId);
  assert.equal((await f.pairing.complete()).state, 'denied'); assert.equal(existsSync(f.file), false);
  await f.pairing.begin(); f.approve(); f.state.dropPoll = true;
  await assert.rejects(f.pairing.complete(), error => error.code === 'APP_CONNECTION_FAILED');
  const count = f.state.requests.length; assert.equal((await f.pairing.snapshot()).state, 'pending'); assert.equal(f.state.requests.length, count);
  assert.equal((await f.pairing.complete()).state, 'none'); assert.equal(f.state.created.length, 2);
  assert.equal(f.originalStore.loadSession(f.state.descriptor.instanceId, f.state.options), null);
  assert.equal((await f.pairing.begin()).state, 'pending'); assert.equal(f.state.created.length, 3);
});
test('configuration changes during pairing acceptance prevent native writes and stale CLI bytes fail before requesting', async t => {
  const f = await fixture(t); f.state.onCreate = () => f.changeConfig({ ...f.config(), instance: 'EXAMPLE_CHANGED_INSTANCE' });
  await assert.rejects(f.pairing.begin(), error => error.code === 'CANVAS_CONFIG_CHANGED'); assert.equal(f.state.storeWrites, 0); assert.equal(existsSync(f.file), false);
  f.changeConfig({ ...f.config(), instance: '' }); f.state.onCreate = undefined;
  writeFileSync(join(f.root, 'src/discovery.cjs'), "throw Error('EXAMPLE_DRIFTED_CLI_MUST_NOT_EXECUTE');");
  await assert.rejects(f.pairing.begin(), error => error.code === 'CLI_CHANGED'); assert.equal(f.state.created.length, 1);
});
test('exact compatibility mismatch prevents creation and secureStore protection failure never returns an access token', async t => {
  const f = await fixture(t); f.state.descriptor.providerCatalogDigest = 'f'.repeat(64);
  await assert.rejects(f.pairing.begin(), error => error.code === 'PROVIDER_CATALOG_DIGEST_MISMATCH'); assert.equal(f.state.created.length, 0);
  f.state.descriptor.providerCatalogDigest = '2'.repeat(64); await f.pairing.begin(); f.approve(); f.state.failProtect = true;
  await assert.rejects(f.pairing.complete(), error => error.code === 'CREDENTIAL_STORE_UNAVAILABLE');
  assert.equal(f.originalStore.loadSession(f.state.descriptor.instanceId, f.state.options), null);
  f.state.failProtect = false; assert.equal((await f.pairing.complete()).state, 'none'); assert.equal(f.state.created.length, 1);
});
test('expired pairing can be explicitly restarted without polling the expired reference', async t => {
  const original = Date.now, f = await fixture(t);
  try { Date.now = () => f.state.clock.value;
    await f.pairing.begin(); f.state.clock.value += 6 * 60 * 1000;
    assert.equal((await f.pairing.snapshot()).state, 'expired'); assert.equal((await f.pairing.complete()).state, 'expired');
    assert.equal(f.state.requests.filter(request => request.path.endsWith('/poll')).length, 0);
    assert.equal((await f.pairing.begin()).state, 'pending'); assert.equal(f.state.created.length, 2);
  } finally { Date.now = original; }
});
test('native Windows DPAPI protects the synthetic pairing and session in system TEMP', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t, { dpapi: true }); await f.pairing.begin(); f.approve();
  assert.equal((await f.pairing.complete()).state, 'paired');
  const data = JSON.parse(readFileSync(f.credentialFile, 'utf8')), session = Object.values(data.sessions)[0];
  assert.equal(session.protection, 'windows-dpapi-current-user'); assert.ok(session.accessTokenProtected); assert.equal('accessToken' in session, false);
});

test('a different native pending request arriving during claim is preserved', async t => {
  const f = await fixture(t); await f.pairing.begin(); f.approve();
  const foreign = f.auth.createPairing({ clientName: 'EXAMPLE_OTHER_AGENT', requestedScopes: ['canvas:read'] });
  f.state.onPoll = () => f.originalStore.storePending(f.state.descriptor, foreign, f.state.options);
  await assert.rejects(f.pairing.complete(), error => error.code === 'PAIRING_PROGRESS_CHANGED');
  assert.equal(f.originalStore.loadPending(f.state.descriptor.instanceId, f.state.options).pairingId, foreign.pairingId);
  assert.equal(f.originalStore.loadSession(f.state.descriptor.instanceId, f.state.options), null);
});

test('Host closure during a one-time claim prevents saving the returned credential', async t => {
  const f = await fixture(t); await f.pairing.begin(); f.approve(); f.state.onPoll = () => f.pairing.close();
  await assert.rejects(f.pairing.complete(), error => error.code === 'CANVAS_CONFIG_CHANGED');
  assert.equal(f.originalStore.loadSession(f.state.descriptor.instanceId, f.state.options), null); assert.equal(f.state.storeWrites, 1);
});

test('unexpected expanded pairing scopes are refused before a poll secret is persisted', async t => {
  const f = await fixture(t); f.state.onCreate = () => { f.state.created[0].requestedScopes.push('run:execute'); };
  await assert.rejects(f.pairing.begin(), error => error.code === 'PAIRING_RESPONSE_INVALID');
  assert.equal(f.state.storeWrites, 0); assert.equal(existsSync(f.credentialFile), false); assert.equal(existsSync(f.file), false);
});

test('concurrent duplicate UI requests share the same ambiguous creation failure without a second POST', async t => {
  const f = await fixture(t); f.state.dropCreate = true;
  const results = await Promise.allSettled([f.pairing.begin(), f.pairing.begin()]);
  assert.ok(results.every(result => result.status === 'rejected' && result.reason.code === 'APP_CONNECTION_FAILED'));
  assert.equal(f.state.created.length, 1); assert.equal(f.state.storeWrites, 0); assert.equal(existsSync(f.file), false);
});

test('an unrelated pending request arriving during creation is preserved before native storage', async t => {
  const f = await fixture(t), foreign = f.auth.createPairing({ clientName: 'EXAMPLE_OTHER_AGENT' });
  f.state.onCreate = () => f.originalStore.storePending(f.state.descriptor, foreign, f.state.options);
  await assert.rejects(f.pairing.begin(), error => error.code === 'PAIRING_PROGRESS_CHANGED');
  assert.equal(f.state.storeWrites, 0); assert.equal(existsSync(f.file), false);
  assert.equal(f.originalStore.loadPending(f.state.descriptor.instanceId, f.state.options).pairingId, foreign.pairingId);
});

test('original CLI completion remains visible after the old UI locator expires', async t => {
  const original = Date.now, f = await fixture(t);
  try { Date.now = () => f.state.clock.value; await f.pairing.begin(); f.approve();
    const created = f.state.created[0];
    const result = f.auth.pollPairing({ pairingId: created.pairingId, pollSecret: created.pollSecret });
    f.originalStore.storeSession(f.state.descriptor, result, f.state.options);
    f.state.clock.value += 6 * 60 * 1000;
    assert.equal((await f.pairing.snapshot()).state, 'paired'); assert.equal((await f.pairing.complete()).state, 'paired'); assert.equal(existsSync(f.file), false);
  } finally { Date.now = original; }
});
