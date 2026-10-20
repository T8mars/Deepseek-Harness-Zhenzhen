import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverCanvasInstalls } from '../lib/canvas-discovery.js';
import { canvasDiscoverySchema } from '../lib/canvas-discovery-schema.js';
import { exampleCanvasInstall } from '../../../contracts/fixtures/canvas-install.mjs';

function fixture(t) {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-canvas-discovery-')));
  t.after(() => { const rel = relative(realpathSync.native(tmpdir()), base); assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..')); rmSync(base, { recursive: true, force: true }); });
  return { base, ...exampleCanvasInstall(base) };
}
test('managed Canvas inventory returns exact fingerprints without loading CLI modules', t => {
  const f = fixture(t), result = discoverCanvasInstalls(f.options);
  assert.equal(result.candidates.length, 1); assert.deepEqual(result.issues, []);
  assert.equal(result.candidates[0].root, realpathSync.native(f.root)); assert.match(result.candidates[0].digest, /^[a-f0-9]{64}$/);
  assert.equal(result.candidates[0].nodeSchemaDigest, f.manifest.nodeSchemaDigest);
  assert.deepEqual(canvasDiscoverySchema.parse(result), result);
  assert.equal(canvasDiscoverySchema.safeParse({ ...result, accessToken: 'EXAMPLE_SECRET' }).success, false);
});
test('managed discovery markers find custom installations and deduplicate the canonical root', t => {
  const f = fixture(t);
  for (const dir of [join(f.home, '.agents', 'skills', 'zhenzhen-canvas'), join(f.options.env.CODEX_HOME, 'skills', 'zhenzhen-canvas')]) {
    mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, '.zcanvas-managed.json'), JSON.stringify({ schema: 't8-zcanvas-discovery-copy-v1', installRoot: f.install, skillDigest: '3'.repeat(64) }));
  }
  assert.equal(discoverCanvasInstalls(f.options).candidates.length, 1);
  f.options.env.LOCALAPPDATA = join(f.base, 'EXAMPLE_OTHER_LOCAL');
  const result = discoverCanvasInstalls(f.options); assert.equal(result.candidates.length, 1); assert.deepEqual(result.issues, []);
});
test('missing managed installs are an empty inventory and invalid markers reveal no arbitrary metadata', t => {
  const f = fixture(t); rmSync(f.install, { recursive: true });
  assert.deepEqual(discoverCanvasInstalls(f.options), { candidates: [], issues: [] });
  const dir = join(f.home, '.agents', 'skills', 'zhenzhen-canvas'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.zcanvas-managed.json'), JSON.stringify({ schema: 'EXAMPLE_INVALID', installRoot: 'EXAMPLE_PRIVATE_LOCATION', accessToken: 'EXAMPLE_SECRET' }));
  const result = discoverCanvasInstalls(f.options); assert.equal(result.candidates.length, 0); assert.equal(result.issues.length, 1);
  assert.equal(JSON.stringify(result).includes('EXAMPLE_PRIVATE'), false); assert.equal(JSON.stringify(result).includes('EXAMPLE_SECRET'), false);
});
test('malformed metadata, traversal versions, oversized files and incomplete runtimes are refused', t => {
  const f = fixture(t), owner = join(f.install, '.zcanvas-install.json'), original = readFileSync(owner);
  for (const value of ['{', JSON.stringify({ schema: 't8-zcanvas-install-v1', skillName: 'zhenzhen-canvas', cliVersion: '../EXAMPLE_ESCAPE', skillVersion: '0.1.0-dev' }), ' '.repeat(65537)]) {
    writeFileSync(owner, value); const result = discoverCanvasInstalls(f.options); assert.equal(result.candidates.length, 0); assert.equal(result.issues.length, 1);
  }
  writeFileSync(owner, original); rmSync(join(f.root, 'src/secureStore.cjs'));
  assert.equal(discoverCanvasInstalls(f.options).candidates.length, 0);
});
test('junction runtimes and UNC or device install targets are refused before discovery traverses them', t => {
  const f = fixture(t), moved = join(f.base, 'EXAMPLE_LINK_TARGET'); mkdirSync(moved); rmSync(f.root, { recursive: true });
  symlinkSync(moved, f.root, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(discoverCanvasInstalls(f.options).candidates.length, 0);
  for (const value of ['\\\\EXAMPLE_UNREACHABLE\\share', '\\\\?\\C:\\EXAMPLE_DEVICE']) {
    f.options.env.ZCANVAS_INSTALL_ROOT = value; const result = discoverCanvasInstalls(f.options); assert.equal(result.candidates.length, 0); assert.equal(result.issues.length, 1);
  }
});
test('a new detection fingerprints changed resources without importing either version', t => {
  const f = fixture(t), before = discoverCanvasInstalls(f.options).candidates[0];
  writeFileSync(join(f.root, 'src/agentClient.cjs'), "throw Error('EXAMPLE_CHANGED_CLI_MUST_NOT_EXECUTE');");
  const after = discoverCanvasInstalls(f.options).candidates[0]; assert.notEqual(before.digest, after.digest); assert.equal(before.root, after.root);
});
