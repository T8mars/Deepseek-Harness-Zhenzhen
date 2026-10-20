import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { SkillMarket, readBundledCatalog, verifySkill } from '../lib/market.js';

// These migration/identity scenarios use explicit fixture release numbers;
// shipped skills may advance independently. The real catalog is verified below.
const bundled = readBundledCatalog()[0];
const base = { ...bundled, manifest: { ...bundled.manifest, version: '1.0.0' } };
function changed(version, suffix) {
  const content = base.content + suffix;
  return { manifest: { ...base.manifest, version, digest: createHash('sha256').update(content).digest('hex') }, content };
}

test('skill updates retain the active body until restart and keep independent personal versions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-market-'));
  const filename = join(root, 'skills.sqlite');
  let market;
  try {
    market = new SkillMarket(filename, [base]);
    assert.equal((await market.provider().list({})).length, 0);
    market.select(base.manifest.id, base.manifest.digest);
    const candidate = (await market.provider().list({}))[0];
    const original = await market.provider().get(candidate, {});
    const fork = market.fork(base.manifest.id, base.manifest.digest, 'EXAMPLE ONLY — Personal instructions.');
    market.close();
    const update = changed('1.1.0', '\nEXAMPLE ONLY — New instructions.\n');
    market = new SkillMarket(filename, [update]);
    assert.equal(market.list().find(x => x.manifest.id === base.manifest.id).updateAvailable, true);
    assert.equal((await market.provider().get(candidate, {})).content, original.content);
    market.select(update.manifest.id, update.manifest.digest);
    assert.equal((await market.provider().get(candidate, {})).content, original.content);
    market.close();
    market = new SkillMarket(filename, [update]);
    assert.equal(await market.provider().get(candidate, {}), undefined, 'old locator must not silently load a new body');
    assert.equal(market.list().find(x => x.manifest.id === base.manifest.id).installedVersion, '1.1.0');
    assert.equal(market.list().find(x => x.manifest.id === fork).enabled, true);
    assert.equal(market.versions(base.manifest.id).length, 2);
    market.select(base.manifest.id, base.manifest.digest); // reviewed rollback, still staged
    market.disable(base.manifest.id);
    assert.equal(market.list().find(x => x.manifest.id === base.manifest.id).pendingVersion, '');
    assert.equal((await market.provider().list({})).length, 1);
  } finally { market?.close(); rmSync(root, { recursive: true, force: true }); }
});

test('market rejects tampered bodies, identity changes and same-version replacement', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-market-'));
  const market = new SkillMarket(join(root, 'skills.sqlite'), [base]);
  try {
    assert.throws(() => verifySkill({ ...base, content: base.content + 'tamper' }), /摘要/);
    assert.throws(() => verifySkill({ ...base, manifest: { ...base.manifest, dependencies: ['EXAMPLE_ONLY'] } }));
    market.select(base.manifest.id, base.manifest.digest);
    const altered = changed(base.manifest.version, '\nEXAMPLE ONLY modified release.');
    const other = new SkillMarket(join(root, 'skills.sqlite'), [altered]);
    try { assert.throws(() => other.select(altered.manifest.id, altered.manifest.digest), /相同版本/); } finally { other.close(); }
    assert.throws(() => market.preview('unrelated-skill', base.manifest.digest), /不可用/);
    assert.throws(() => market.fork(base.manifest.id, base.manifest.digest, '好'.repeat(30000)), /范围/);
    for (const item of readBundledCatalog()) assert.doesNotThrow(() => verifySkill(item));
  } finally { market.close(); rmSync(root, { recursive: true, force: true }); }
});

test('distinct releases with identical bodies retain exact version identities and reviewed activation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-market-identity-'));
  const filename = join(root, 'skills.sqlite');
  const update = { ...base, manifest: { ...base.manifest, version: '1.1.0' } };
  let market = new SkillMarket(filename, [base]);
  try {
    market.select(base.manifest.id, base.manifest.digest, base.manifest.version);
    const original = (await market.provider().list({}))[0];
    market.offerRemoteCatalog([update]);
    assert.equal(market.list()[0].updateAvailable, true);
    assert.throws(() => market.select(base.manifest.id, base.manifest.digest), /具体版本/);
    market.select(update.manifest.id, update.manifest.digest, update.manifest.version);
    assert.equal(market.list()[0].installedVersion, '1.0.0');
    assert.equal(market.list()[0].pendingVersion, '1.1.0');
    assert.equal((await market.provider().get(original, {})).metadata.version, '1.0.0');
    assert.deepEqual(market.versions(base.manifest.id).map(item => item.manifest.version).sort(), ['1.0.0', '1.1.0']);
    market.close(); market = new SkillMarket(filename, [update]);
    assert.equal(market.list()[0].installedVersion, '1.1.0');
    assert.equal(await market.provider().get(original, {}), undefined);
    market.select(base.manifest.id, base.manifest.digest, base.manifest.version);
    assert.equal(market.list()[0].pendingVersion, '1.0.0');
  } finally { market.close(); rmSync(root, { recursive: true, force: true }); }
});

test('reviewing a new version of a disabled skill keeps it disabled until the next Host start', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-market-enable-'));
  const filename = join(root, 'skills.sqlite');
  const update = changed('1.1.0', '\nEXAMPLE ONLY new release.');
  let market = new SkillMarket(filename, [base]);
  try {
    market.select(base.manifest.id, base.manifest.digest); market.disable(base.manifest.id);
    market.offerRemoteCatalog([update]); market.select(update.manifest.id, update.manifest.digest, update.manifest.version);
    assert.equal((await market.provider().list({})).length, 0);
    assert.equal(market.list()[0].enabled, false);
    market.close(); market = new SkillMarket(filename, [update]);
    assert.equal(market.list()[0].enabled, true);
    assert.equal((await market.provider().list({}))[0].metadata.version, '1.1.0');
  } finally { market.close(); rmSync(root, { recursive: true, force: true }); }
});

test('schema 1 migration preserves retained versions and resolves reviewed pending selection without changing instruction bytes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-market-migration-'));
  const filename = join(root, 'skills.sqlite');
  const update = changed('1.1.0', '\nEXAMPLE ONLY staged version.');
  const previous = new DatabaseSync(filename);
  previous.exec("CREATE TABLE versions (digest TEXT PRIMARY KEY,id TEXT NOT NULL,version TEXT NOT NULL,package TEXT NOT NULL,UNIQUE(id,version)); CREATE TABLE selections (id TEXT PRIMARY KEY,active TEXT NOT NULL DEFAULT '',pending TEXT NOT NULL DEFAULT '',enabled INTEGER NOT NULL DEFAULT 1); PRAGMA user_version=1;");
  for (const item of [base, update]) previous.prepare('INSERT INTO versions VALUES(?,?,?,?)').run(item.manifest.digest, item.manifest.id, item.manifest.version, JSON.stringify(item));
  previous.prepare('INSERT INTO selections VALUES(?,?,?,1)').run(base.manifest.id, base.manifest.digest, update.manifest.digest);
  previous.close();
  const market = new SkillMarket(filename, [update]);
  try {
    assert.equal(market.list()[0].installedVersion, '1.1.0');
    assert.equal(market.list()[0].pendingVersion, '');
    assert.equal(market.versions(base.manifest.id).length, 2);
    assert.equal(market.preview(base.manifest.id, base.manifest.digest, base.manifest.version).content, base.content);
    const candidate = (await market.provider().list({}))[0];
    assert.equal((await market.provider().get(candidate, {})).metadata.version, '1.1.0');
  } finally { market.close(); rmSync(root, { recursive: true, force: true }); }
});
