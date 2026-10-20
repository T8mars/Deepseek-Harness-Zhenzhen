import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { unzipSync } from 'fflate';
import { artDimensions, validateArtManifest } from '../packages/dsh-zhen/lib/art-validation.js';
import { inspectArtSource } from '../scripts/art-policy.mjs';
import { examplePng } from './fixtures/png.mjs';

// A synthetic one-pixel PNG fixture, never character art.
const pixel = examplePng();
const example = JSON.parse(readFileSync('packages/dsh-zhen-client-brand/assets/manifest.example.json', 'utf8'));
function source(root, confirmed = false) {
  const manifest = structuredClone(example);
  manifest.slots = { 'hero-portrait': { src: 'hero/example.png', w: 1, h: 1 } };
  if (confirmed) manifest.license = { ...manifest.license, confirmedByUser: true, confirmedAt: '2026-10-20T00:00:00Z', redistribution: 'allowed', summary: 'EXAMPLE ONLY TEST LICENSE' };
  manifest.credit.source = 'EXAMPLE ONLY SYNTHETIC FIXTURE';
  mkdirSync(join(root, 'hero'), { recursive: true });
  writeFileSync(join(root, 'hero/example.png'), pixel);
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

test('art release gate rejects unconfirmed redistribution and accepts only manifest-listed raster assets', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-art-policy-'));
  try {
    source(root);
    assert.doesNotThrow(() => inspectArtSource(root));
    assert.throws(() => inspectArtSource(root, { release: true }), /确认/);
    const confirmed = source(root, true);
    writeFileSync(join(root, 'AGENTS.md'), 'EXAMPLE ONLY PRIVATE FILE');
    writeFileSync(join(root, 'unlisted.txt'), 'EXAMPLE ONLY UNLISTED');
    const result = inspectArtSource(root, { release: true });
    assert.deepEqual([...result.files.keys()].sort(), ['hero/example.png', 'manifest.json']);
    assert.equal(JSON.stringify(result.manifest).includes('EXAMPLE ONLY PRIVATE FILE'), false);
    const denied = { ...confirmed, license: { ...confirmed.license, redistribution: 'denied' } };
    assert.throws(() => validateArtManifest(denied, true));
    assert.throws(() => validateArtManifest({ ...confirmed, credit: { ...confirmed.credit, url: 'https://example.invalid/art?signature=EXAMPLE_ONLY' } }, true), /链接/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('art paths cannot traverse, use scripts/SVG, or follow an external symlink', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-art-boundary-'));
  try {
    const manifest = source(root, true);
    for (const path of ['../example.png', '/example.png', 'https://example.invalid/image.png', 'hero/example.svg', 'hero/../example.png', 'hero\\example.png']) assert.throws(() => validateArtManifest({ ...manifest, slots: { 'hero-portrait': { src: path } } }));
    mkdirSync(join(root, 'outside')); writeFileSync(join(root, 'outside/example.png'), pixel);
    symlinkSync(join(root, 'outside'), join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const externalRoot = mkdtempSync(join(tmpdir(), 'dsh-zhen-art-external-'));
    try {
      writeFileSync(join(externalRoot, 'example.png'), pixel);
      symlinkSync(externalRoot, join(root, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
      writeFileSync(join(root, 'manifest.json'), JSON.stringify({ ...manifest, slots: { 'hero-portrait': { src: 'external/example.png' } } }));
      assert.throws(() => inspectArtSource(root, { release: true }), /包内/);
    } finally { rmSync(externalRoot, { recursive: true, force: true }); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('raster inspection rejects malformed dimensions and animated asset headers', () => {
  assert.deepEqual(artDimensions(pixel), { type: 'image/png', width: 1, height: 1 });
  assert.throws(() => artDimensions(examplePng(4097, 1)), /尺寸/);
  assert.throws(() => artDimensions(Buffer.from('<svg>EXAMPLE ONLY</svg>')), /素材/);
  const animated = Buffer.alloc(38); animated.write('RIFF'); animated.writeUInt32LE(30, 4); animated.write('WEBP', 8); animated.write('VP8X', 12); animated[20] = 2;
  assert.throws(() => artDimensions(animated), /静态/);
});

test('art pack command refuses missing confirmation and produces a closed portable ZIP when confirmed', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-art-pack-'));
  let artifact;
  try {
    source(root);
    assert.notEqual(spawnSync(process.execPath, ['scripts/pack-art.mjs', root], { encoding: 'utf8' }).status, 0);
    source(root, true);
    const result = JSON.parse(execFileSync(process.execPath, ['scripts/pack-art.mjs', root], { encoding: 'utf8' }));
    artifact = resolve('.runtime/art-packages', result.file);
    const entries = unzipSync(readFileSync(artifact));
    assert.deepEqual(Object.keys(entries).sort(), ['hero/example.png', 'manifest.json']);
    assert.equal(JSON.parse(new TextDecoder().decode(entries['manifest.json'])).license.confirmedByUser, true);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
  } finally { if (artifact) rmSync(artifact, { force: true }); rmSync(root, { recursive: true, force: true }); }
});
