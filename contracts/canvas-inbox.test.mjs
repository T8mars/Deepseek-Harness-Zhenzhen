import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { canvasWorkflowFixture } from './fixtures/canvas-workflow.mjs';
import { canvasCatalog } from './fixtures/canvas.mjs';
test('C28: published final-result event and real MCP stdio hand off the exact native plan for UI review without replanning or Agent mutation tools', { skip: process.platform !== 'win32' }, async () => {
  const f = await canvasWorkflowFixture({ dpapi: true, stdio: true, autoPair: false });
  const previousHome = process.env.DSH_HOME, previousAuth = process.env.ZCANVAS_AUTH_STORE;
  process.env.DSH_HOME = join(f.base, 'EXAMPLE_HOST'); process.env.ZCANVAS_AUTH_STORE = f.credentialFile;
  const ctx = new Context(); let keys = 0;
  ctx.provide('credentials', { resolve: async () => { keys++; throw Error('EXAMPLE_NO_PROVIDER_KEY'); }, describe: async () => ({ configured: false, writable: true }) });
  try {
    await f.pair(); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService);
    const service = ctx.get('zhen'), config = f.config(); await service.connectCanvas(config.root, '', config.digest);
    const tool = canvasCatalog.tools.find(tool => tool.capabilityId === 'create.image'), agent = { session: { id: 'EXAMPLE_CHAT_SESSION' }, options: { provider: 'seedance' } };
    const args = { tool: tool.name, version: tool.version, operation: 'plan', projectId: 'EXAMPLE_PROJECT', canvasId: 'EXAMPLE_CANVAS', input: { prompt: 'EXAMPLE accepted chat plan' } };
    const run = (callId, caller = agent) => ctx.tools.execute({ callId, name: 'mcp__t8canvas__canvas_plan', arguments: args, agent: caller, signal: new AbortController().signal });
    const result = await run('EXAMPLE_CHAT_PLAN'); assert.equal(result.isError, false);
    const [candidate] = service.canvasCandidates(); assert.ok(candidate); assert.equal(candidate.sourceSessionId, agent.session.id); assert.equal(candidate.preview.planId, result.value.structuredContent.data.planId);
    assert.deepEqual(TYPERT_REMOTE.methods['zhen/canvasCandidates'].result.create().parse([candidate]), [candidate]);
    assert.equal(TYPERT_REMOTE.methods['zhen/canvasCandidateAdopt'].parameters[0].strictCodec.create().safeParse({ planId: candidate.preview.planId }).success, false);
    assert.equal(f.flowState.plans, 1); const [first, second] = await Promise.all([service.canvasCandidateAdopt(candidate.id), service.canvasCandidateAdopt(candidate.id)]);
    assert.equal(first.id, second.id); assert.equal(first.planId, candidate.preview.planId); assert.equal(f.flowState.plans, 1); assert.equal(f.flowState.requests, 0); assert.equal(f.flowState.mutations, 0); assert.equal(service.canvasCandidates().length, 0);
    await service.canvasWorkflowApprove(first.id, true); assert.equal((await service.canvasWorkflowComplete(first.id)).phase, 'pending'); f.windowApprove(); assert.equal((await service.canvasWorkflowComplete(first.id)).phase, 'applied'); assert.equal(f.flowState.mutations, 1);
    await run('EXAMPLE_SECOND_CHAT'); assert.equal(service.canvasCandidates().length, 1);
    service.canvasCandidateRemove(service.canvasCandidates()[0].id);
    await ctx.tools.execute({ callId: 'EXAMPLE_NO_AGENT', name: 'mcp__t8canvas__canvas_plan', arguments: args, signal: new AbortController().signal }); assert.equal(service.canvasCandidates().length, 0);
    const stopBlock = ctx.on('tools/post-execute', async (exec, _result, next) => exec.name === 'mcp__t8canvas__canvas_plan' ? { kind: 'block', feedback: [{ type: 'text', text: 'EXAMPLE_FINAL_POLICY_REFUSED' }] } : next());
    assert.equal((await run('EXAMPLE_BLOCKED_FINAL_RESULT')).isError, true); assert.equal(service.canvasCandidates().length, 0); stopBlock();
    const configFile = join(process.env.DSH_HOME, 'dsh-zhen/canvas.json'), saved = readFileSync(configFile, 'utf8');
    const stopRace = ctx.on('tools/post-execute', async (exec, _result, next) => { if (exec.name === 'mcp__t8canvas__canvas_plan') writeFileSync(configFile, JSON.stringify({ ...config, instance: 'EXAMPLE_CHANGED' })); return next(); });
    await run('EXAMPLE_CONNECTION_CHANGED'); assert.equal(service.canvasCandidates().length, 0); stopRace(); writeFileSync(configFile, saved);
    assert.equal(ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__t8canvas__')).length, 10); assert.equal(keys, 0);
  } finally {
    await ctx.fiber.dispose(); if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
    if (previousAuth === undefined) delete process.env.ZCANVAS_AUTH_STORE; else process.env.ZCANVAS_AUTH_STORE = previousAuth;
    await f.dispose();
  }
});
