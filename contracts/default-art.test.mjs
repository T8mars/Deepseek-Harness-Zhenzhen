import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { inspectArtSource } from '../packages/dsh-zhen/lib/art-source.js';
import { transferDefaultArt } from '../packages/dsh-zhen/lib/default-art-transfer.js';
import { defaultArtFixture } from './fixtures/default-art.mjs';
import { createArtRuntime } from '../scripts/art-runtime.mjs';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
test('C31: published Gateway invokes strict default-art metadata/chunks and real client transfer reassembles pinned bytes without Provider or Agent art tools', async () => {
  const f = defaultArtFixture(), selection = inspectArtSource(f.root, { release: true }); let runtime;
  try {
    runtime = await createArtRuntime({ home: join(f.base, 'EXAMPLE_HOST'), root: f.root, digest: selection.sha256 });
    const result = await transferDefaultArt(runtime.api); assert.equal(result.info.state, 'ready'); assert.equal(result.assets.size, 2); assert.ok(runtime.counts.chunks >= 5); assert.ok(runtime.counts.maxWireBytes <= 65536);
    for (const { descriptor, bytes } of result.assets.values()) assert.equal(createHash('sha256').update(bytes).digest('hex'), descriptor.sha256);
    const info = result.info; assert.equal(JSON.stringify(info).includes(f.root), false); assert.equal(TYPERT_REMOTE.methods['zhen/defaultArtInfo'].result.create().safeParse({ ...info, root: f.root }).success, false);
    await assert.rejects(runtime.api.defaultArtChunk({ digest: selection.sha256, sha256: info.pack.assets[0].sha256, offset: 0, path: 'manifest.json' }));
    const tools = runtime.ctx.tools.schemas(); assert.equal(tools.some(tool => /defaultArt|artChunk/.test(tool.name)), false); assert.equal(runtime.counts.credentials, 0);
  } finally { await runtime?.dispose(); f.dispose(); }
});
