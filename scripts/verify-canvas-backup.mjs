import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const allowed = /^(?:backend\/src\/(?:providers|routes|services|shared)\/[^/]+\.(?:js|json)|tools\/zcanvas-cli\/(?:src\/[^/]+\.cjs|generated\/[^/]+\.json|manifest\.json)|tests\/[^/]+\.test\.(?:cjs|ts)|docs\/[^/]+\.md|features\.json|src\/generated\/[^/]+\.json|\.agents\/skills\/zhenzhen-canvas\/references\/generated-[^/]+\.(?:md|json))$/;
export function readCanvasBackup(directory = fileURLToPath(new URL('../integrations/canvas/', import.meta.url))) {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.automaticApplication, false);
  assert.match(manifest.baseCommit, /^[a-f0-9]{40}$/);
  assert.match(manifest.patch, /^native-[a-z0-9-]+\.patch$/);
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= 128);
  assert.equal(new Set(manifest.files.map(file => file.path)).size, manifest.files.length);
  for (const file of manifest.files) {
    assert.ok(allowed.test(file.path) && !file.path.split('/').includes('..'), 'Unreviewed Canvas backup path');
    assert.ok(file.baseSha256 === null || /^[a-f0-9]{64}$/.test(file.baseSha256));
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
  }
  const patch = readFileSync(join(directory, manifest.patch));
  assert.equal(sha(patch), manifest.sha256);
  const output = execFileSync('git', ['apply', '--numstat', '-z', '--'], { input: patch, encoding: 'utf8', windowsHide: true });
  const paths = output.split('\0').filter(Boolean).map(line => {
    const match = /^(\d+)\t(\d+)\t(.+)$/.exec(line); assert.ok(match, 'Non-text or unexpected patch entry'); return match[3];
  });
  assert.deepEqual(paths.sort(), manifest.files.map(file => file.path).sort());
  return { manifest, patch };
}

export function verifyCanvasBackup(root) {
  assert.ok(isAbsolute(root), 'Canvas source path must be absolute');
  root = realpathSync.native(root);
  const { manifest, patch } = readCanvasBackup();
  execFileSync('git', ['-C', root, 'cat-file', '-e', `${manifest.baseCommit}^{commit}`], { windowsHide: true, stdio: 'pipe' });
  const temporary = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-canvas-backup-')));
  try {
    // Reconstruct only reviewed source blobs in a new TEMP directory. The real
    // Canvas index, worktree, application and databases are never modified.
    for (const file of manifest.files) if (file.baseSha256 !== null) {
      const bytes = execFileSync('git', ['-C', root, 'show', `${manifest.baseCommit}:${file.path}`], { windowsHide: true, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      assert.equal(sha(bytes), file.baseSha256, `Base blob differs: ${file.path}`);
      const target = join(temporary, file.path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
    }
    const git = args => execFileSync('git', ['-C', temporary, ...args], { ...(args[0] === 'apply' ? { input: patch } : {}), windowsHide: true, stdio: [args[0] === 'apply' ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    git(['init', '--quiet']); git(['config', 'core.autocrlf', 'false']);
    git(['apply', '--check', '--']); git(['apply', '--']);
    for (const file of manifest.files) {
      const target = join(temporary, file.path); assert.ok(lstatSync(target).isFile() && !lstatSync(target).isSymbolicLink());
      assert.equal(sha(readFileSync(target)), file.sha256, `Restored source differs: ${file.path}`);
    }
    return { baseCommit: manifest.baseCommit, files: manifest.files.length, patchSha256: manifest.sha256, restoredInFreshSystemTemp: true, nativeWorktreeModified: false };
  } finally {
    const rel = relative(realpathSync.native(tmpdir()), temporary);
    assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..')); rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 4, 'Usage: npm run verify:canvas-backup -- --canvas-root <absolute source repository>');
  assert.equal(process.argv[2], '--canvas-root');
  console.log(JSON.stringify(verifyCanvasBackup(process.argv[3])));
}
