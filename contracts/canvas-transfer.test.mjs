import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { Context } from '@deepseek-ai/cordis';
import Typert from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT } from '../packages/dsh-zhen/lib/typert.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { canvasTransferFixture } from './fixtures/canvas-transfer.mjs';
test('C32: published Gateway owner and MCP keep saved-media transfer explicit, scoped, secret-free and separate from generation', { skip: process.platform !== 'win32' }, async () => {
  const f = await canvasTransferFixture({ dpapi: true, stdio: true, autoPair: false }), previousHome = process.env.DSH_HOME, previousAuth = process.env.ZCANVAS_AUTH_STORE;
  const home = join(f.base, 'EXAMPLE_HOST'); process.env.DSH_HOME = home; process.env.ZCANVAS_AUTH_STORE = f.credentialFile; f.seedHostReceipt(home);
  const ctx = new Context(), lifetime = new AbortController(); let keys = 0;
  ctx.provide('credentials', { resolve: async () => { keys++; throw Error('EXAMPLE_NO_PROVIDER_KEY'); }, describe: async () => ({ configured: false, writable: true }) });
  try {
    await f.pair(); await ctx.plugin(Typert); await ctx.plugin(Access); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService); ctx.typert.register(TYPERT); await ctx.plugin(Gateway, {});
    const config = f.config(); await ctx.zhen.connectCanvas(config.root, '', config.digest);
    const peer = { id: 'EXAMPLE_TRANSFER_OWNER', ctx, principal: { kind: 'owner' }, signal: lifetime.signal, interactions: 'none', dispose: async () => {} };
    async function call(method, args = {}) { const result = await ctx.typertGateway.invoke({ namespace: 'zhen', method, args: JSON.parse(JSON.stringify(args)), peer }); return TYPERT_REMOTE.methods[`zhen/${method}`].result.create().parse(result === undefined ? undefined : JSON.parse(JSON.stringify(result))); }
    const input = { receiptId: f.receipt.id, projectId: 'EXAMPLE_PROJECT', canvasId: 'EXAMPLE_CANVAS' };
    await assert.rejects(call('canvasTransferPreview', { input: { ...input, filePath: f.receipt.path } }));
    const preview = await call('canvasTransferPreview', { input }); assert.equal(preview.phase, 'preview'); assert.equal(JSON.stringify(preview).includes(f.receipt.path), false);
    await assert.rejects(call('canvasTransferApprove', { id: preview.id, confirmed: false })); assert.equal(f.transferState.approvalPosts, 0);
    const pending = await call('canvasTransferApprove', { id: preview.id, confirmed: true });
    const native = f.originalStore.loadApproval(f.state.descriptor.instanceId, pending.approvalRequestId, f.state.options);
    assert.equal(readFileSync(join(home, 'dsh-zhen/canvas-transfer.json'), 'utf8').includes(native.pollSecret), false);
    assert.equal(TYPERT_REMOTE.methods['zhen/canvasTransferSnapshot'].result.create().safeParse({ ...pending, pollSecret: native.pollSecret }).success, false);
    assert.equal((await call('canvasTransferComplete', { id: preview.id })).phase, 'pending'); assert.equal(f.transferState.importWrites, 0);
    f.windowApproveTransfer(); assert.equal((await call('canvasTransferComplete', { id: preview.id })).phase, 'available');
    await call('canvasTransferPlacement', { id: preview.id }); await call('canvasTransferApprove', { id: preview.id, confirmed: true }); f.windowApproveTransfer(); assert.equal((await call('canvasTransferComplete', { id: preview.id })).phase, 'applied');
    const status = await ctx.tools.execute({ callId: 'EXAMPLE_TRANSFER_STATUS', name: 'mcp__t8canvas__canvas_status', arguments: {}, signal: lifetime.signal }); assert.equal(status.isError, false);
    const tools = ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__t8canvas__')); assert.equal(tools.length, 10); assert.ok(tools.every(tool => !/transfer|approve|complete|import|place|submit/.test(tool.name)));
    assert.equal(f.transferState.importWrites, 1); assert.equal(f.transferState.placeWrites, 1); assert.equal(keys, 0);
    await call('gatewayMediaForget', { id: f.receipt.id }); await assert.rejects(call('canvasTransferPreview', { input }), error => error.details?.reason === 'TRANSFER_RECEIPT_MISSING');
  } finally { lifetime.abort(); await ctx.fiber.dispose(); if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; if (previousAuth === undefined) delete process.env.ZCANVAS_AUTH_STORE; else process.env.ZCANVAS_AUTH_STORE = previousAuth; await f.dispose(); }
});
