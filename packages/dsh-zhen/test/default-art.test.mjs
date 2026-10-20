import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DefaultArt } from '../lib/default-art.js';
import { inspectArtSource } from '../lib/art-source.js';
import { DEFAULT_ART_CHUNK_BYTES } from '../lib/default-art-schema.js';
import { transferDefaultArt } from '../lib/default-art-transfer.js';
import { overlayArt } from '../lib/art-overlay.js';
import { defaultArtFixture } from '../../../contracts/fixtures/default-art.mjs';
import { selectDefaultArt } from '../../../scripts/launch-art.mjs';
function fixture(t, options) { const f = defaultArtFixture(options); t.after(() => f.dispose()); return f; }
function source(f) { return new DefaultArt({ root: f.root, digest: inspectArtSource(f.root, { release: true }).sha256 }); }
const adapter = art => ({ defaultArtInfo: async () => ({ ok: true, value: art.info() }), defaultArtChunk: async request => ({ ok: true, value: art.chunk(request) }) });
test('confirmed local source exposes a closed metadata summary and bounded immutable raster chunks', t => {
  const f = fixture(t), art = source(f), info = art.info(); assert.equal(info.state, 'ready'); assert.equal(info.pack.assets.length, 4); assert.equal(JSON.stringify(info).includes(f.root), false); assert.equal(info.pack.credit.notice, 'EXAMPLE SYNTHETIC NOTICE');
  const descriptor = info.pack.assets[0], first = art.chunk({ digest: info.pack.digest, sha256: descriptor.sha256, offset: 0 }); assert.equal(Buffer.from(first.base64, 'base64').length, DEFAULT_ART_CHUNK_BYTES); assert.equal(first.eof, false);
  writeFileSync(join(f.root, 'hero.png'), Buffer.from('EXAMPLE replaced after capture')); assert.deepEqual(art.chunk({ digest: info.pack.digest, sha256: descriptor.sha256, offset: 0 }), first);
  info.pack.name = 'EXAMPLE mutation'; assert.notEqual(art.info().pack.name, info.pack.name); art.close(); assert.equal(art.info().state, 'unavailable'); assert.throws(() => art.chunk({ digest: info.pack.digest, sha256: descriptor.sha256, offset: 0 }));
});
test('unconfigured, unconfirmed, incomplete and changed pins cannot enable default art', t => {
  assert.equal(new DefaultArt({}).info().state, 'none'); const f = fixture(t, { confirmed: false }); assert.equal(new DefaultArt({ root: f.root, digest: 'f'.repeat(64) }).info().state, 'unavailable');
  const other = fixture(t); assert.equal(new DefaultArt({ root: other.root, digest: 'f'.repeat(64) }).info().state, 'unavailable'); assert.equal(new DefaultArt({ root: other.root }).info().state, 'unavailable');
});
test('real client transfer checks every byte and downloads shared slot assets only once', async t => {
  const f = fixture(t), art = source(f), api = adapter(art); let calls = 0; const original = api.defaultArtChunk; api.defaultArtChunk = request => { calls++; return original(request); };
  const result = await transferDefaultArt(api); assert.equal(result.assets.size, 2); assert.equal(calls, Math.ceil(f.hero.length / DEFAULT_ART_CHUNK_BYTES) + Math.ceil(f.mark.length / DEFAULT_ART_CHUNK_BYTES));
  for (const value of result.assets.values()) assert.equal(createHash('sha256').update(value.bytes).digest('hex'), value.descriptor.sha256);
});
test('chunk requests cannot select arbitrary files, mismatched packages, offsets or unknown digests', t => {
  const f = fixture(t), art = source(f), info = art.info(), request = { digest: info.pack.digest, sha256: info.pack.assets[0].sha256, offset: 0 };
  for (const changed of [{ path: 'manifest.json' }, { digest: 'f'.repeat(64) }, { sha256: 'f'.repeat(64) }, { offset: -1 }, { offset: 1 }, { offset: 9999999 }]) assert.throws(() => art.chunk({ ...request, ...changed }));
});
test('client refuses corrupted bytes, wrong identity/shape and late cancelled chunks without partial activation', async t => {
  const f = fixture(t), art = source(f);
  for (const change of [chunk => ({ ...chunk, digest: 'f'.repeat(64) }), chunk => ({ ...chunk, nextOffset: chunk.nextOffset + 1 }), chunk => ({ ...chunk, eof: !chunk.eof }), chunk => ({ ...chunk, base64: Buffer.alloc(Buffer.from(chunk.base64, 'base64').length).toString('base64') })]) {
    const api = adapter(art); api.defaultArtChunk = async request => ({ ok: true, value: change(art.chunk(request)) }); await assert.rejects(transferDefaultArt(api));
  }
  let active = true, calls = 0; const api = adapter(art); api.defaultArtChunk = async request => { calls++; active = false; return { ok: true, value: art.chunk(request) }; }; await assert.rejects(transferDefaultArt(api, () => active)); assert.ok(calls <= 2);
});
test('client rejects conflicting metadata for shared digests and duplicate presentation slots', async t => {
  const f = fixture(t), art = source(f), info = art.info(), api = adapter(art); info.pack.assets[2].width = 2; api.defaultArtInfo = async () => ({ ok: true, value: info }); await assert.rejects(transferDefaultArt(api));
  const repeated = art.info(); repeated.pack.assets.push({ ...repeated.pack.assets[0] }); api.defaultArtInfo = async () => ({ ok: true, value: repeated }); await assert.rejects(transferDefaultArt(api));
});
test('browser art, stored focus and disabled mode win while missing custom slots can use defaults', () => {
  const local = { portrait: 'EXAMPLE_CUSTOM' }, defaults = { portrait: 'EXAMPLE_DEFAULT', mark: 'EXAMPLE_MARK' }, prefs = { mode: 'off', x: .5, y: .5, scale: 1 }, focus = { x: .2, y: .8, scale: .9 };
  const merged = overlayArt(local, prefs, false, defaults, focus); assert.equal(merged.assets.portrait, local.portrait); assert.equal(merged.assets.mark, defaults.mark); assert.equal(merged.preferences, prefs);
  assert.deepEqual(overlayArt({}, prefs, false, defaults, focus).preferences, { ...prefs, ...focus }); assert.equal(overlayArt({}, prefs, true, defaults, focus).preferences, prefs); assert.equal(overlayArt({}, prefs, false, {}, undefined).preferences, prefs);
});
test('launcher automatically selects only the confirmed local pack and refuses stale explicit selections', t => {
  const f = fixture(t, { automatic: true }), selected = selectDefaultArt(f.base); assert.equal(selected.state, 'ready'); assert.equal(selected.environment.DSH_ZHEN_ART_ROOT, f.root);
  assert.equal(selectDefaultArt(f.base, { DSH_ZHEN_ART_ROOT: f.root, DSH_ZHEN_ART_DIGEST: 'f'.repeat(64) }).state, 'unavailable'); assert.equal(selectDefaultArt(f.base, { DSH_ZHEN_ART_DIGEST: selected.digest }).state, 'unavailable');
  f.manifest.license.confirmedByUser = false; f.save(); assert.equal(selectDefaultArt(f.base).state, 'unavailable'); assert.deepEqual(selectDefaultArt(f.base).environment, {});
});
test('client negotiates a smaller supported server chunk size without using a compiled offset stride', async t => {
  const f = fixture(t), art = source(f), info = art.info(); info.pack.chunkBytes = 32 * 1024; const captured = new Map([[createHash('sha256').update(f.hero).digest('hex'), f.hero], [createHash('sha256').update(f.mark).digest('hex'), f.mark]]);
  const api = { defaultArtInfo: async () => ({ ok: true, value: info }), defaultArtChunk: async request => { const bytes = captured.get(request.sha256), nextOffset = Math.min(request.offset + info.pack.chunkBytes, bytes.length); return { ok: true, value: { ...request, nextOffset, size: bytes.length, eof: nextOffset === bytes.length, base64: bytes.subarray(request.offset, nextOffset).toString('base64') } }; } };
  assert.equal((await transferDefaultArt(api)).assets.size, 2); info.pack.protocol = 'EXAMPLE_UNKNOWN_PROTOCOL'; await assert.rejects(transferDefaultArt(api));
});
