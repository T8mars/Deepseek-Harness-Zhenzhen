import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { canvasPairingFixture } from './fixtures/canvas-pairing.mjs';
const legacy = createRequire(import.meta.url)('./fixtures/canvas-auth/secureStore.cjs');

test('C26: unreleased native transaction fixture matches its recorded working-source bytes', () => {
  const source = new URL('./fixtures/canvas-auth-transaction/', import.meta.url), info = JSON.parse(readFileSync(new URL('source.json', source)));
  assert.equal(info.protocol, 't8-zcanvas-secure-store-transaction-v1'); assert.equal(info.status, 'unreleased-workspace-native-store-transaction-v1');
  for (const entry of info.files) {
    const bytes = readFileSync(new URL(entry.file, source), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.canonicalSha256);
  }
});

test('C26: native conditional commit rejects replacement during protection after published Host checks have already passed', async () => {
  const f = await canvasPairingFixture({ transactionStore: true }), previousHome = process.env.DSH_HOME, originalNow = Date.now;
  process.env.DSH_HOME = join(f.base, 'EXAMPLE_HOST'); Date.now = () => f.state.clock.value;
  const ctx = new Context(); let keys = 0, foreign;
  ctx.provide('credentials', { resolve: async () => { keys++; throw Error('EXAMPLE_NO_PROVIDER_KEY'); }, describe: async () => ({ configured: false, writable: true }) });
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService);
    const service = ctx.get('zhen'), config = f.config(); await service.connectCanvas(config.root, '', config.digest);
    await service.canvasPairingBegin(); f.approve();
    f.state.onProtect = () => {
      f.state.onProtect = undefined; f.state.clock.value += 6 * 60 * 1000;
      foreign = f.auth.createPairing({ clientName: 'EXAMPLE_OTHER_AGENT' });
      f.originalStore.storePending(f.state.descriptor, foreign, f.state.options);
    };
    await assert.rejects(service.canvasPairingComplete(), error => error.details?.reason === 'PAIRING_PROGRESS_CHANGED');
    assert.ok(foreign); assert.equal(f.originalStore.loadPending(f.state.descriptor.instanceId, f.state.options).pairingId, foreign.pairingId);
    assert.equal(f.originalStore.loadSession(f.state.descriptor.instanceId, f.state.options), null); assert.equal(keys, 0);
    assert.equal(ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__t8canvas__')).length, 11);
  } finally { Date.now = originalNow; await ctx.fiber.dispose(); if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; await f.dispose(); }
});

test('C26: latest native DPAPI session retains v1 compatibility and authenticates the actual published MCP child', { skip: process.platform !== 'win32' }, async () => {
  const f = await canvasPairingFixture({ transactionStore: true, dpapi: true, stdio: true }), previousHome = process.env.DSH_HOME, previousStore = process.env.ZCANVAS_AUTH_STORE;
  process.env.DSH_HOME = join(f.base, 'EXAMPLE_HOST'); process.env.ZCANVAS_AUTH_STORE = relative(process.cwd(), f.credentialFile);
  const ctx = new Context(); let keys = 0;
  ctx.provide('credentials', { resolve: async () => { keys++; throw Error('EXAMPLE_NO_PROVIDER_KEY'); }, describe: async () => ({ configured: false, writable: true }) });
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService);
    const service = ctx.get('zhen'), config = f.config(); await service.connectCanvas(config.root, '', config.digest);
    await service.canvasPairingBegin(); f.approve(); assert.equal((await service.canvasPairingComplete()).state, 'paired');
    const session = legacy.loadSession(f.state.descriptor.instanceId, f.state.options); assert.ok(session?.accessToken);
    const result = await ctx.tools.execute({ callId: 'EXAMPLE_NATIVE_TRANSACTION', name: 'mcp__t8canvas__canvas_workspaces', arguments: {}, signal: new AbortController().signal });
    assert.equal(result.isError, false); assert.match(JSON.stringify(result), /EXAMPLE_EMPTY_PROJECT/); assert.equal(JSON.stringify(result).includes(session.accessToken), false); assert.equal(keys, 0);
    const data = JSON.parse(readFileSync(f.credentialFile, 'utf8')); assert.deepEqual(Object.keys(data).sort(), ['approvals', 'contexts', 'pending', 'recipeSigning', 'schema', 'sessions']);
    assert.equal(data.schema, 't8-zcanvas-secure-store-v1'); assert.equal(legacy.configuredInstances(f.state.options).sessions.length, 1);
  } finally {
    await ctx.fiber.dispose(); if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
    if (previousStore === undefined) delete process.env.ZCANVAS_AUTH_STORE; else process.env.ZCANVAS_AUTH_STORE = previousStore;
    await f.dispose();
  }
});
