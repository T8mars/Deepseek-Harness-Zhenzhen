import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { forbiddenRootPath, checkPaths, checkRepository, checkPackList, pushRevisions } from '../scripts/check-private.mjs';

test('private root filenames are case insensitive, legitimate packaged skills remain allowed', () => {
  for (const name of ['roadmap.md', 'ROADMAP.MD', 'Skill.md', 'AGENTS.md', 'anents.md']) assert.ok(forbiddenRootPath(name));
  assert.doesNotThrow(() => checkPaths(['packages/creator/skills/example/SKILL.md', 'README.md']));
  assert.throws(() => checkPackList([{ path: 'AGENTS.md' }]));
  assert.throws(() => checkPackList([{ path: '.credentials.yaml' }]));
  assert.throws(() => checkPackList([{ path: '.env.production' }]));
});

test('local creative materials are refused by publication and source-candidate guards while nested skill resources remain allowed',()=>{
  for(const path of ['创作资料','创作资料/EXAMPLE.md','.\\创作资料\\EXAMPLE.md']){assert.throws(()=>checkPaths([path]));assert.throws(()=>checkPackList([{path}]));}
  assert.doesNotThrow(()=>checkPaths(['packages/creator/skills/example/创作资料/EXAMPLE.md']));
});

test('ignore protects all four roots and guard rejects forced staging and deleted historical files', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-private-test-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git('init', '-q'); git('config', 'user.name', 'Example Test'); git('config', 'user.email', 'example@example.invalid');
    copyFileSync(new URL('../.gitignore', import.meta.url), join(root, '.gitignore'));
    for (const name of ['roadmap.md', 'SKILL.md', 'AGENTS.md', 'anents.md']) {
      writeFileSync(join(root, name), 'EXAMPLE PRIVATE TEST');
      assert.equal(git('check-ignore', name).trim(), name);
    }
    mkdirSync(join(root,'创作资料'));writeFileSync(join(root,'创作资料/EXAMPLE.md'),'EXAMPLE_LOCAL_MATERIAL');assert.equal(git('-c','core.quotepath=false','check-ignore','创作资料/EXAMPLE.md').trim(),'创作资料/EXAMPLE.md');
    git('add', '-f', 'AGENTS.md');
    assert.throws(() => checkRepository(root), /Git index/);
    git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Example private history');
    git('rm', 'AGENTS.md'); git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Example deletion');
    assert.throws(() => checkRepository(root), /Commit/);
  } finally { const part=relative(realpathSync.native(tmpdir()),realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(root, { recursive: true, force: true }); }
});

test('pre-push validates every pushed head including branches absent locally', () => {
  assert.deepEqual(pushRevisions(`refs/heads/example ${'a'.repeat(40)} refs/heads/example ${'0'.repeat(40)}\n`), ['a'.repeat(40)]);
  assert.throws(() => pushRevisions('malformed'));
});
