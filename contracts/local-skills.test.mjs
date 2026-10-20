import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { Context } from '@deepseek-ai/cordis';
import SkillRegistry from '@deepseek-ai/dsh-skill';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import * as SkillTool from '@deepseek-ai/dsh-tool-skill';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { LocalSkills } from '../packages/dsh-zhen/lib/local-skills.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { LOCAL_SKILL_POLICY } from '../packages/dsh-zhen/lib/local-skills-schema.js';

const text = (name, body, extra = '') => `---\nname: ${name}\ndescription: "EXAMPLE ONLY creative instructions"\n${extra}---\n\n${body}\n`;
async function root() { return realpathSync.native(await mkdtemp(join(tmpdir(), 'dsh-zhen-local-contract-'))); }
async function clean(folder) { const rel = relative(realpathSync.native(tmpdir()), realpathSync.native(folder)); assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..')); await rm(folder, { recursive: true, force: true }); }
async function define(folder, name, body, extra) { await mkdir(folder, { recursive: true }); await writeFile(join(folder, 'SKILL.md'), text(name, body, extra)); }

test('C20: actual Host, SkillRegistry, ToolRuntime and native skill loader retain local resources and invocation controls', async () => {
  const installed = createRequire(import.meta.url)('@deepseek-ai/dsh-tool-skill/package.json');
  const baseline = JSON.parse(await readFile(new URL('../UPSTREAM.lock.json', import.meta.url), 'utf8'));
  assert.equal(installed.version, baseline.dsh.version, 'the native loader is the exact locked published runtime package');
  const folder = await root(), previous = process.env.DSH_HOME; process.env.DSH_HOME = folder;
  const ctx = new Context(); let credentialReads = 0;
  ctx.provide('credentials', { resolve: async () => { credentialReads++; throw new Error('EXAMPLE_CREDENTIAL_MUST_NOT_BE_READ'); } });
  ctx.provide('agents', {}); ctx.provide('workingDirectory', { ensure: async () => folder });
  try {
    await ctx.plugin(SkillRegistry); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService); await ctx.plugin(SkillTool);
    const library = join(folder, 'library'), source = join(library, 'example-creative');
    await define(source, 'example-creative', 'EXAMPLE_BODY，参阅 references/guide.md；scripts/example.mjs 只在用户授权时运行。', 'license: EXAMPLE_OWNER_LICENSE\n');
    await define(join(library, 'example-manual'), 'example-manual', 'EXAMPLE_MANUAL_BODY', 'disable-model-invocation: true\n');
    await mkdir(join(source, 'references')); await mkdir(join(source, 'scripts'));
    await writeFile(join(source, 'references', 'guide.md'), 'EXAMPLE_REFERENCE');
    await writeFile(join(source, 'scripts', 'example.mjs'), 'throw new Error("EXAMPLE_MUST_NOT_EXECUTE");');
    const original = await readFile(join(source, 'SKILL.md'));
    const service = ctx.get('zhen'), draft = await service.localSkillPreview(library, 'library');
    assert.equal((await ctx.skills.list()).length, 0);
    assert.deepEqual(TYPERT_REMOTE.methods['zhen/localSkillPreview'].result.create().parse(draft), draft);
    await service.localSkillConnect(library, 'library', draft.digest, LOCAL_SKILL_POLICY);
    const summaries = await ctx.skills.list(); assert.equal(summaries.length, 2);
    assert.equal(summaries.find(item => item.name === 'example-manual').invocation.userInvocable, true);
    const result = await ctx.tools.execute({ callId: 'EXAMPLE_LOCAL_LOAD', name: 'skill', arguments: { name: 'example-creative' }, signal: new AbortController().signal });
    assert.equal(result.isError, false); assert.equal(result.value.provider, 'dsh-zhen-local-skills');
    assert.deepEqual(result.value.resourceBase, { kind: 'directory', path: source });
    assert.ok(result.content.some(item => item.type === 'text' && item.text.includes(source) && item.text.includes('references/guide.md')));
    assert.equal(await readFile(join(result.value.resourceBase.path, 'references', 'guide.md'), 'utf8'), 'EXAMPLE_REFERENCE');
    const refused = await ctx.tools.execute({ callId: 'EXAMPLE_MANUAL_LOAD', name: 'skill', arguments: { name: 'example-manual' }, signal: new AbortController().signal });
    assert.equal(refused.isError, true);
    const views = await service.localSkillList(); assert.deepEqual(TYPERT_REMOTE.methods['zhen/localSkillList'].result.create().parse(views), views);
    service.localSkillDisable(views[0].source.id);
    const removed = await ctx.tools.execute({ callId: 'EXAMPLE_DISABLED_LOAD', name: 'skill', arguments: { name: 'example-creative' }, signal: new AbortController().signal });
    assert.equal(removed.isError, true); assert.deepEqual(await readFile(join(source, 'SKILL.md')), original); assert.equal(credentialReads, 0);
  } finally { await ctx.fiber.dispose(); if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; await clean(folder); }
});

test('C20: bounded file polling invalidates the real registry cache for trusted edits and newly added library children', async () => {
  const folder = await root(), library = join(folder, 'library'), sources = new LocalSkills(join(folder, 'sources.json'), 30), ctx = new Context();
  let wake;
  try {
    await define(join(library, 'one'), 'example-one', 'EXAMPLE_OLD');
    const draft = await sources.preview(library, 'library'); await sources.connect(library, 'library', draft.digest, LOCAL_SKILL_POLICY);
    await ctx.plugin(SkillRegistry);
    ctx.skills.registerProvider(control => { const remove = sources.subscribe(() => { control.invalidate(); wake?.(); }); control.signal.addEventListener('abort', remove, { once: true }); return sources.provider(); });
    assert.match((await ctx.skills.get('example-one')).content, /EXAMPLE_OLD/);
    async function changed(work) {
      const event = Promise.withResolvers(); wake = event.resolve;
      const timer = setTimeout(() => event.reject(new Error('Local skill watcher did not invalidate.')), 4000);
      try { await work(); await event.promise; } finally { clearTimeout(timer); wake = undefined; }
    }
    await changed(() => define(join(library, 'one'), 'example-one', 'EXAMPLE_CHANGED_AND_LONGER'));
    assert.match((await ctx.skills.get('example-one')).content, /EXAMPLE_CHANGED_AND_LONGER/);
    await changed(() => define(join(library, 'two'), 'example-two', 'EXAMPLE_NEW_CHILD'));
    assert.ok((await ctx.skills.list()).some(item => item.name === 'example-two'));
    assert.match((await ctx.skills.get('example-two')).content, /EXAMPLE_NEW_CHILD/);
    await changed(() => writeFile(join(library, 'one', 'SKILL.md'), 'EXAMPLE_TEMPORARILY_INVALID'));
    assert.equal(await ctx.skills.get('example-one'), undefined);
    await changed(() => define(join(library, 'one'), 'example-one', 'EXAMPLE_REPAIRED_IN_PLACE'));
    assert.match((await ctx.skills.get('example-one')).content, /EXAMPLE_REPAIRED_IN_PLACE/, 'fixing an invalid definition in place must still invalidate its previously empty catalog');
  } finally { await ctx.fiber.dispose(); sources.close(); await clean(folder); }
});

test('C20: local-directory RPC inputs cannot turn resource reads into arbitrary files, network sources or automatic program execution', () => {
  const load = TYPERT_REMOTE.methods['zhen/localSkillBody'].input({ strict: true }).create();
  const args = { folder: 'EXAMPLE_LOCAL_FOLDER', directory: 'example-skill', digest: 'a'.repeat(64) };
  assert.deepEqual(load.parse(args), args);
  for (const directory of ['../EXAMPLE', '/EXAMPLE', 'EXAMPLE:stream', 'a\\b']) assert.throws(() => load.parse({ ...args, directory }));
  for (const extra of ['command', 'url', 'execute', 'key']) assert.throws(() => load.parse({ ...args, [extra]: 'EXAMPLE_ONLY' }));
  const connect = TYPERT_REMOTE.methods['zhen/localSkillConnect'].input({ strict: true }).create();
  assert.throws(() => connect.parse({ folder: 'EXAMPLE_LOCAL_FOLDER', mode: 'library', digest: 'a'.repeat(64), confirmation: true }));
});

test('C20: a configuration change during first discovery cannot cache an authoritative empty local catalog', async () => {
  const folder = await root(), file = join(folder, 'sources.json'), sources = new LocalSkills(file, 30), ctx = new Context();
  let other;
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  try {
    const first = join(folder, 'first'), second = join(folder, 'second');
    await define(first, 'example-first', 'EXAMPLE_FIRST'); await define(second, 'example-second', 'EXAMPLE_SECOND');
    const initial = await sources.preview(first, 'skill'); await sources.connect(first, 'skill', initial.digest, LOCAL_SKILL_POLICY);
    await ctx.plugin(SkillRegistry);
    ctx.skills.registerProvider(control => { const remove = sources.subscribe(control.invalidate); control.signal.addEventListener('abort', remove, { once: true }); return sources.provider(); });
    const scan = sources.scan.bind(sources); let pause = true;
    sources.scan = async (...args) => { const result = await scan(...args); if (pause) { pause = false; entered.resolve(); await release.promise; } return result; };
    const pending = ctx.skills.snapshot(); await entered.promise;
    other = new LocalSkills(file, 30); const draft = await other.preview(second, 'skill'); await other.connect(second, 'skill', draft.digest, LOCAL_SKILL_POLICY);
    release.resolve(); const snapshot = await pending;
    assert.ok(!snapshot.complete || snapshot.skills.some(item => item.name === 'example-second'), 'a changed observation is incomplete or freshly retried, never an authoritative empty catalog');
    assert.deepEqual((await ctx.skills.list()).map(item => item.name).sort(), ['example-first', 'example-second']);
  } finally { release.resolve(); await ctx.fiber.dispose(); other?.close(); sources.close(); await clean(folder); }
});
