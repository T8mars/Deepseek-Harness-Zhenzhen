import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { realpathSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { GithubSkills, normalizeGithubSkillSpec, githubSkillPath } from '../lib/github-skills.js';
import { GITHUB_SKILL_POLICY } from '../lib/github-skills-schema.js';
import { githubSkillFixture } from '../../../contracts/fixtures/github-skills.mjs';

async function setup(extra) {
  const root = realpathSync.native(await mkdtemp(join(tmpdir(), 'dsh-zhen-github-skills-'))), fixture = githubSkillFixture(root, extra), cache = join(root, 'cache');
  const store = new GithubSkills(cache, fixture.fetcher);
  return { root, fixture, cache, store, async close() { store.close(); const rel = relative(realpathSync.native(tmpdir()), realpathSync.native(root)); assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..')); await rm(root, { recursive: true, force: true }); } };
}
test('Git-computed commit/tree/blob identities retain all resources/license and download remains inactive until explicit approval', async () => {
  const f = await setup();
  try {
    const preview = await f.store.download(f.fixture.spec), release = preview.release;
    assert.equal(release.revision, f.fixture.first); assert.equal(release.spec.reference, 'main'); assert.equal(release.entries.length, 1);
    assert.equal(release.files.length, 5); assert.equal(f.store.file(release.sourceId, release.digest, 'origin', 'LICENSE').content, 'EXAMPLE_ONLY_ROOT_LICENSE_NOTICE');
    assert.equal(f.store.file(release.sourceId, release.digest, 'package', 'assets/example.bin').encoding, 'opaque');
    assert.deepEqual(f.store.list(), []); assert.deepEqual(await f.store.provider().list({}), []);
    assert.throws(() => f.store.approve(release.sourceId, release.digest, 'EXAMPLE_WRONG_CONFIRMATION'));
    f.store.approve(release.sourceId, release.digest, GITHUB_SKILL_POLICY);
    const provider = f.store.provider(), [candidate] = await provider.list({}), value = await provider.get(candidate, {});
    assert.match(value.content, /EXAMPLE_BODY/); assert.equal(await readFile(join(value.resourceBase.path, 'references', 'guide.md'), 'utf8'), 'EXAMPLE_REFERENCE');
    assert.match(await readFile(join(value.resourceBase.path, 'scripts', 'example.mjs'), 'utf8'), /EXAMPLE_MUST_NOT_EXECUTE_FIRST/);
    const rawCalls = f.fixture.calls.filter(url => url.startsWith('https://raw.githubusercontent.com')).length;
    const repeated = await f.store.download(f.fixture.spec); assert.equal(repeated.release.digest, release.digest);
    assert.equal(f.fixture.calls.filter(url => url.startsWith('https://raw.githubusercontent.com')).length, rawCalls);
  } finally { await f.close(); }
});
test('resource-only update is reviewed and queued, current Host stays fixed, restart activates and retained snapshots allow rollback', async () => {
  const f = await setup(); let reopened;
  try {
    const first = (await f.store.download(f.fixture.spec)).release; f.store.approve(first.sourceId, first.digest, GITHUB_SKILL_POLICY);
    const [old] = await f.store.provider().list({}); f.fixture.setHead(f.fixture.second); await f.store.check(first.sourceId);
    const source = f.store.list()[0], next = f.store.inspect(source.id, source.latest);
    assert.notEqual(next.release.digest, first.digest); assert.equal(next.release.entries[0].digest, first.entries[0].digest);
    assert.deepEqual(next.changed, ['package/scripts/example.mjs']); assert.equal(source.running, first.digest);
    f.store.approve(source.id, source.latest, GITHUB_SKILL_POLICY); assert.equal(f.store.list()[0].pending, source.latest);
    assert.match(await readFile(join((await f.store.provider().get(old, {})).resourceBase.path, 'scripts', 'example.mjs'), 'utf8'), /FIRST/);
    f.store.close(); reopened = new GithubSkills(f.cache, f.fixture.fetcher);
    assert.equal(reopened.list()[0].running, source.latest); assert.equal(reopened.list()[0].pending, '');
    reopened.approve(source.id, first.digest, GITHUB_SKILL_POLICY); assert.equal(reopened.list()[0].pending, first.digest);
    reopened.cancelPending(source.id); assert.equal(reopened.list()[0].pending, '');
    assert.equal(reopened.history(source.id).length, 2);
  } finally { reopened?.close(); await f.close(); }
});
test('changed resource bytes block loading and damaged pending snapshots cannot replace the retained working version', async () => {
  const f = await setup(); let reopened;
  try {
    const first = (await f.store.download(f.fixture.spec)).release; f.store.approve(first.sourceId, first.digest, GITHUB_SKILL_POLICY);
    f.fixture.setHead(f.fixture.second); const second = (await f.store.download(f.fixture.spec)).release;
    f.store.approve(first.sourceId, second.digest, GITHUB_SKILL_POLICY);
    const path = join(f.cache, 'releases', first.sourceId, second.digest, 'package', 'scripts', 'example.mjs');
    await writeFile(path, 'EXAMPLE_TAMPERED_RESOURCE'); f.store.close(); reopened = new GithubSkills(f.cache, f.fixture.fetcher);
    assert.equal(reopened.list()[0].running, first.digest); assert.equal(reopened.list()[0].pending, '');
    assert.throws(() => reopened.approve(first.sourceId, second.digest, GITHUB_SKILL_POLICY));
    const [candidate] = await reopened.provider().list({}); const current = await reopened.provider().get(candidate, {}); assert.ok(current);
    await writeFile(join(current.resourceBase.path, 'scripts', 'example.mjs'), 'EXAMPLE_TAMPERED_ACTIVE');
    assert.equal(await reopened.provider().get(candidate, {}), undefined);
    assert.throws(() => reopened.deleteRelease(first.sourceId, first.digest));
    reopened.deleteRelease(first.sourceId, second.digest); assert.equal(reopened.history(first.sourceId).length, 1);
  } finally { reopened?.close(); await f.close(); }
});
test('bad raw hashes, truncated trees and traversal are refused without a registered or active snapshot', async () => {
  for (const fault of ['raw', 'truncated', 'path']) {
    const f = await setup();
    try {
      f.fixture.intercept(async url => {
        if (fault === 'raw' && url.origin === 'https://raw.githubusercontent.com') return new Response('EXAMPLE_CORRUPT');
        if (url.pathname.includes('/git/trees/') && url.searchParams.has('recursive')) {
          if (fault === 'truncated') return Response.json({ sha: url.pathname.split('/').at(-1), truncated: true, tree: [] });
          if (fault === 'path') return Response.json({ sha: url.pathname.split('/').at(-1), truncated: false, tree: [{ type: 'blob', mode: '100644', sha: 'a'.repeat(40), size: 1, path: '../../EXAMPLE_OUTSIDE' }] });
        }
      });
      await assert.rejects(f.store.download(f.fixture.spec)); assert.deepEqual(f.store.list(), []);
      const stage = join(f.cache, 'staging'); assert.equal(existsSync(stage) ? readdirSync(stage).length : 0, 0);
    } finally { await f.close(); }
  }
});
test('symlink and Git LFS packages are refused instead of silently installing missing or redirected assets', async () => {
  for (const value of [{ content: '/EXAMPLE_OUTSIDE', mode: '120000' }, 'version https://git-lfs.github.com/spec/v1\noid sha256:' + 'a'.repeat(64) + '\nsize 123\n']) {
    const f = await setup({ 'skills/example-creative/assets/extra': value });
    try { await assert.rejects(f.store.download(f.fixture.spec), /链接|LFS/); assert.deepEqual(f.store.list(), []); }
    finally { await f.close(); }
  }
});
test('disable/forget preserve snapshots and cleanup protects selected versions; network failure leaves approved data usable', async () => {
  const f = await setup();
  try {
    const first = (await f.store.download(f.fixture.spec)).release; f.store.approve(first.sourceId, first.digest, GITHUB_SKILL_POLICY);
    const [candidate] = await f.store.provider().list({});
    f.fixture.intercept(async () => { throw new Error('EXAMPLE_NETWORK_UNAVAILABLE'); });
    await f.store.check(first.sourceId); assert.equal(f.store.list()[0].state, 'unavailable'); assert.ok(await f.store.provider().get(candidate, {}));
    const calls = f.fixture.calls.length; f.store.automatic(first.sourceId, false); await f.store.automaticCheck(); assert.equal(f.fixture.calls.length, calls);
    f.store.disable(first.sourceId); assert.equal(await f.store.provider().get(candidate, {}), undefined); assert.equal(f.store.history(first.sourceId).length, 1);
    assert.throws(() => f.store.deleteRelease(first.sourceId, first.digest)); f.store.forget(first.sourceId);
    f.store.deleteRelease(first.sourceId, first.digest); assert.deepEqual(f.store.history(first.sourceId), []);
  } finally { await f.close(); }
});
test('cache junctions never direct download writes outside the owned store and the operation can recover after refusal', async () => {
  const f = await setup(), outside = join(f.root, 'example-outside');
  try {
    await mkdir(outside); await writeFile(join(outside, 'sentinel.txt'), 'EXAMPLE_KEEP');
    await symlink(outside, join(f.cache, 'staging'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(f.store.download(f.fixture.spec)); assert.equal(f.fixture.calls.length, 0);
    assert.equal(await readFile(join(outside, 'sentinel.txt'), 'utf8'), 'EXAMPLE_KEEP');
    unlinkSync(join(f.cache, 'staging')); assert.ok((await f.store.download(f.fixture.spec)).release.digest);
  } finally { await f.close(); }
});
test('repository and resource input formats cannot accept credentials, arbitrary origins or Windows traversal/device paths', () => {
  const valid = { repository: 'https://github.com/Example-Owner/Example-Skills.git', reference: 'feature/example', path: 'skills/example', mode: 'skill' };
  assert.equal(normalizeGithubSkillSpec(valid).repository, 'https://github.com/example-owner/example-skills');
  for (const repository of ['https://example.invalid/example/skills', 'https://user:EXAMPLE_SECRET@github.com/owner/repo', 'https://github.com/owner/repo?token=EXAMPLE_ONLY', 'https://github.com/owner/repo/tree/main/skills']) assert.throws(() => normalizeGithubSkillSpec({ ...valid, repository }));
  for (const path of ['../EXAMPLE', '/EXAMPLE', 'A/../B', 'C:stream', 'CON', 'assets/NUL.txt', 'a\\b', 'name.']) assert.throws(() => githubSkillPath(path));
});

test('daily candidate checks persist their attempt time, respect opt-out, and never change the mounted release', async () => {
  const f = await setup();
  try {
    const first = (await f.store.download(f.fixture.spec)).release; f.store.approve(first.sourceId, first.digest, GITHUB_SKILL_POLICY);
    let calls = f.fixture.calls.length; await f.store.automaticCheck(); assert.equal(f.fixture.calls.length, calls);
    const file = join(f.cache, 'state.json'), state = JSON.parse(await readFile(file, 'utf8'));
    state.sources[0].checkedAt = new Date(Date.now() - 86400001).toISOString(); await writeFile(file, JSON.stringify(state));
    f.fixture.setHead(f.fixture.second); await f.store.automaticCheck(); assert.ok(f.fixture.calls.length > calls);
    const source = f.store.list()[0]; assert.equal(source.running, first.digest); assert.notEqual(source.latest, first.digest); assert.equal(source.pending, '');
    calls = f.fixture.calls.length; await f.store.automaticCheck(); assert.equal(f.fixture.calls.length, calls);
    f.store.automatic(first.sourceId, false); await f.store.automaticCheck(); assert.equal(f.fixture.calls.length, calls);
  } finally { await f.close(); }
});
