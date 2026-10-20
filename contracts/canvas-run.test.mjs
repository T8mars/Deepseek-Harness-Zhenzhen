import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { canvasRunFixture } from './fixtures/canvas-run.mjs';
test('C29: published Host/Remote and MCP keep human execution approval separate and recover the native intent without resubmission', { skip: process.platform !== 'win32' }, async () => {
  const f = await canvasRunFixture({ dpapi: true, stdio: true, autoPair: false }), previousHome = process.env.DSH_HOME, previousAuth = process.env.ZCANVAS_AUTH_STORE;
  process.env.DSH_HOME = join(f.base, 'EXAMPLE_HOST'); process.env.ZCANVAS_AUTH_STORE = f.credentialFile;
  const ctx = new Context(); let keys = 0;
  ctx.provide('credentials', { resolve: async () => { keys++; throw Error('EXAMPLE_NO_PROVIDER_KEY'); }, describe: async () => ({ configured: false, writable: true }) });
  try {
    await f.pair(); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService);
    const service = ctx.get('zhen'), config = f.config(); await service.connectCanvas(config.root, '', config.digest);
    const nodes = await service.canvasRunNodes('EXAMPLE_PROJECT', 'EXAMPLE_CANVAS'); assert.deepEqual(TYPERT_REMOTE.methods['zhen/canvasRunNodes'].result.create().parse(nodes), nodes);
    const quote = await service.canvasRunQuote({ projectId: nodes.projectId, canvasId: nodes.canvasId, canvasRevision: nodes.revision, nodeIds: [nodes.nodes[0].id] });
    await assert.rejects(service.canvasRunApprove(quote.quoteId, true, false), e => e.details?.reason === 'RUN_REVIEW_REQUIRED');
    const pending = await service.canvasRunApprove(quote.quoteId, true, true), codec = TYPERT_REMOTE.methods['zhen/canvasRunApprove'].result.create();
    assert.deepEqual(codec.parse(pending), pending); assert.equal(codec.safeParse({ ...pending, pollSecret: 'EXAMPLE_PRIVATE' }).success, false);
    const native = f.originalStore.loadApproval(f.state.descriptor.instanceId, pending.approvalRequestId, f.state.options);
    assert.equal(readFileSync(join(process.env.DSH_HOME, 'dsh-zhen/canvas-run.json'), 'utf8').includes(native.pollSecret), false);
    assert.equal((await service.canvasRunSubmit(quote.quoteId)).phase, 'pending'); assert.equal(f.runState.writes, 0);
    f.approveRun(); f.runState.dropComplete = true; await assert.rejects(service.canvasRunSubmit(quote.quoteId));
    assert.equal((await service.canvasRunSnapshot()).phase, 'unknown'); const recovered = await service.canvasRunRefresh(quote.quoteId); assert.equal(recovered.phase, 'tracking');
    assert.deepEqual(TYPERT_REMOTE.methods['zhen/canvasRunRefresh'].result.create().parse(recovered), recovered);
    await assert.rejects(service.canvasRunSubmit(quote.quoteId)); assert.equal(f.runState.completePosts, 2); assert.equal(f.runState.writes, 1);
    const tools = ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__t8canvas__')); assert.equal(tools.length, 10); assert.ok(tools.every(tool => !/apply|approve|submit|execute|pair/.test(tool.name)));
    const result = await ctx.tools.execute({ callId: 'EXAMPLE_QUERY_NATIVE_INTENT', name: 'mcp__t8canvas__canvas_task_status', arguments: { id: recovered.intent.id, projectId: recovered.projectId, canvasId: recovered.canvasId }, signal: new AbortController().signal });
    assert.equal(result.isError, false); assert.equal(result.value.structuredContent.id, recovered.intent.id);
    const wrong = await ctx.tools.execute({ callId: 'EXAMPLE_WRONG_CANVAS', name: 'mcp__t8canvas__canvas_task_status', arguments: { id: recovered.intent.id, projectId: recovered.projectId, canvasId: 'EXAMPLE_OTHER_CANVAS' }, signal: new AbortController().signal }); assert.equal(wrong.isError, true);
    assert.equal(keys, 0); assert.equal(f.runState.writes, 1);
  } finally { await ctx.fiber.dispose(); if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; if (previousAuth === undefined) delete process.env.ZCANVAS_AUTH_STORE; else process.env.ZCANVAS_AUTH_STORE = previousAuth; await f.dispose(); }
});
