import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { UpdateMonitor, discoverUpdates, readPublic } from '../lib/updates.js';

const revision = 'e'.repeat(40);
const docs = 'EXAMPLE ONLY public API documentation';
const baseline = { dsh: '0.2.1-rc.2', canvas: '3.3.6', canvasRevision: 'f'.repeat(40), zhen: '0.1.0', gateway: createHash('sha256').update(docs).digest('hex') };
function fixtureFetch(observe = () => {}) {
  return async (url, options) => {
    observe(url, options);
    if (url.includes('registry.npmjs.org')) return Response.json({ name: '@deepseek-ai/dsh', version: '0.2.2-rc.1', dist: { integrity: 'sha512-RVhBTVBMRU9OTFk=' } });
    if (url.includes('/commits/main')) return Response.json({ sha: revision });
    if (url.includes('raw.githubusercontent.com')) return Response.json({ version: '3.3.6' });
    if (url.includes('/releases')) return Response.json([]);
    return new Response(docs);
  };
}

test('public update discovery pins canvas metadata to the discovered commit and keeps feeds distinct', async () => {
  const calls = [];
  const sources = await discoverUpdates(baseline, fixtureFetch((url, options) => calls.push({ url, options })));
  assert.equal(sources.find(source => source.id === 'dsh').changed, true);
  assert.equal(sources.find(source => source.id === 'canvas').changed, true, 'same version with a different source revision is still a candidate');
  assert.equal(sources.find(source => source.id === 'zhen').state, 'unpublished');
  assert.equal(sources.find(source => source.id === 'gateway').changed, false);
  assert.ok(calls.some(call => call.url.includes(`/${revision}/package.json`)));
  for (const call of calls) {
    assert.equal(call.options.method, 'GET'); assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.headers.Authorization, undefined);
    assert.equal(call.options.body, undefined);
  }
});

test('malformed or unavailable feeds fail closed without leaking response bodies or thrown errors', async () => {
  const sources = await discoverUpdates(baseline, async () => { throw new Error('EXAMPLE_ONLY_SENSITIVE_DIAGNOSTIC'); });
  assert.ok(sources.every(source => source.state === 'error' && !source.changed));
  assert.equal(JSON.stringify(sources).includes('EXAMPLE_ONLY_SENSITIVE_DIAGNOSTIC'), false);
  const invalid = await discoverUpdates(baseline, async () => Response.json({ version: '$(EXAMPLE_ONLY_COMMAND)', sha: '../EXAMPLE_ONLY' }));
  assert.equal(invalid.find(source => source.id === 'dsh').state, 'error');
  await assert.rejects(readPublic('http://127.0.0.1/EXAMPLE_ONLY', fixtureFetch()), /origin/);
  await assert.rejects(readPublic('https://api.github.com/EXAMPLE_ONLY', async () => new Response('x'.repeat(4 * 1024 * 1024 + 1))), /limit/);
});

test('automatic metadata checks are daily, single-flight, user-disableable, and persistent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-updates-'));
  const file = join(root, 'updates.json');
  let calls = 0;
  const monitor = new UpdateMonitor(file, baseline, fixtureFetch(() => { calls++; }));
  try {
    await Promise.all([monitor.check(), monitor.check()]);
    assert.equal(calls, 5);
    await monitor.automaticCheck(); assert.equal(calls, 5);
    monitor.setAutomatic(false);
    assert.equal(new UpdateMonitor(file, baseline).snapshot().automatic, false);
    await monitor.automaticCheck(); assert.equal(calls, 5);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('bundle baseline changes invalidate cached versions without writing files or enabling automatic checks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-updates-EXAMPLE-')), file = join(root, 'updates.json');
  try {
    const original = new UpdateMonitor(file, baseline, fixtureFetch());
    await original.check(); original.setAutomatic(false);
    const bytes = readFileSync(file);
    for (const change of [{ dsh: '0.2.1-rc.3' }, { canvas: '3.4.0' }, { zhen: '0.1.0-canary.1' }, { gateway: 'a'.repeat(64) }]) {
      let requests = 0;
      const monitor = new UpdateMonitor(file, { ...baseline, ...change }, fixtureFetch(() => { requests++; }));
      assert.deepEqual(monitor.snapshot(), { checkedAt: '', automatic: false, sources: [] });
      await monitor.automaticCheck(); assert.equal(requests, 0);
      assert.deepEqual(readFileSync(file), bytes, 'reading stale metadata must preserve the original receipt');
    }
    assert.equal(new UpdateMonitor(file, baseline).snapshot().sources.length, 4, 'an unchanged bundle retains its valid cache');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an already enabled daily check refreshes a changed baseline once and saves current versions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-updates-EXAMPLE-')), file = join(root, 'updates.json');
  try {
    await new UpdateMonitor(file, baseline, fixtureFetch()).check();
    let requests = 0;
    const next = { ...baseline, dsh: '0.2.1-rc.3' }, monitor = new UpdateMonitor(file, next, fixtureFetch(() => { requests++; }));
    assert.deepEqual(monitor.snapshot(), { checkedAt: '', automatic: true, sources: [] });
    await Promise.all([monitor.automaticCheck(), monitor.automaticCheck()]);
    assert.equal(requests, 5); assert.equal(monitor.snapshot().sources.find(source => source.id === 'dsh').current, next.dsh);
    assert.equal(monitor.snapshot().automatic, true); assert.notEqual(monitor.snapshot().checkedAt, '');
    await monitor.automaticCheck(); assert.equal(requests, 5);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
