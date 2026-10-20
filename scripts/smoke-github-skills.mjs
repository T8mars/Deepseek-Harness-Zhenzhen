import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, relative, isAbsolute, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import SkillRegistry from '@deepseek-ai/dsh-skill';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import * as SkillTool from '@deepseek-ai/dsh-tool-skill';
import { GithubSkills } from '../packages/dsh-zhen/lib/github-skills.js';
import { GITHUB_SKILL_POLICY } from '../packages/dsh-zhen/lib/github-skills-schema.js';

// A public example package is data in an isolated temporary test. Its resources
// are never executed, and its instructions never reach a model or user profile.
const root = realpathSync.native(await mkdtemp(join(tmpdir(), 'dsh-zhen-public-skill-smoke-')));
const ctx = new Context(), requests = [];
const fetcher = async (url, options) => {
  const target = new URL(url); assert.ok(['https://api.github.com', 'https://raw.githubusercontent.com'].includes(target.origin));
  assert.equal(options.method, 'GET'); assert.equal(new Headers(options.headers).has('Authorization'), false); requests.push(target.origin);
  return fetch(url, options);
};
const sources = new GithubSkills(join(root, 'cache'), fetcher); let evidence;
try {
  const preview = await sources.download({ repository: 'https://github.com/anthropics/skills', reference: '', path: 'skills/algorithmic-art', mode: 'skill' });
  assert.equal(sources.list().length, 0);
  sources.approve(preview.release.sourceId, preview.release.digest, GITHUB_SKILL_POLICY);
  ctx.provide('agents', {}); ctx.provide('workingDirectory', { ensure: async () => root });
  await ctx.plugin(SkillRegistry); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime);
  ctx.skills.registerProvider(control => { const remove = sources.subscribe(control.invalidate); control.signal.addEventListener('abort', remove, { once: true }); return sources.provider(); });
  await ctx.plugin(SkillTool);
  const result = await ctx.tools.execute({ callId: 'EXAMPLE_PUBLIC_SKILL_READ', name: 'skill', arguments: { name: preview.release.entries[0].name }, signal: new AbortController().signal });
  assert.equal(result.isError, false); assert.equal(result.value.resourceBase.kind, 'directory');
  const rel = relative(root, result.value.resourceBase.path); assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..'));
  const files = preview.release.files.map(file => ({ path: `${file.location}/${file.path}`, bytes: file.bytes, sha256: file.sha256 }));
  evidence = { at: new Date().toISOString(), repository: preview.release.spec.repository, path: preview.release.spec.path,
    revision: preview.release.revision, tree: preview.release.tree, digest: preview.release.digest, licenseObservation: preview.release.license,
    files, nativeLoader: result.value.provider, instructionSha256: createHash('sha256').update(result.value.content).digest('hex'),
    publicGets: requests.length, resourceBaseInsideTemporaryRoot: true, scriptsExecuted: 0, modelCalls: 0, paidCalls: 0 };
} finally {
  await ctx.fiber.dispose(); sources.close();
  const rel = relative(realpathSync.native(tmpdir()), realpathSync.native(root)); if (!rel || isAbsolute(rel) || rel.startsWith('..')) throw new Error('Unsafe temporary cleanup.');
  await rm(root, { recursive: true, force: true });
}
await mkdir(resolve('.runtime/evidence'), { recursive: true });
await writeFile(resolve('.runtime/evidence/github-public-skill-smoke.json'), JSON.stringify({ ...evidence, temporaryDataRemoved: true }, null, 2) + '\n');
console.log(JSON.stringify({ revision: evidence.revision, digest: evidence.digest, fileCount: evidence.files.length, publicGets: evidence.publicGets, nativeLoader: evidence.nativeLoader, temporaryDataRemoved: true, scriptsExecuted: 0, modelCalls: 0, paidCalls: 0 }, null, 2));
