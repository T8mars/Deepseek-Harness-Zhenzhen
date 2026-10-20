import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join, relative, isAbsolute, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { KnowledgeStore } from '../packages/dsh-zhen/lib/knowledge.js';
import { seedQualityCorpus, evaluateQuality, qualityDocuments } from '../contracts/fixtures/rag-quality.mjs';

const root = await mkdtemp(join(tmpdir(), 'dsh-zhen-rag-evaluation-'));
const file = join(root, 'index.sqlite');
const store = new KnowledgeStore(file);
let evidence;
try {
  const collection = await seedQualityCorpus(store, join(root, 'source'));
  const before = performance.now();
  const cases = evaluateQuality(store);
  const elapsedMs = Math.round((performance.now() - before) * 100) / 100;
  // The prior single-window SQL is measured only for this explicit one-term
  // diagnostic, against exactly the same synthetic database and authorization.
  const previous = new DatabaseSync(file, { readOnly: true });
  let legacyFiles;
  try {
    legacyFiles = [...new Set(previous.prepare(`SELECT d.path FROM search_index f
      JOIN chunks ch ON ch.id=f.chunk_id JOIN documents d ON d.id=ch.document_id
      JOIN collections c ON c.id=d.collection_id WHERE search_index MATCH ?
      AND c.project=? AND c.enabled=1 ORDER BY bm25(search_index) LIMIT 12`)
      .all('t' + Buffer.from('琵琶').toString('hex'), 'EXAMPLE_QUALITY_PROJECT').map(row => String(row.path)))];
  } finally { previous.close(); }
  const hits = store.search('EXAMPLE_QUALITY_PROJECT', '琵琶');
  const currentFiles = [...new Set(hits.map(hit => hit.path))];
  store.setAccess('EXAMPLE_QUALITY_PROJECT', collection.id, false, '');
  const revokedHits = store.search('EXAMPLE_QUALITY_PROJECT', '琵琶').length;
  evidence = {
    schemaVersion: 1, at: new Date().toISOString(), node: process.versions.node,
    corpus: 'invented-creator-keywords-v1', documents: qualityDocuments.length,
    queryCases: cases.length, passed: cases.filter(row => row.passed).length, elapsedMs,
    diversity: { query: '琵琶', expectedFiles: 5, previousSqlFiles: legacyFiles, currentFiles,
      previousDocumentRecall: legacyFiles.length / 5, currentDocumentRecall: currentFiles.length / 5 },
    revokedHits, cases,
    limitations: ['Synthetic keyword corpus only; not a general relevance benchmark.', 'No semantic retrieval, PDF/OCR, embeddings, cloud upload, real user data or model call.', 'Browser rendering and real user corpus are unverified.'],
  };
  if (evidence.passed !== cases.length || revokedHits !== 0 || currentFiles.length !== 5) throw new Error('RAG quality evaluation failed.');
} finally {
  store.close();
  const physical = await realpath(root);
  const rel = relative(await realpath(tmpdir()), physical);
  if (!rel || isAbsolute(rel) || rel.startsWith('..')) throw new Error('Unsafe temporary cleanup.');
  await rm(physical, { recursive: true, force: true });
}
await mkdir(resolve('.runtime/evidence'), { recursive: true });
await writeFile(resolve('.runtime/evidence/rag-quality.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ queryCases: evidence.queryCases, passed: evidence.passed, diversity: evidence.diversity, revokedHits: evidence.revokedHits, elapsedMs: evidence.elapsedMs, temporaryDataRemoved: true }, null, 2));
