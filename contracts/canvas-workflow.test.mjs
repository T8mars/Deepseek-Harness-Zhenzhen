import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { canvasWorkflowFixture } from './fixtures/canvas-workflow.mjs';
test('C27: published Host/Remote explicit workflow review reuses native session/approval/store HTTP and adds no Agent mutation tools', async () => {
  const f = await canvasWorkflowFixture(), previous = process.env.DSH_HOME;
  process.env.DSH_HOME = join(f.base, 'EXAMPLE_HOST'); const ctx = new Context(); let keys = 0;
  ctx.provide('credentials', { resolve: async () => { keys++; throw Error('EXAMPLE_NO_PROVIDER_CREDENTIAL'); }, describe: async () => ({ configured: false, writable: true }) });
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService);
    const service = ctx.get('zhen'), config = f.config(); await service.connectCanvas(config.root, '', config.digest);
    assert.equal(await service.canvasWorkflowSnapshot(), null);
    const targets = await service.canvasWorkspaces(); assert.deepEqual(TYPERT_REMOTE.methods['zhen/canvasWorkspaces'].result.create().parse(targets), targets);
    const plan = await service.canvasWorkflowPreview({ projectId: targets.canvases[0].projectId, canvasId: targets.canvases[0].id, kind: 'image', prompt: 'EXAMPLE synthetic storyboard' });
    await assert.rejects(service.canvasWorkflowApprove(plan.id, false), error => error.details?.reason === 'WORKFLOW_REVIEW_REQUIRED'); assert.equal(f.flowState.requests, 0);
    const pending = await service.canvasWorkflowApprove(plan.id, true);
    const codec = TYPERT_REMOTE.methods['zhen/canvasWorkflowApprove'].result.create(); assert.deepEqual(codec.parse(pending), pending);
    assert.equal(codec.safeParse({ ...pending, pollSecret: 'EXAMPLE_FORBIDDEN' }).success, false);
    const native = f.originalStore.loadApproval(f.state.descriptor.instanceId, pending.approvalRequestId, f.state.options);
    assert.equal(readFileSync(join(process.env.DSH_HOME, 'dsh-zhen', 'canvas-workflow.json'), 'utf8').includes(native.pollSecret), false);
    assert.equal((await service.canvasWorkflowComplete(plan.id)).phase, 'pending'); assert.equal(f.flowState.mutations, 0);
    f.windowApprove(); const result = await service.canvasWorkflowComplete(plan.id); assert.equal(result.phase, 'applied'); assert.equal(f.flowState.mutations, 1);
    assert.deepEqual(TYPERT_REMOTE.methods['zhen/canvasWorkflowComplete'].result.create().parse(result), result);
    await assert.rejects(service.canvasWorkflowComplete(plan.id), error => error.details?.reason === 'WORKFLOW_NOT_PENDING');
    const tools = ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__t8canvas__'));
    assert.equal(tools.length, 11); assert.ok(tools.every(tool => !/apply|approve|complete|pair|auth|execute/.test(tool.name))); assert.equal(keys, 0);
  } finally { await ctx.fiber.dispose(); if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; await f.dispose(); }
});
test('C27: published codecs preserve read-only pairing default and opt-in structural scope without run execution', () => {
  const parameters = TYPERT_REMOTE.methods['zhen/canvasPairingBegin'].parameters;
  assert.equal(parameters[0].strictCodec.create().parse(undefined), false); assert.equal(parameters[1].strictCodec.create().parse(undefined), false);
  const preview = TYPERT_REMOTE.methods['zhen/canvasWorkflowPreview'].parameters[0].strictCodec.create();
  assert.equal(preview.safeParse({ projectId: 'EXAMPLE_PROJECT', canvasId: 'EXAMPLE_CANVAS', kind: 'image', prompt: 'EXAMPLE', run: true }).success, false);
});
