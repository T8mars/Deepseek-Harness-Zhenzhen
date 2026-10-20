import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { SkillMarket, readBundledCatalog } from '../lib/market.js';
import { SkillFeed } from '../lib/skill-feed.js';

const base = readBundledCatalog()[0];
const sha = 'a'.repeat(40);
const later = 'b'.repeat(40);
const commitURL = 'https://api.github.com/repos/T8mars/Deepseek-Harness-Zhenzhen/commits/main';
function changed(version, suffix = '\nEXAMPLE ONLY new instructions.\n') {
  const content = base.content + suffix;
  return { manifest: { ...base.manifest, version, digest: createHash('sha256').update(content).digest('hex') }, content };
}
const envelope = skills => ({ schemaVersion: 1, publisher: 'T8mars/Deepseek-Harness-Zhenzhen', skills });
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-skill-feed-'));
  const market = new SkillMarket(join(root, 'skills.sqlite'), [base]);
  t.after(() => { market.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, market, filename: join(root, 'skills-feed.json') };
}
function source(skills, revision = sha) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(url);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(Object.keys(options.headers).some(key => key.toLowerCase() === 'authorization'), false);
    if (url === commitURL) return Response.json({ sha: revision });
    assert.equal(url, `https://raw.githubusercontent.com/T8mars/Deepseek-Harness-Zhenzhen/${revision}/market/skills.v1.json`);
    return Response.json(envelope(skills));
  };
  return { calls, fetcher };
}

test('first-party skill candidates are pinned, cached offline, and stay inactive until reviewed and restarted', async t => {
  const { market, filename, root } = fixture(t);
  market.select(base.manifest.id, base.manifest.digest);
  const candidate = (await market.provider().list({}))[0];
  const original = await market.provider().get(candidate, {});
  const personal = market.fork(base.manifest.id, base.manifest.digest, 'EXAMPLE ONLY personal version.');
  const update = changed('1.1.0');
  const remote = source([update]);
  const feed = new SkillFeed(filename, market, remote.fetcher);
  assert.equal((await feed.check()).state, 'checked'); assert.equal(remote.calls.length, 2);
  assert.equal(feed.snapshot().revision, sha);
  assert.equal(market.list().find(item => item.manifest.id === base.manifest.id).updateAvailable, true);
  assert.equal((await market.provider().get(candidate, {})).content, original.content);
  assert.equal(market.list().find(item => item.manifest.id === personal).enabled, true);
  market.select(update.manifest.id, update.manifest.digest);
  assert.equal((await market.provider().get(candidate, {})).content, original.content);
  const reopened = new SkillMarket(join(root, 'skills.sqlite'), [base]);
  try {
    const offline = new SkillFeed(filename, reopened, async () => { throw new Error('EXAMPLE_ONLY_OFFLINE'); });
    assert.equal(offline.snapshot().revision, sha);
    assert.equal(reopened.list().find(item => item.manifest.id === base.manifest.id).installedVersion, '1.1.0');
    assert.equal(await reopened.provider().get(candidate, {}), undefined);
    assert.equal((await offline.check()).state, 'error');
    assert.equal(offline.snapshot().revision, sha);
    assert.equal(reopened.list().find(item => item.manifest.id === personal).enabled, true);
  } finally { reopened.close(); }
});

test('same-version body or manifest replacement and rollback preserve the last accepted catalog', async t => {
  const { market, filename } = fixture(t);
  const update = changed('1.1.0');
  let reply = [update]; let revision = sha;
  const feed = new SkillFeed(filename, market, async url => url === commitURL ? Response.json({ sha: revision }) : Response.json(envelope(reply)));
  assert.equal((await feed.check()).state, 'checked');
  market.select(update.manifest.id, update.manifest.digest);
  for (const invalid of [changed('1.1.0', '\nEXAMPLE ONLY mutated release.'), { ...update, manifest: { ...update.manifest, title: 'EXAMPLE ONLY changed metadata' } }, base]) {
    reply = [invalid]; revision = later;
    assert.equal((await feed.check()).state, 'error');
    assert.equal(feed.snapshot().revision, sha);
    assert.equal(market.list()[0].manifest.version, '1.1.0');
    assert.equal(market.preview(update.manifest.id, update.manifest.digest).content, update.content);
  }
});

test('unsupported identity, resources, permissions, host, digest or duplicate entries never partially replace the catalog', async t => {
  const { market, filename } = fixture(t);
  const update = changed('1.1.0');
  const cases = [
    [update, { ...base, content: base.content + 'EXAMPLE_ONLY_TAMPER' }],
    [{ ...update, manifest: { ...update.manifest, permissions: ['network'] } }],
    [{ ...update, manifest: { ...update.manifest, dependencies: ['example-program'] } }],
    [{ ...update, manifest: { ...update.manifest, host: '99.0.0' } }],
    [{ ...update, resources: ['script.js'] }],
    [{ ...update, manifest: { ...update.manifest, source: 'personal' } }],
    [{ ...update, manifest: { ...update.manifest, version: '01.1.0' } }],
    [update, update],
  ];
  let reply;
  const feed = new SkillFeed(filename, market, async url => url === commitURL ? Response.json({ sha }) : Response.json(envelope(reply)));
  for (reply of cases) {
    assert.equal((await feed.check()).state, 'error');
    assert.equal(market.list()[0].manifest.digest, base.manifest.digest);
    assert.equal((await market.provider().list({})).length, 0);
  }
});

test('daily checks share one request sequence and preserve an explicit opt-out across restarts', async t => {
  const { market, filename } = fixture(t);
  const remote = source([changed('1.1.0')]);
  const feed = new SkillFeed(filename, market, remote.fetcher);
  await Promise.all([feed.automaticCheck(), feed.check(), feed.check()]);
  assert.equal(remote.calls.length, 2);
  await feed.automaticCheck(); assert.equal(remote.calls.length, 2);
  feed.setAutomatic(false);
  const offline = new SkillFeed(filename, market, async () => { throw new Error('automatic check must remain off'); });
  assert.equal(offline.snapshot().automatic, false);
  await offline.automaticCheck(); assert.equal(offline.snapshot().state, 'checked');
});

test('malformed cache, oversized responses and aborted checks never activate or persist candidates', async t => {
  const { market, filename } = fixture(t);
  writeFileSync(filename, '{"EXAMPLE_ONLY_INVALID":true}');
  const remote = source([changed('1.1.0')]);
  const feed = new SkillFeed(filename, market, remote.fetcher);
  assert.equal(feed.snapshot().automatic, false);
  await feed.automaticCheck(); assert.equal(remote.calls.length, 0);
  let cancelled = false;
  const large = new SkillFeed(filename + '.large', market, async url => url === commitURL ? Response.json({ sha }) : new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024)); }, cancel() { cancelled = true; },
  })));
  assert.equal((await large.check()).state, 'error'); assert.equal(cancelled, true);
  const controller = new AbortController();
  const aborted = new SkillFeed(filename + '.aborted', market, async url => {
    if (url === commitURL) return Response.json({ sha });
    controller.abort(); return Response.json(envelope([changed('1.1.0')]));
  });
  await aborted.check(controller.signal);
  assert.equal(aborted.snapshot().state, 'idle'); assert.equal(existsSync(filename + '.aborted'), false);
  assert.equal(market.list()[0].manifest.digest, base.manifest.digest);
});
