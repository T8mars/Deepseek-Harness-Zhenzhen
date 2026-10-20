import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import SkillRegistry from '@deepseek-ai/dsh-skill';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import * as SkillTool from '@deepseek-ai/dsh-tool-skill';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { GITHUB_SKILL_POLICY } from '../packages/dsh-zhen/lib/github-skills-schema.js';
import { LOCAL_SKILL_POLICY } from '../packages/dsh-zhen/lib/local-skills-schema.js';
import { githubSkillFixture } from './fixtures/github-skills.mjs';

async function folder() { return realpathSync.native(await mkdtemp(join(tmpdir(), 'dsh-zhen-github-contract-'))); }
async function remove(root) { const rel = relative(realpathSync.native(tmpdir()), realpathSync.native(root)); assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..')); await rm(root, { recursive: true, force: true }); }
async function host(root) {
  const ctx = new Context(); let keys = 0;
  ctx.provide('credentials', { resolve: async () => { keys++; throw new Error('EXAMPLE_KEY_MUST_NOT_BE_READ'); } });
  ctx.provide('agents', {}); ctx.provide('workingDirectory', { ensure: async () => root });
  await ctx.plugin(SkillRegistry); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService); await ctx.plugin(SkillTool);
  return { ctx, service: ctx.get('zhen'), keys: () => keys };
}

test('C21: actual Host/Remote and native skill loader use a reviewed public resource snapshot without executing its scripts', async () => {
  const root = await folder(), fixture = githubSkillFixture(root, { 'skills/example-manual/SKILL.md': '---\nname: example-github-manual\ndescription: "EXAMPLE ONLY manual skill"\ndisable-model-invocation: true\n---\nEXAMPLE_MANUAL\n' });
  const previousHome = process.env.DSH_HOME, previousFetch = globalThis.fetch; process.env.DSH_HOME = root; globalThis.fetch = fixture.fetcher;
  let h;
  try {
    h = await host(root);
    const preview = await h.service.githubSkillDownload({ ...fixture.spec, path: 'skills', mode: 'library' });
    assert.equal(preview.release.entries.length, 2); assert.deepEqual(TYPERT_REMOTE.methods['zhen/githubSkillDownload'].result.create().parse(preview), preview);
    assert.equal((await h.ctx.skills.list()).length, 0);
    await h.service.githubSkillApprove(preview.release.sourceId, preview.release.digest, GITHUB_SKILL_POLICY);
    const loaded = await h.ctx.tools.execute({ callId: 'EXAMPLE_GITHUB_LOAD', name: 'skill', arguments: { name: 'example-github-creative' }, signal: new AbortController().signal });
    assert.equal(loaded.isError, false); assert.equal(loaded.value.provider, 'dsh-zhen-github-skills');
    assert.equal(await readFile(join(loaded.value.resourceBase.path, 'references', 'guide.md'), 'utf8'), 'EXAMPLE_REFERENCE');
    assert.ok(loaded.content.some(item => item.type === 'text' && item.text.includes(loaded.value.resourceBase.path)));
    const manual = await h.ctx.tools.execute({ callId: 'EXAMPLE_GITHUB_MANUAL', name: 'skill', arguments: { name: 'example-github-manual' }, signal: new AbortController().signal });
    assert.equal(manual.isError, true);
    const views = await h.service.githubSkillList(); assert.deepEqual(TYPERT_REMOTE.methods['zhen/githubSkillList'].result.create().parse(views), views);
    await h.service.githubSkillDisable(views[0].id);
    const denied = await h.ctx.tools.execute({ callId: 'EXAMPLE_GITHUB_DISABLED', name: 'skill', arguments: { name: 'example-github-creative' }, signal: new AbortController().signal });
    assert.equal(denied.isError, true); assert.equal(h.keys(), 0);
  } finally { await h?.ctx.fiber.dispose(); globalThis.fetch = previousFetch; if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; await remove(root); }
});

test('C21: GitHub updates wait across Host lifetimes and never replace a same-name personal local source', async () => {
  const root = await folder(), fixture = githubSkillFixture(root), previousHome = process.env.DSH_HOME, previousFetch = globalThis.fetch;
  process.env.DSH_HOME = root; globalThis.fetch = fixture.fetcher; let h, restarted;
  try {
    h = await host(root); const first = (await h.service.githubSkillDownload(fixture.spec)).release;
    await h.service.githubSkillApprove(first.sourceId, first.digest, GITHUB_SKILL_POLICY);
    const local = join(root, 'example-personal'); await mkdir(local);
    await writeFile(join(local, 'SKILL.md'), '---\nname: example-github-creative\ndescription: "EXAMPLE ONLY personal source"\n---\nEXAMPLE_PERSONAL_MUST_REMAIN\n');
    const personal = await h.service.localSkillPreview(local, 'skill'); await h.service.localSkillConnect(local, 'skill', personal.digest, LOCAL_SKILL_POLICY);
    assert.match((await h.ctx.skills.get('example-github-creative')).content, /EXAMPLE_PERSONAL_MUST_REMAIN/);
    fixture.setHead(fixture.second); await h.service.githubSkillCheck(first.sourceId);
    const candidate = (await h.service.githubSkillList())[0]; await h.service.githubSkillApprove(candidate.id, candidate.latest, GITHUB_SKILL_POLICY);
    assert.equal((await h.service.githubSkillList())[0].running, first.digest);
    await h.ctx.fiber.dispose(); h = undefined; restarted = await host(root);
    assert.equal((await restarted.service.githubSkillList())[0].running, candidate.latest);
    assert.match((await restarted.ctx.skills.get('example-github-creative')).content, /EXAMPLE_PERSONAL_MUST_REMAIN/);
    assert.match(await readFile(join(local, 'SKILL.md'), 'utf8'), /EXAMPLE_PERSONAL_MUST_REMAIN/);
    assert.equal(restarted.keys(), 0);
  } finally { await h?.ctx.fiber.dispose(); await restarted?.ctx.fiber.dispose(); globalThis.fetch = previousFetch; if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; await remove(root); }
});

test('C21: snapshot approval/resource codecs have no command, arbitrary cache path, credential or implicit confirmation field', () => {
  const approve = TYPERT_REMOTE.methods['zhen/githubSkillApprove'].input({ strict: true }).create();
  const value = { id: 'a'.repeat(64), digest: 'b'.repeat(64), confirmation: GITHUB_SKILL_POLICY }; assert.deepEqual(approve.parse(value), value);
  assert.throws(() => approve.parse({ ...value, confirmation: true })); assert.throws(() => approve.parse({ ...value, command: 'EXAMPLE_ONLY' }));
  const file = TYPERT_REMOTE.methods['zhen/githubSkillFile'].input({ strict: true }).create();
  assert.throws(() => file.parse({ id: '../EXAMPLE', digest: 'b'.repeat(64), location: 'package', path: 'SKILL.md' }));
  assert.throws(() => file.parse({ id: 'a'.repeat(64), digest: 'b'.repeat(64), location: 'package', path: 'SKILL.md', key: 'EXAMPLE_ONLY' }));
});
