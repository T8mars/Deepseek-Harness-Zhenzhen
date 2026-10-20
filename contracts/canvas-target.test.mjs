import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {canvasWorkspacesSchema} from '../packages/dsh-zhen/lib/canvas-workflow-schema.js';
const require = createRequire(import.meta.url);
const a = {id: 'EXAMPLE_SHARED', projectId: 'EXAMPLE_A', name: 'EXAMPLE alpha', revision: 1};
const b = {...a, projectId: 'EXAMPLE_B', name: 'EXAMPLE beta'};

test('C64: target identity survives reordering and never substitutes a first, incomplete, removed or cross-project target', async () => {
 const base = realpathSync.native(tmpdir()), root = realpathSync.native(mkdtempSync(join(base, 'dsh-canvas-target-EXAMPLE-')));
 try {
  const file = join(root, 'EXAMPLE_TARGET.cjs');
  await build({entryPoints: [resolve('packages/dsh-zhen/src/client/canvas-target.ts')], outfile: file, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent'});
  const {canvasTargetKey: key, selectedCanvasTarget: selected, refreshedCanvasTarget: refresh} = require(file);
  const multiple = {canvases: [a, b], total: 2, truncated: false};
  assert.equal(refresh(multiple), '');
  assert.notEqual(key(a), key(b));
  assert.equal(selected(multiple, ''), undefined);
  assert.equal(selected(multiple, a.id), undefined);
  assert.deepEqual(selected(multiple, key(b)), b);
  assert.equal(refresh({...multiple, canvases: [b, a]}, key(b)), key(b));
  assert.equal(refresh({canvases: [a, {...a, id: 'EXAMPLE_OTHER'}], total: 2, truncated: false}, key(b)), '');
  assert.equal(refresh({canvases: [a], total: 1, truncated: false}, key(b)), '', 'Removing a selection must not silently choose a different singleton.');
  assert.equal(refresh({canvases: []}, key(a)), '');
  assert.equal(refresh({canvases: [a]}), '', 'Missing completeness evidence is not a current-window signal.');
  assert.equal(refresh({canvases: [a], total: 1, truncated: true}), '');
  assert.equal(refresh({canvases: [a], total: 2, truncated: false}), '');
  assert.equal(refresh({canvases: [a], total: 1, truncated: false}), key(a));
  assert.equal(refresh({canvases: [a], total: 1, truncated: true}, key(a)), key(a), 'An existing available selection remains usable.');
  assert.equal(selected({canvases: [a, a]}, key(a)), undefined);
 } finally {
  const absolute = realpathSync.native(root), part = relative(base, absolute);
  assert.ok(part && !isAbsolute(part) && !part.startsWith('..') && !part.includes('/') && !part.includes('\\'));
  rmSync(absolute, {recursive: true, force: true, maxRetries: 5, retryDelay: 200});
 }
});

test('C64: workspace DTO preserves optional completeness, rejects duplicate identities and retains distinct project scopes', () => {
 assert.deepEqual(canvasWorkspacesSchema.parse({canvases: [a]}), {canvases: [a]});
 assert.deepEqual(canvasWorkspacesSchema.parse({canvases: [a, b], total: 2, truncated: false}), {canvases: [a, b], total: 2, truncated: false});
 for (const value of [{canvases: [a, a]}, {canvases: [a], total: 0}, {canvases: [a], truncated: 'false'}, {canvases: [a], total: -1}, {canvases: [a], currentCanvasId: a.id}]) assert.equal(canvasWorkspacesSchema.safeParse(value).success, false);
});
