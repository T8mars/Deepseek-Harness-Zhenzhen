import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GithubAccess } from '../lib/github-access.js';
import { SkillFeed } from '../lib/skill-feed.js';
import { SkillMarket, readBundledCatalog } from '../lib/market.js';
import { discoverUpdates } from '../lib/updates.js';
const token = 'EXAMPLE_GITHUB_READ_ONLY_TOKEN_000000000000', revision = 'c'.repeat(40), repo = 'T8mars/Deepseek-Harness-Zhenzhen';
test('anonymous access preserves public paths and sends no credential headers', async () => {
  const calls = [], access = new GithubAccess(async () => undefined, async (url, options) => { calls.push({ url, options }); return new Response('{}'); }), source = await access.begin();
  try { await source.commit(); await source.feed(revision, 1024); assert.equal(calls[1].url, `https://raw.githubusercontent.com/${repo}/${revision}/market/skills.v1.json`); assert.ok(calls.every(call => !('Authorization' in call.options.headers))); } finally { source.close(); access.close(); }
});
test('authenticated access is fixed to one repository, pinned contents endpoint and raw media type without redirects', async () => {
  const calls = [], access = new GithubAccess(async () => token, async (url, options) => { calls.push({ url, options }); return new Response('{}'); }), source = await access.begin();
  try { await source.commit(); await source.feed(revision, 1024); await source.releases(); assert.equal(calls.length, 3); for (const { url, options } of calls) { assert.ok(url.startsWith(`https://api.github.com/repos/${repo}/`)); assert.equal(options.headers.Authorization, `Bearer ${token}`); assert.equal(options.redirect, 'error'); assert.equal(options.method, 'GET'); } assert.equal(calls[1].options.headers.Accept, 'application/vnd.github.raw+json'); assert.ok(calls[1].url.endsWith(`?ref=${revision}`)); await assert.rejects(source.feed('../EXAMPLE', 1024)); assert.equal(calls.length, 3); } finally { source.close(); access.close(); }
});
test('authentication, hidden repositories, rate limits and redirects return safe errors without reading echoed bodies', async () => {
  for (const [status, headers, expected] of [[401, {}, 'AUTH'], [403, {}, 'AUTH'], [403, { 'x-ratelimit-remaining': '0' }, 'RATE_LIMIT'], [404, {}, 'NOT_FOUND'], [429, {}, 'RATE_LIMIT'], [302, { Location: 'https://example.invalid/EXAMPLE' }, 'UNAVAILABLE']]) {
    const access = new GithubAccess(async () => token, async () => new Response(token, { status, headers })), source = await access.begin(); try { await assert.rejects(source.commit(), error => error.code === expected && !error.message.includes(token)); } finally { source.close(); access.close(); }
  }
});
test('stream byte limits cancel the body and credential invalidation aborts every pending session', async () => {
  let cancelled = false; const access = new GithubAccess(async () => token, async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4096)); }, cancel() { cancelled = true; } }))), source = await access.begin();
  try { await assert.rejects(source.feed(revision, 32), error => error.code === 'RESPONSE'); assert.equal(cancelled, true); } finally { source.close(); access.close(); }
  const signals = []; let release; const started = new Promise(done => { release = done; });
  const pending = new GithubAccess(async () => token, async (_url, options) => { signals.push(options.signal); if (signals.length === 2) release(); await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('EXAMPLE_ABORT')), { once: true })); });
  const a = await pending.begin(), b = await pending.begin(), checks = Promise.allSettled([a.commit(), b.releases()]); await started; pending.invalidate(); const result = await checks; assert.ok(signals.every(signal => signal.aborted)); assert.ok(result.every(item => item.status === 'rejected' && item.reason.code === 'CHANGED')); a.close(); b.close(); pending.close();
});
test('credential changes outside the owner setter are checked again after the response', async () => {
  let current = token; const access = new GithubAccess(async () => current, async () => { current = 'EXAMPLE_REPLACED_TOKEN'; return new Response('{}'); }), source = await access.begin();
  try { await assert.rejects(source.commit(), error => error.code === 'CHANGED'); } finally { source.close(); access.close(); }
});
test('private feed checks record verified candidates without leaking credentials, and late revocation preserves the last cache', async t => {
  const root = mkdtempSync(join(tmpdir(), 'EXAMPLE_private_feed_')), catalog = readBundledCatalog(), market = new SkillMarket(join(root, 'skills.sqlite'), catalog); t.after(() => { market.close(); rmSync(root, { recursive: true, force: true }); });
  let revoke = false, access; const fetcher = async url => { if (url.endsWith('/commits/main')) return Response.json({ sha: revision }); if (revoke) access.invalidate(); return Response.json({ schemaVersion: 1, publisher: repo, skills: catalog }); };
  access = new GithubAccess(async () => token, fetcher); t.after(() => access.close()); const file = join(root, 'feed.json'), feed = new SkillFeed(file, market, fetcher, access);
  const result = await feed.check(); assert.equal(result.state, 'checked'); assert.equal(result.count, 15); assert.equal(market.hasVerifiedFeed(catalog, revision), true); assert.equal(readFileSync(file, 'utf8').includes(token), false);
  revoke = true; const failed = await feed.check(); assert.equal(failed.state, 'error'); assert.ok(failed.message.includes('旧检查已停止')); assert.equal(failed.revision, revision); assert.equal(failed.count, 15); assert.equal(market.hasVerifiedFeed(catalog, revision), true);
});
test('private release reads share access while public upstream/gateway checks remain anonymous', async () => {
  const calls = [], fetcher = async (url, options) => { calls.push({ url, options }); if (url.includes('/releases?')) return Response.json([]); throw new Error('EXAMPLE_OTHER_SOURCES_UNAVAILABLE'); }, access = new GithubAccess(async () => token, fetcher);
  try { const sources = await discoverUpdates({ dsh: '0.2.1-rc.2', canvas: '3.3.6', zhen: '0.1.0', gateway: 'EXAMPLE_DOCS' }, fetcher, undefined, access); assert.equal(sources.find(item => item.id === 'zhen').state, 'unpublished'); assert.equal(calls.filter(call => call.options.headers.Authorization).length, 1); assert.ok(calls.find(call => call.options.headers.Authorization).url.includes(`/repos/${repo}/releases?`)); } finally { access.close(); }
});
