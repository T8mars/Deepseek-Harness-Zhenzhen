import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { KnowledgeStore } from '../packages/dsh-zhen/lib/knowledge.js';
import { createRagTool } from '../packages/dsh-zhen/lib/rag-tool.js';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { seedQualityCorpus } from './fixtures/rag-quality.mjs';

test('C11: published LLM stream boundary blocks stale RAG content before the adapter is invoked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-zhen-rag-guard-'));
  const previous = process.env.DSH_HOME; process.env.DSH_HOME = root;
  const ctx = new Context();
  let calls = 0;
  class ExampleAdapter extends LlmAdapter { async *stream() { calls++; } }
  ctx.provide('credentials', {});
  ctx.provide('agents', { get: id => ({ session: { id }, options: { provider: 'seedance' } }) });
  ctx.provide('workingDirectory', { ensure: async () => root });
  try {
    await ctx.plugin(LlmRuntime);
    ctx.llm.registerAdapter(['seedance', 'EXAMPLE_OTHER_PROVIDER'], new ExampleAdapter());
    await ctx.plugin(ZhenService);
    const service = ctx.get('zhen');
    await writeFile(join(root, 'example.txt'), 'EXAMPLE ONLY 琵琶');
    const collection = await service.createKnowledge('EXAMPLE_PROJECT', '示例资料', root);
    await service.indexKnowledge('EXAMPLE_PROJECT', collection.id);
    await service.bindKnowledge('EXAMPLE_PROJECT', root);
    service.setKnowledgeAccess('EXAMPLE_PROJECT', collection.id, true, 'seedance');
    service.setKnowledgeAgentAccess('EXAMPLE_PROJECT', collection.id, true);
    const db = new KnowledgeStore(join(root, 'dsh-zhen', 'knowledge.sqlite'));
    try { await db.retrieveForAgent('EXAMPLE_SESSION', 'seedance', root, '琵琶'); } finally { db.close(); }
    const stream = async provider => { for await (const _ of ctx.llm.stream({ provider, model: 'EXAMPLE_ONLY_MODEL', sessionId: 'EXAMPLE_SESSION', messages: [] })) {} };
    await stream('seedance'); assert.equal(calls, 1);
    await assert.rejects(stream('EXAMPLE_OTHER_PROVIDER'), /授权/); assert.equal(calls, 1);
    const prepared=await ctx.llm.prepareCall({provider:'seedance',model:'EXAMPLE_ONLY_MODEL',maxTokens:32},new AbortController().signal);
    service.setKnowledgeAgentAccess('EXAMPLE_PROJECT', collection.id, false);
    await assert.rejects(stream('seedance'), /授权/); assert.equal(calls, 1);
    await assert.rejects(async()=>{for await(const _ of prepared.stream({...prepared.config,sessionId:'EXAMPLE_SESSION',messages:[]})){}},/授权/);assert.equal(calls,1,'a captured adapter must still pass the current stream permission boundary');
  } finally {
    await ctx.fiber.dispose();
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('C11: RAG tool uses the published registry output contract and preserves citation locations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-zhen-rag-tool-'));
  const db = new KnowledgeStore(':memory:');
  const ctx = new Context();
  try {
    await writeFile(join(root, 'example.md'), 'EXAMPLE ONLY\n洛川弹琵琶。');
    const collection = await db.create('EXAMPLE_PROJECT', '示例资料', root);
    await db.index('EXAMPLE_PROJECT', collection.id); await db.bind('EXAMPLE_PROJECT', root);
    db.setAccess('EXAMPLE_PROJECT', collection.id, true, 'seedance'); db.setAgentAccess('EXAMPLE_PROJECT', collection.id, true);
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime);
    const tool = createRagTool(() => db, async () => ({ sessionId: 'EXAMPLE_SESSION', provider: 'seedance', directory: root }));
    ctx.tools.register(tool);
    assert.equal(ctx.tools.schemas()[0].name, 'zhen_rag_search');
    const result = await ctx.tools.execute({ callId: 'EXAMPLE_ONLY_CALL', name: tool.name, arguments: { query: '洛川 琵琶' }, signal: new AbortController().signal });
    assert.equal(result.isError, false);
    assert.equal(result.value.hits.length, 1); assert.equal(result.value.hits[0].path, 'example.md');
    assert.ok(result.value.hits[0].line >= 1);
    const invalid = await ctx.tools.execute({ callId: 'EXAMPLE_ONLY_INVALID_CALL', name: tool.name, arguments: { query: 'x'.repeat(201) }, signal: new AbortController().signal });
    assert.equal(invalid.isError, true);
  } finally { await ctx.fiber.dispose(); db.close(); await rm(root, { recursive: true, force: true }); }
});

test('C11: published RAG tool retains source diversity after project/collection authorization', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-zhen-rag-diversity-'));
  const db = new KnowledgeStore(join(root, 'index.sqlite'));
  const ctx = new Context();
  try {
    const folder = join(root, 'sources');
    const allowed = await seedQualityCorpus(db, folder);
    await db.bind('EXAMPLE_QUALITY_PROJECT', root);
    db.setAccess('EXAMPLE_QUALITY_PROJECT', allowed.id, true, 'seedance');
    db.setAgentAccess('EXAMPLE_QUALITY_PROJECT', allowed.id, true);
    for (const project of ['EXAMPLE_QUALITY_PROJECT', 'EXAMPLE_OTHER_PROJECT']) {
      const denied = await db.create(project, 'EXAMPLE_PRIVATE_COLLECTION', folder);
      await db.index(project, denied.id);
    }
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime);
    const tool = createRagTool(() => db, async () => ({ sessionId: 'EXAMPLE_QUALITY_SESSION', provider: 'seedance', directory: root }));
    ctx.tools.register(tool);
    const result = await ctx.tools.execute({ callId: 'EXAMPLE_DIVERSITY_CALL', name: tool.name, arguments: { query: '琵琶' }, signal: new AbortController().signal });
    assert.equal(result.isError, false);
    assert.equal(result.value.hits.length, 12);
    assert.equal(new Set(result.value.hits.slice(0, 5).map(hit => hit.path)).size, 5);
    for (const hit of result.value.hits) {
      assert.equal(hit.collectionId, allowed.id);
      assert.equal(db.citation('EXAMPLE_QUALITY_PROJECT', hit.id, hit.epoch, 'seedance').text, hit.text);
    }
    db.setAgentAccess('EXAMPLE_QUALITY_PROJECT', allowed.id, false);
    const revoked = await ctx.tools.execute({ callId: 'EXAMPLE_REVOKED_CALL', name: tool.name, arguments: { query: '琵琶' }, signal: new AbortController().signal });
    assert.equal(revoked.isError, true, 'already retrieved content cannot survive revocation in the same session');
  } finally {
    await ctx.fiber.dispose(); db.close();
    const physical = await realpath(root);
    const rel = relative(await realpath(tmpdir()), physical);
    assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..'));
    await rm(physical, { recursive: true, force: true });
  }
});
