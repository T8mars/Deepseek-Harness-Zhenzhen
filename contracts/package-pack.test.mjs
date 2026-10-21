import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, existsSync, copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve, relative, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {checkPackList} from '../scripts/check-private.mjs';

test('C63: the actual pack command restores a legacy CRLF checkout to the full canonical archive without rewriting its inputs', {timeout: 120000}, t => {
 const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
 const npm = [process.env.npm_execpath, resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')].find(path => path && existsSync(path));
 assert.ok(npm, 'Run through npm test to supply its CLI.');
 const base = realpathSync.native(tmpdir()), root = realpathSync.native(mkdtempSync(join(base, 'dsh-package-npm-EXAMPLE-')));
 const pkg = join(root, 'packages/dsh-zhen');
 const run = (tool, args, cwd = root, extra = {}) => execFileSync(tool, args, {cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 16 * 1024 * 1024, ...extra});
 const hash = bytes => createHash('sha256').update(bytes).digest('hex');
 try {
  const preview = JSON.parse(run(process.execPath, [npm, 'pack', './packages/dsh-zhen', '--ignore-scripts', '--offline', '--json', '--dry-run'], workspace).toString('utf8'))[0];
  checkPackList(preview.files);
  assert.ok(preview.files.length >= 100, 'Exercise the complete built bundle, not a minimal substitute package.');
  for (const file of preview.files) {
   assert.ok(file.path && !file.path.includes('\\') && !isAbsolute(file.path) && !file.path.split('/').some(part => !part || part === '.' || part === '..'));
   const target = join(pkg, file.path);
   mkdirSync(dirname(target), {recursive: true});
   let bytes = readFileSync(join(workspace, 'packages/dsh-zhen', file.path));
   if (file.path === 'LICENSE' || /\.(?:md|json|yml)$/.test(file.path)) bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
   writeFileSync(target, bytes);
   const declaration = /^lib\/(?:types|client-types)\/(.+)\.d\.ts$/.exec(file.path);
   if (declaration) {
    const source = ['.ts', '.tsx'].map(ext => 'packages/dsh-zhen/src/' + declaration[1] + ext).find(path => existsSync(join(workspace, path)));
    assert.ok(source, 'Retain actual sources for the ordinary declaration guard.');
    mkdirSync(dirname(join(root, source)), {recursive: true});
    copyFileSync(join(workspace, source), join(root, source));
   }
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify({name: 'example-packer-contract', version: '0.0.0', private: true, type: 'module'}));
  mkdirSync(join(root, 'scripts'));
  for (const file of ['pack.mjs', 'package-stage.mjs', 'package-policy.mjs', 'check-private.mjs', 'declaration-output.mjs']) copyFileSync(join(workspace, 'scripts', file), join(root, 'scripts', file));
  const archive = folder => {
   const output = join(root, folder);
   mkdirSync(output);
   const packed = JSON.parse(run(process.execPath, [npm, 'pack', pkg, '--ignore-scripts', '--offline', '--json', '--pack-destination', output]).toString('utf8'))[0];
   return readFileSync(join(output, packed.filename));
  };
  const reference = hash(archive('EXAMPLE_CANONICAL'));
  for (const path of ['LICENSE', 'cordis.patch.yml', 'skills/zhen-knowledge-writing/SKILL.md']) {
   const file = join(pkg, path), text = readFileSync(file, 'utf8');
   assert.ok(text.includes('\n'));
   writeFileSync(file, text.replace(/\n/g, '\r\n'));
  }
  const before = new Map(preview.files.map(file => [file.path, hash(readFileSync(join(pkg, file.path)))]));
  const legacyRawSha256 = hash(archive('EXAMPLE_RAW_CRLF'));
  assert.notEqual(legacyRawSha256, reference, 'The fixture must reproduce a full archive difference.');
  run('git', ['init', '--quiet']);
  run('git', ['-c', 'core.autocrlf=false', 'add', '--all']);
  run(process.execPath, [join(root, 'scripts/pack.mjs')], root, {env: {...process.env, npm_execpath: npm}});
  const result = JSON.parse(readFileSync(join(root, '.runtime/package-artifact.json'), 'utf8'));
  assert.equal(result.sha256, reference);
  assert.equal(hash(readFileSync(join(root, '.runtime/packages', result.file))), reference);
  for (const [path, digest] of before) assert.equal(hash(readFileSync(join(pkg, path))), digest, 'Keep existing checkout bytes: ' + path);
  t.diagnostic(JSON.stringify({contract: 'C63', packageFiles: preview.files.length, canonicalSha256: reference, legacyRawSha256, actualPackSha256: result.sha256, inputsUnchanged: true}));
 } finally {
  const absolute = realpathSync.native(root), part = relative(base, absolute);
  assert.ok(part && !isAbsolute(part) && !part.startsWith('..') && !part.includes('/') && !part.includes('\\') && part.startsWith('dsh-package-npm-EXAMPLE-'));
  rmSync(absolute, {recursive: true, force: true, maxRetries: 5, retryDelay: 200});
 }
});
