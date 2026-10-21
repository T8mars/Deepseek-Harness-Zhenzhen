import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { CanvasBridge } from '../packages/dsh-zhen/lib/canvas.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { canvasRunFixture } from './fixtures/canvas-run.mjs';
test('C30: published Host/Remote and actual MCP retain scoped read-only task ownership, strict evidence summaries and zero Provider/mutation calls', { skip: process.platform !== 'win32' }, async () => {
  const f = await canvasRunFixture({ dpapi: true, stdio: true, autoPair: false, runnable: false }), previousHome = process.env.DSH_HOME, previousAuth = process.env.ZCANVAS_AUTH_STORE;
  process.env.DSH_HOME = join(f.base, 'EXAMPLE_HOST'); process.env.ZCANVAS_AUTH_STORE = f.credentialFile;
  const ctx = new Context(); let keys = 0;
  ctx.provide('credentials', { resolve: async () => { keys++; throw Error('EXAMPLE_NO_PROVIDER_KEY'); }, describe: async () => ({ configured: false, writable: true }) });
  try {
    await f.pair(); const config = f.config(), runtime = await new CanvasBridge(config).workflowRuntime();
    const intent = { id: randomUUID(), projectId: 'EXAMPLE_PROJECT', canvasId: 'EXAMPLE_CANVAS', canvasRevision: 7, nodeIds: ['EXAMPLE_IMAGE'], requestedBy: runtime.actorId, status: 'accepted', runId: null, queueRevision: 1 };
    f.intents.set('EXAMPLE_READ_OPERATION', intent);
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService); const service = ctx.get('zhen'); await service.connectCanvas(config.root, '', config.digest);
    const scope = { projectId: intent.projectId, canvasId: intent.canvasId }, reference = { ...scope, id: intent.id };
    const list = await service.canvasTasksList(scope); assert.equal(list.items[0].id, intent.id); assert.deepEqual(TYPERT_REMOTE.methods['zhen/canvasTasksList'].result.create().parse(list), list);
    assert.equal(TYPERT_REMOTE.methods['zhen/canvasTasksList'].parameters[0].strictCodec.create().safeParse({ ...scope, raw: true }).success, false);
    const detail = await service.canvasTaskDetail(reference), codec = TYPERT_REMOTE.methods['zhen/canvasTaskDetail'].result.create(); assert.equal(detail.evidence.verdict, 'not-completed'); assert.deepEqual(codec.parse(detail), detail); assert.equal(codec.safeParse({ ...detail, artifactVerification: { raw: 'EXAMPLE_PRIVATE' } }).success, false);
    const result = await ctx.tools.execute({ callId: 'EXAMPLE_READ_EXISTING_TASK', name: 'mcp__t8canvas__canvas_task_status', arguments: reference, signal: new AbortController().signal }); assert.equal(result.isError, false); assert.equal(result.value.structuredContent.id, intent.id);
    f.runState.listReply = { items: [{ ...intent, requestedBy: 'EXAMPLE_OTHER_ACTOR' }] }; await assert.rejects(service.canvasTasksList(scope), e => e.details?.reason === 'TASK_RESULT_MISMATCH');
    const tools = ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__t8canvas__')); assert.equal(tools.length, 11); assert.ok(tools.every(tool => !/retry|cancel|submit|approve|execute/.test(tool.name)));
    assert.equal(f.state.created[0].requestedScopes.includes('run:execute'), false); assert.equal(f.runState.planPosts + f.runState.approvals + f.runState.completePosts + f.runState.writes, 0); assert.equal(keys, 0); assert.equal(existsSync(join(process.env.DSH_HOME, 'dsh-zhen/canvas-run.json')), false);
  } finally { await ctx.fiber.dispose(); if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; if (previousAuth === undefined) delete process.env.ZCANVAS_AUTH_STORE; else process.env.ZCANVAS_AUTH_STORE = previousAuth; await f.dispose(); }
});
