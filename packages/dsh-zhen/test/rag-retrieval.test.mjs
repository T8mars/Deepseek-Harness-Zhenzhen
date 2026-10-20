import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KnowledgeStore } from '../lib/knowledge.js';

test('agent retrieval requires separate consent and an exact bound workspace, filtered before top-k', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-zhen-rag-agent-'));
  const db = new KnowledgeStore(join(root, 'index.sqlite'));
  try {
    await mkdir(join(root, 'docs')); await mkdir(join(root, 'workspace')); await mkdir(join(root, 'other'));
    await writeFile(join(root, 'docs', 'example.md'), 'EXAMPLE ONLY\nABC洛川的乐器是琵琶。');
    const granted = await db.create('EXAMPLE_PROJECT', '获准资料', join(root, 'docs'));
    await db.index('EXAMPLE_PROJECT', granted.id);
    db.setAccess('EXAMPLE_PROJECT', granted.id, true, 'seedance');
    await db.bind('EXAMPLE_PROJECT', join(root, 'workspace'));
    assert.equal(db.list('EXAMPLE_PROJECT')[0].agentEnabled, false, 'manual citation consent must not grant automatic retrieval');
    assert.deepEqual(await db.retrieveForAgent('EXAMPLE_SESSION', 'seedance', join(root, 'workspace'), '琵琶'), []);
    db.setAgentAccess('EXAMPLE_PROJECT', granted.id, true);
    for (let i = 0; i < 15; i++) { const item = await db.create('EXAMPLE_PROJECT', `EXAMPLE PRIVATE ${i}`, join(root, 'docs')); await db.index('EXAMPLE_PROJECT', item.id); }
    const hits = await db.retrieveForAgent('EXAMPLE_SESSION', 'seedance', join(root, 'workspace'), 'ABC洛川 琵琶');
    assert.equal(hits.length, 1); assert.equal(hits[0].collectionId, granted.id);
    assert.deepEqual(await db.retrieveForAgent('EXAMPLE_OTHER_SESSION', 'seedance', join(root, 'other'), '琵琶'), []);
    await assert.rejects(db.retrieveForAgent('EXAMPLE_SESSION', 'EXAMPLE_OTHER_PROVIDER', join(root, 'workspace'), '琵琶'));
    await db.assertSessionAllowed('EXAMPLE_SESSION', 'seedance', join(root, 'workspace'));
    await assert.rejects(db.assertSessionAllowed('EXAMPLE_SESSION', 'seedance', join(root, 'other')));
    db.setAgentAccess('EXAMPLE_PROJECT', granted.id, false);
    await assert.rejects(db.assertSessionAllowed('EXAMPLE_SESSION', 'seedance', join(root, 'workspace')), /授权/);
    db.setAgentAccess('EXAMPLE_PROJECT', granted.id, true);
    await assert.rejects(db.assertSessionAllowed('EXAMPLE_SESSION', 'seedance', join(root, 'workspace')), /授权/, 're-enabling cannot silently reauthorize stale session content');
  } finally { db.close(); await rm(root, { recursive: true, force: true }); }
});

test('removing and recreating a binding never resurrects historical session grants', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-zhen-rag-rebind-'));
  const db = new KnowledgeStore(':memory:');
  try {
    await writeFile(join(root, 'example.txt'), 'EXAMPLE ONLY 琵琶');
    const collection = await db.create('EXAMPLE_PROJECT', '示例资料', root);
    await db.index('EXAMPLE_PROJECT', collection.id);
    db.setAccess('EXAMPLE_PROJECT', collection.id, true, 'seedance');
    const first = await db.bind('EXAMPLE_PROJECT', root);
    db.setAgentAccess('EXAMPLE_PROJECT', collection.id, true);
    assert.equal((await db.retrieveForAgent('EXAMPLE_SESSION', 'seedance', root, '琵琶')).length, 1);
    await db.bind('EXAMPLE_PROJECT', '');
    const next = await db.bind('EXAMPLE_PROJECT', root);
    assert.ok(next.epoch > first.epoch);
    await assert.rejects(db.assertSessionAllowed('EXAMPLE_SESSION', 'seedance', root));
  } finally { db.close(); await rm(root, { recursive: true, force: true }); }
});
