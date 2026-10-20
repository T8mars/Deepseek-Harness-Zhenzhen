import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, readFileSync, rmSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { GatewayTasks, parseGatewayTask, readGatewayTask, GATEWAY_TASK_PATHS } from '../lib/gateway-tasks.js';
import { gatewayTaskSpecSchema } from '../lib/gateway-task-schema.js';
import { exampleTask, exampleTaskId } from '../../../contracts/fixtures/gateway-tasks.mjs';
const spec = { protocol: 'image', taskId: exampleTaskId };
function store(t, fetcher, key = async () => 'EXAMPLE_TEST_ONLY_KEY') {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-zhen-task-test-'))), file = join(root, 'tasks.sqlite');
  let time = Date.now(); const value = new GatewayTasks(file, key, fetcher, () => time);
  t.after(async () => { await value.close(); const rel = relative(realpathSync.native(tmpdir()), root); assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..')); rmSync(root, { recursive: true, force: true }); });
  return { value, file, now: () => time, advance: ms => { time += ms; } };
}

test('eight task protocols preserve status/final usage while discarding provider text, cost and signed URLs', () => {
  for (const protocol of Object.keys(GATEWAY_TASK_PATHS)) {
    const value = parseGatewayTask({ protocol, taskId: exampleTaskId }, exampleTask(protocol));
    assert.equal(value.status, 'succeeded'); assert.equal(value.usage.amount, 1.23456789); assert.ok(value.resultCount > 0);
    const text = JSON.stringify(value); for (const secret of ['PRIVATE', 'SIGNATURE', 'lyrics', 'cost', 'quota', 'https:']) assert.equal(text.includes(secret), false);
  }
  assert.equal(parseGatewayTask(spec, exampleTask('image')).resultCount, 2);
  for (const protocol of ['image', 'audio', 'three-d', 'legacy-video']) assert.ok(parseGatewayTask({ protocol, taskId: exampleTaskId }, exampleTask(protocol, { record: { result_url: undefined } })).resultCount > 0);
  assert.equal(parseGatewayTask(spec, exampleTask('image', { record: { status: 'IN_PROGRESS' } })).usage, null);
  assert.equal(parseGatewayTask(spec, exampleTask('image', { record: { usage: undefined } })).usage, null);
  assert.equal(parseGatewayTask(spec, exampleTask('image', { record: { status: 'FAILURE', usage: { amount: 0, currency: 'CNY' } } })).usage.amount, 0);
});

test('query transports use eight exact authenticated GET endpoints without redirects, media downloads or retries', async () => {
  let calls = 0;
  for (const protocol of Object.keys(GATEWAY_TASK_PATHS)) {
    await readGatewayTask({ protocol, taskId: exampleTaskId }, 'EXAMPLE_TEST_ONLY_KEY', async (url, options) => {
      calls++; assert.equal(url, `https://api.seedance.nz${GATEWAY_TASK_PATHS[protocol]}${exampleTaskId}`);
      assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, 'Bearer EXAMPLE_TEST_ONLY_KEY'); assert.ok(options.signal);
      return Response.json(exampleTask(protocol));
    });
  }
  assert.equal(calls, 8);
  for (const [status, code] of [[401, 'AUTH'], [403, 'AUTH'], [404, 'NOT_FOUND'], [429, 'RATE_LIMIT'], [503, 'SERVER'], [400, 'RESPONSE']]) {
    await assert.rejects(readGatewayTask(spec, 'EXAMPLE_TEST_ONLY_KEY', async () => new Response('EXAMPLE_PRIVATE_RESPONSE', { status })), error => error.code === code && !error.message.includes('PRIVATE'));
  }
  let failures = 0;
  await assert.rejects(readGatewayTask(spec, 'EXAMPLE_TEST_ONLY_KEY', async () => { failures++; throw new Error('EXAMPLE_TEST_ONLY_KEY'); }), error => error.code === 'NETWORK' && !error.message.includes('KEY'));
  assert.equal(failures, 1);
  const interrupted = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"data":')); controller.error(new Error('EXAMPLE_PRIVATE_CONNECTION_FAILURE')); } }));
  await assert.rejects(readGatewayTask(spec, 'EXAMPLE_TEST_ONLY_KEY', async () => interrupted), error => error.code === 'NETWORK' && !error.message.includes('PRIVATE'));
});

test('mismatched identities, envelopes, invalid UTF8 and oversized responses fail closed; progress never implies completion', async () => {
  assert.throws(() => parseGatewayTask(spec, exampleTask('image', { id: 'task_EXAMPLE_DIFFERENT' })));
  assert.throws(() => parseGatewayTask(spec, { code: 401, data: exampleTask('image').data }));
  const unknown = parseGatewayTask(spec, exampleTask('image', { record: { status: 'NEW_PROVIDER_STATE', progress: 100 } }));
  assert.equal(unknown.status, 'unknown'); assert.equal(unknown.usage, null);
  assert.equal(parseGatewayTask(spec, exampleTask('image', { record: { progress: '1000%' } })).progress, null);
  assert.equal(parseGatewayTask(spec, exampleTask('image', { record: { usage: { amount: -1, currency: 'CNY' } } })).usage, null);
  for (const response of [new Response('x'.repeat(1048577)), new Response(new Uint8Array([255])), new Response('EXAMPLE_INVALID_JSON')]) await assert.rejects(readGatewayTask(spec, 'EXAMPLE_TEST_ONLY_KEY', async () => response), error => error.code === 'RESPONSE');
});

test('tracking is opt-in, single-flight, persisted across reopen, and terminal records stop automatic reads', async t => {
  let reads = 0, keys = 0;
  const f = store(t, async () => { reads++; return Response.json(exampleTask('image', { record: { status: reads < 2 ? 'IN_PROGRESS' : 'SUCCESS' } })); }, async () => { keys++; return 'EXAMPLE_TEST_ONLY_KEY'; });
  const item = f.value.add(spec); assert.equal(item.tracking, false); await f.value.automatic(); assert.equal(reads, 0); assert.equal(keys, 0);
  f.value.tracking(item.id, true); const a = f.value.refresh(item.id), b = f.value.refresh(item.id); assert.equal(a, b);
  assert.equal((await a).querying, false); assert.equal(reads, 1); await f.value.refresh(item.id); assert.equal(reads, 1);
  await f.value.close(); const reopened = new GatewayTasks(f.file, async () => 'EXAMPLE_TEST_ONLY_KEY', async () => { reads++; return Response.json(exampleTask('image')); }, f.now);
  try { assert.equal(reopened.list()[0].tracking, true); f.advance(5001); await reopened.automatic(); assert.equal(reads, 2); assert.equal(reopened.list()[0].tracking, false); await reopened.automatic(); assert.equal(reads, 2); }
  finally { await reopened.close(); }
});

test('rate limits honor Retry-After and manual refresh cannot bypass persisted backoff or fabricate failed status', async t => {
  let calls = 0;
  const f = store(t, async () => { calls++; return calls === 1 ? Response.json(exampleTask('image', { record: { status: 'IN_PROGRESS' } })) : new Response('EXAMPLE_PRIVATE_LIMIT', { status: 429, headers: { 'Retry-After': '60' } }); });
  const item = f.value.add(spec); f.value.tracking(item.id, true); await f.value.refresh(item.id); f.advance(5001);
  const limited = await f.value.refresh(item.id); assert.equal(limited.code, 'RATE_LIMIT'); assert.equal(limited.status, 'running'); assert.equal(Date.parse(limited.nextCheckAt) - f.now(), 60000);
  await f.value.refresh(item.id); await f.value.automatic(); assert.equal(calls, 2); f.advance(60001); await f.value.automatic(); assert.equal(calls, 3);
});

test('SQLite records never retain keys, prompt/lyrics, provider failures, signed media or old cost fields', async t => {
  const f = store(t, async () => Response.json(exampleTask('music'))), item = f.value.add({ protocol: 'music', taskId: exampleTaskId });
  await f.value.refresh(item.id); await f.value.close(); const text = readFileSync(f.file).toString('utf8');
  for (const forbidden of ['EXAMPLE_TEST_ONLY_KEY', 'EXAMPLE_PRIVATE', 'EXAMPLE_SIGNATURE', 'https://', 'credits_cost', 'cost']) assert.equal(text.includes(forbidden), false, forbidden);
  assert.ok(text.includes(exampleTaskId));
});

test('credential changes abort in-flight reads, pause tracking, and discard responses completed under the old generation', async t => {
  let started; const began = new Promise(resolve => { started = resolve; });
  const f = store(t, async (_url, options) => { started(); return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('EXAMPLE_OLD_KEY_PRIVATE_URL')), { once: true })); });
  const item = f.value.add(spec); f.value.tracking(item.id, true); const pending = f.value.refresh(item.id); await began; f.value.invalidate();
  const cancelled = await pending; assert.equal(cancelled.code, 'CONFIG_CHANGED'); assert.equal(cancelled.tracking, false); assert.equal(cancelled.status, 'unknown'); assert.equal(cancelled.resultCount, 0);
});

test('removing a local record during a read never recreates it or deletes the provider task', async t => {
  let started; const began = new Promise(resolve => { started = resolve; }); let calls = 0;
  const f = store(t, async (_url, options) => { calls++; started(); return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('EXAMPLE_ABORT')), { once: true })); });
  const item = f.value.add(spec), pending = f.value.refresh(item.id); await began; f.value.remove(item.id);
  await assert.rejects(pending, error => error.code === 'NOT_FOUND'); assert.deepEqual(f.value.list(), []); assert.equal(calls, 1);
});

test('closed inputs reject arbitrary URLs, credentials, unsafe ids and unknown protocols; duplicates and record limits preserve existing data', async t => {
  for (const input of [{ ...spec, taskId: '../EXAMPLE' }, { ...spec, taskId: 'https://example.com/task' }, { ...spec, taskId: 'sk-EXAMPLE_SECRET' }, { ...spec, endpoint: '/v1/videos' }, { ...spec, protocol: 'arbitrary' }]) assert.equal(gatewayTaskSpecSchema.safeParse(input).success, false);
  const f = store(t, async () => { throw new Error('EXAMPLE_MUST_NOT_REQUEST'); });
  const item = f.value.add(spec); assert.equal(f.value.add(spec).id, item.id);
  for (let i = 1; i < 100; i++) f.value.add({ ...spec, taskId: `task_EXAMPLE_${i}` });
  assert.throws(() => f.value.add({ ...spec, taskId: 'task_EXAMPLE_OVER_LIMIT' })); assert.equal(f.value.list().length, 100);
  await f.value.close(); const db = new DatabaseSync(f.file); db.exec('PRAGMA user_version=2'); db.close();
  assert.throws(() => new GatewayTasks(f.file, async () => undefined), error => error.code === 'UNAVAILABLE');
});
