import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnowledgeStore } from '../lib/knowledge.js';

test('Chinese short names, project isolation, cloud consent, stale citations and immediate revocation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-zhen-rag-test-'));
  const db = new KnowledgeStore(join(root, 'index.sqlite'));
  try {
    await mkdir(join(root, 'source'));
    await writeFile(join(root, 'source', 'example.md'), '# 示例资料\n琵琶是本示例故事的乐器。\n蓝塔角色名为洛川。\n', 'utf8');
    await writeFile(join(root, 'source', '.env'), 'EXAMPLE_PRIVATE_VALUE', 'utf8');
    const c = await db.create('EXAMPLE_PROJECT_A', '示例集合', join(root, 'source'));
    const imported = await db.index('EXAMPLE_PROJECT_A', c.id);
    assert.deepEqual(imported, { indexed: 1, skipped: 1, failed: 0 });
    for (const query of ['琵琶', '洛川', '塔']) assert.equal(db.search('EXAMPLE_PROJECT_A', query).length, 1);
    assert.deepEqual(db.search('EXAMPLE_PROJECT_B', '琵琶'), []);
    assert.deepEqual(db.search('EXAMPLE_PROJECT_A', 'EXAMPLE_PRIVATE_VALUE'), []);
    let hit = db.search('EXAMPLE_PROJECT_A', '琵琶')[0];
    assert.throws(() => db.citation('EXAMPLE_PROJECT_A', hit.id, hit.epoch, 'seedance'));
    db.setAccess('EXAMPLE_PROJECT_A', c.id, true, 'seedance');
    assert.throws(() => db.citation('EXAMPLE_PROJECT_A', hit.id, hit.epoch, 'seedance'));
    hit = db.search('EXAMPLE_PROJECT_A', '琵琶')[0];
    assert.match(db.citation('EXAMPLE_PROJECT_A', hit.id, hit.epoch, 'seedance').text, /琵琶/);
    assert.throws(() => db.citation('EXAMPLE_PROJECT_B', hit.id, hit.epoch, 'seedance'));
    db.setAccess('EXAMPLE_PROJECT_A', c.id, false, '');
    assert.deepEqual(db.search('EXAMPLE_PROJECT_A', '琵琶'), []);
    assert.throws(() => db.citation('EXAMPLE_PROJECT_A', hit.id, hit.epoch, 'seedance'));
  } finally { db.close(); await rm(root, { recursive: true, force: true }); }
});

test('reindex removes deleted content and symlinked external directories are never indexed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-zhen-rag-test-'));
  const db = new KnowledgeStore(':memory:');
  try {
    await mkdir(join(root, 'source')); await mkdir(join(root, 'outside'));
    await writeFile(join(root, 'source', 'example.txt'), 'EXAMPLE_REMOVED_DOCUMENT');
    await writeFile(join(root, 'outside', 'example.txt'), 'EXAMPLE_EXTERNAL_SECRET');
    await symlink(join(root, 'outside'), join(root, 'source', 'external'), process.platform === 'win32' ? 'junction' : 'dir');
    const c = await db.create('EXAMPLE_PROJECT', '示例集合', join(root, 'source'));
    await db.index('EXAMPLE_PROJECT', c.id);
    assert.equal(db.search('EXAMPLE_PROJECT', 'EXAMPLE_REMOVED_DOCUMENT').length, 1);
    assert.deepEqual(db.search('EXAMPLE_PROJECT', 'EXAMPLE_EXTERNAL_SECRET'), []);
    await rm(join(root, 'source', 'example.txt'));
    await db.index('EXAMPLE_PROJECT', c.id);
    assert.deepEqual(db.search('EXAMPLE_PROJECT', 'EXAMPLE_REMOVED_DOCUMENT'), []);
  } finally { db.close(); await rm(root, { recursive: true, force: true }); }
});
