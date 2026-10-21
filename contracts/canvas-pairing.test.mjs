import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { canvasPairingFixture } from './fixtures/canvas-pairing.mjs';

test('C25: actual published Host/Remote uses original auth/client/store contracts and exposes no pairing mutation to Agent tools', async () => {
  const f = await canvasPairingFixture(), previous = process.env.DSH_HOME;
  process.env.DSH_HOME = join(f.base, 'EXAMPLE_HOST');
  const ctx = new Context(); let keys = 0;
  ctx.provide('credentials', { resolve: async () => { keys++; throw Error('EXAMPLE_NO_PROVIDER_CREDENTIAL'); }, describe: async () => ({ configured: false, writable: true }) });
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService);
    const service = ctx.get('zhen'), config = f.config(); await service.connectCanvas(config.root, '', config.digest);
    const parameters = TYPERT_REMOTE.methods['zhen/canvasPairingBegin'].parameters;
    assert.equal(parameters.length, 4); for (const parameter of parameters) assert.equal(parameter.strictCodec.create().parse(undefined), false);
    const pending = await service.canvasPairingBegin();
    assert.deepEqual(TYPERT_REMOTE.methods['zhen/canvasPairingBegin'].result.create().parse(pending), pending);
    const shape = TYPERT_REMOTE.methods['zhen/canvasPairingComplete'].result.create();
    assert.equal(shape.safeParse({ ...pending, accessToken: 'EXAMPLE_FORBIDDEN' }).success, false);
    assert.equal(shape.safeParse({ ...pending, pollSecret: 'EXAMPLE_FORBIDDEN' }).success, false);
    const record = readFileSync(join(process.env.DSH_HOME, 'dsh-zhen', 'canvas-pairing.json'), 'utf8');
    assert.equal(record.includes(f.state.created[0].pollSecret), false); assert.equal(record.includes(pending.userCode), false);
    assert.equal((await service.canvasPairingComplete()).state, 'pending'); f.approve(['canvas:read', 'asset:read']);
    const paired = await service.canvasPairingComplete(); assert.deepEqual(shape.parse(paired), paired); assert.equal(paired.state, 'paired');
    const tools = ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__t8canvas__'));
    assert.equal(tools.length, 11); assert.ok(tools.every(tool => !/pair|auth|approve/.test(tool.name)));
    assert.equal(keys, 0); assert.ok(f.state.requests.every(request => request.path.startsWith('/api/agent-control/v1/pairings') || ['/api/agent-control/v1/session', '/api/agent-control/v1/status'].includes(request.path)));
    await service.disconnectCanvas(); await assert.rejects(service.canvasPairingSnapshot(), error => error.details?.reason === 'CANVAS_NOT_CONFIGURED');
  } finally { await ctx.fiber.dispose(); if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; await f.dispose(); }
});

test('C25: published MCP stdio uses the same explicit native store path and real Windows DPAPI without credential environment variables', { skip: process.platform !== 'win32' }, async () => {
  const f = await canvasPairingFixture({ dpapi: true, stdio: true });
  const previousHome = process.env.DSH_HOME, previousStore = process.env.ZCANVAS_AUTH_STORE;
  process.env.DSH_HOME = join(f.base, 'EXAMPLE_HOST'); process.env.ZCANVAS_AUTH_STORE = relative(process.cwd(), f.credentialFile);
  const ctx = new Context(); let keys = 0;
  ctx.provide('credentials', { resolve: async () => { keys++; throw Error('EXAMPLE_NO_PROVIDER_CREDENTIAL'); }, describe: async () => ({ configured: false, writable: true }) });
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService);
    const service = ctx.get('zhen'), config = f.config(); await service.connectCanvas(config.root, '', config.digest);
    assert.equal((await service.canvasPairingBegin()).state, 'pending'); f.approve(); assert.equal((await service.canvasPairingComplete()).state, 'paired');
    const result = await ctx.tools.execute({ callId: 'EXAMPLE_PAIRED_NATIVE_STORE', name: 'mcp__t8canvas__canvas_workspaces', arguments: {}, signal: new AbortController().signal });
    assert.equal(result.isError, false); assert.match(JSON.stringify(result), /EXAMPLE_EMPTY_PROJECT/);
    const session = f.originalStore.loadSession(f.state.descriptor.instanceId, f.state.options);
    assert.equal(JSON.stringify(result).includes(session.accessToken), false); assert.equal(keys, 0);
    assert.ok(f.state.requests.some(request => request.path === '/api/agent-control/v1/workspaces' && request.authorized));
  } finally {
    await ctx.fiber.dispose(); if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
    if (previousStore === undefined) delete process.env.ZCANVAS_AUTH_STORE; else process.env.ZCANVAS_AUTH_STORE = previousStore;
    await f.dispose();
  }
});
