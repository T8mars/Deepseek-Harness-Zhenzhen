import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join, relative, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createPackageStage} from '../scripts/package-stage.mjs';

test('C61: genuine Git checkouts preserve raw package text across autocrlf settings without normalizing binaries or unrelated files', {timeout: 30000}, () => {
 const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
 const base = realpathSync.native(tmpdir());
 const root = realpathSync.native(mkdtempSync(join(base, 'dsh-package-text-EXAMPLE-')));
 const repo = join(root, 'EXAMPLE_REPOSITORY');
 mkdirSync(repo);
 const git = (cwd, args) => execFileSync('git', ['-c', 'core.autocrlf=true', '-c', 'core.safecrlf=false', ...args], {cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000});
 try {
  const paths = git(workspace, ['ls-files', '-z', '--', 'packages/dsh-zhen']).toString('utf8').split('\0').filter(path => /^packages\/dsh-zhen\/(?:LICENSE|NOTICE\.md|THIRD_PARTY_NOTICES\.md|package\.json|cordis\.patch\.yml|catalog\/[^/]+\.json|skills\/[^/]+\/(?:SKILL\.md|manifest\.json))$/.test(path));
  assert.ok(paths.length >= 35, 'Exercise the real tracked raw npm payload, including all current skill sources.');
  assert.ok(paths.includes('packages/dsh-zhen/LICENSE'));
  assert.ok(paths.includes('packages/dsh-zhen/cordis.patch.yml'));
  assert.ok(paths.includes('packages/dsh-zhen/catalog/seedance.v1.json'));
  const canonical = new Map();
  for (const path of paths) {
   const bytes = readFileSync(join(workspace, path));
   const text = new TextDecoder('utf8', {fatal: true}).decode(bytes).replace(/\r\n/g, '\n');
   canonical.set(path, Buffer.from(text));
   mkdirSync(dirname(join(repo, path)), {recursive: true});
   writeFileSync(join(repo, path), text);
  }
  const binaryPath = 'packages/dsh-zhen/skills/EXAMPLE/assets/EXAMPLE.bin';
  const binary = Buffer.from([0, 137, 80, 78, 71, 13, 10, 26, 10, 0, 13, 10, 255]);
  mkdirSync(dirname(join(repo, binaryPath)), {recursive: true});
  writeFileSync(join(repo, binaryPath), binary);
  mkdirSync(join(repo, 'outside'));
  writeFileSync(join(repo, 'outside/EXAMPLE.txt'), 'EXAMPLE outside package\n');
  git(repo, ['init', '--quiet']);
  writeFileSync(join(repo, '.gitattributes'), '* text=auto\n');
  git(repo, ['add', '--', '.gitattributes', ...paths, binaryPath, 'outside/EXAMPLE.txt']);
  const checkout = (name, autocrlf) => {
   const target = join(root, name);
   mkdirSync(target);
   git(repo, ['-c', `core.autocrlf=${autocrlf}`, 'checkout-index', '--force', '--all', '--prefix=' + target.replaceAll('\\', '/') + '/']);
   return target;
  };
  const before = checkout('EXAMPLE_BEFORE', 'true');
  const baseline = readFileSync(join(before, 'packages/dsh-zhen/cordis.patch.yml'));
  assert.ok(baseline.includes(Buffer.from('\r\n')), 'Reproduce the original Windows conversion.');
  assert.notDeepEqual(baseline, canonical.get('packages/dsh-zhen/cordis.patch.yml'));
  writeFileSync(join(repo, '.gitattributes'), readFileSync(join(workspace, '.gitattributes')));
  git(repo, ['add', '--', '.gitattributes']);
  for (const autocrlf of ['true', 'false']) {
   const after = checkout('EXAMPLE_AFTER_' + autocrlf, autocrlf);
   for (const [path, bytes] of canonical) assert.deepEqual(readFileSync(join(after, path)), bytes, path + ' must retain canonical payload bytes.');
   assert.deepEqual(readFileSync(join(after, binaryPath)), binary, 'Future binary assets must remain byte-identical.');
   assert.equal(readFileSync(join(after, 'outside/EXAMPLE.txt'), 'utf8'), 'EXAMPLE outside package' + (autocrlf === 'true' ? '\r\n' : '\n'), 'Do not replace unrelated checkout policy.');
  }
 } finally {
  const absolute = realpathSync.native(root), part = relative(base, absolute);
  assert.ok(part && !isAbsolute(part) && !part.startsWith('..') && !part.includes('/') && !part.includes('\\') && part.startsWith('dsh-package-text-EXAMPLE-'));
  rmSync(absolute, {recursive: true, force: true, maxRetries: 5, retryDelay: 200});
 }
});

test('C62: package staging canonicalizes existing CRLF text while preserving source, BOM, generated code and binary bytes', () => {
 const base = realpathSync.native(tmpdir());
 const root = realpathSync.native(mkdtempSync(join(base, 'dsh-package-stage-EXAMPLE-')));
 const files = new Map([
  ['package.json', Buffer.from('{"name":"EXAMPLE","version":"0.0.0"}\r\n')],
  ['cordis.patch.yml', Buffer.from('# EXAMPLE\r\n- id: EXAMPLE\r\n')],
  ['LICENSE', Buffer.from('EXAMPLE LICENSE\r\nEXAMPLE TEXT\r\n')],
  ['NOTICE.md', Buffer.from('EXAMPLE NOTICE\r\n')],
  ['catalog/EXAMPLE.json', Buffer.from('{"example":true}\r\n')],
  ['skills/EXAMPLE/SKILL.md', Buffer.from('\ufeff---\r\nname: EXAMPLE\r\n---\r\nEXAMPLE\r\n')],
  ['skills/EXAMPLE/manifest.json', Buffer.from('{"id":"EXAMPLE"}\r\n')],
  ['lib/EXAMPLE.js', Buffer.from('export const example = "EXAMPLE";\r\n')],
  ['assets/EXAMPLE.bin', Buffer.from([0, 13, 10, 255, 13, 10, 0])],
 ]);
 let stage;
 try {
  for (const [path, bytes] of files) {
   mkdirSync(dirname(join(root, path)), {recursive: true});
   writeFileSync(join(root, path), bytes);
  }
  stage = createPackageStage(root, [...files.keys()]);
  assert.equal(stage.normalizedFiles, 7);
  for (const [path, bytes] of files) {
   assert.deepEqual(readFileSync(join(root, path)), bytes, 'The working copy must not be rewritten.');
   const packed = readFileSync(join(stage.root, path));
   if (path.startsWith('lib/') || path.startsWith('assets/')) assert.deepEqual(packed, bytes);
   else assert.deepEqual(packed, Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
  }
  assert.deepEqual(readFileSync(join(stage.root, 'skills/EXAMPLE/SKILL.md')).subarray(0, 3), Buffer.from([239, 187, 191]), 'Keep the existing BOM.');
  for (const paths of [['roadmap.md'], ['../EXAMPLE'], ['lib\\EXAMPLE.js'], ['LICENSE', 'LICENSE']]) assert.throws(() => createPackageStage(root, paths));
 } finally {
  stage?.cleanup();
  const absolute = realpathSync.native(root), part = relative(base, absolute);
  assert.ok(part && !isAbsolute(part) && !part.startsWith('..') && !part.includes('/') && !part.includes('\\') && part.startsWith('dsh-package-stage-EXAMPLE-'));
  rmSync(absolute, {recursive: true, force: true, maxRetries: 5, retryDelay: 200});
 }
});
