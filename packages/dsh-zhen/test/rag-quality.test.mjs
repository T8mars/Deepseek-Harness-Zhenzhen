import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { KnowledgeStore } from '../lib/knowledge.js';
import { seedQualityCorpus, evaluateQuality } from '../../../contracts/fixtures/rag-quality.mjs';

test('synthetic keyword corpus returns relevant distinct sources, short names and normalized identifiers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-zhen-rag-quality-'));
  const store = new KnowledgeStore(':memory:');
  try {
    await seedQualityCorpus(store, root);
    const rows = evaluateQuality(store);
    assert.equal(rows.length, 21);
    assert.deepEqual(rows.filter(row => !row.passed), []);
    const hits = store.search('EXAMPLE_QUALITY_PROJECT', '琵琶');
    assert.equal(hits.length, 12);
    assert.equal(new Set(hits.slice(0, 5).map(hit => hit.path)).size, 5, 'one long source must not hide other relevant sources');
    for (const hit of store.search('EXAMPLE_QUALITY_PROJECT', '霜桥')) {
      const source = await readFile(join(root, hit.path), 'utf8');
      const offset = source.indexOf(hit.text);
      assert.ok(offset >= 0, 'excerpt must remain verbatim');
      assert.equal(hit.line, source.slice(0, offset).split('\n').length);
      assert.ok(hit.line > 1, 'location must also be correct beyond the first chunk');
    }
    assert.deepEqual(store.search('EXAMPLE_OTHER_PROJECT', '琵琶'), []);
    assert.deepEqual(store.search('EXAMPLE_QUALITY_PROJECT', '洛川的乐器是什么'), [], 'keyword retrieval is not semantic question answering');
  } finally {
    store.close();
    const physical = await realpath(root);
    const rel = relative(await realpath(tmpdir()), physical);
    assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..'), 'cleanup stays within temporary directory');
    await rm(physical, { recursive: true, force: true });
  }
});
