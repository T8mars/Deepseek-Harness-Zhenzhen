import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, unlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import McpResources from '@deepseek-ai/dsh-mcp-resources';
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { McpMarket } from '../packages/dsh-zhen/lib/mcp-market.js';
import { fixtureInstallation } from './fixtures/mcp-market.mjs';

test('C13: actual MCP plugin, resource tools, final guard and stream boundary enforce project grants', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-mcp-host-'));
  const oldHome = process.env.DSH_HOME, oldSecret = process.env.EXAMPLE_ONLY_SECRET;
  process.env.DSH_HOME = root; process.env.EXAMPLE_ONLY_SECRET = 'EXAMPLE_ONLY';
  const mcpRoot = join(root, 'dsh-zhen', 'mcp'); fixtureInstallation(mcpRoot);
  let directory = root, modelCalls = 0;
  const agent = { session: { id: 'EXAMPLE_ONLY_SESSION' }, options: { provider: 'seedance' } };
  const ctx = new Context(); ctx.provide('credentials', {});
  ctx.provide('workingDirectory', { get: () => directory, ensure: async () => directory });
  ctx.provide('agents', { get: () => agent });
  class ExampleAdapter extends LlmAdapter { async *stream() { modelCalls++; } }
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(McpResources); await ctx.plugin(LlmRuntime);
    ctx.llm.registerAdapter(['seedance'], new ExampleAdapter()); await ctx.plugin(ZhenService);
    const service = ctx.get('zhen'); await service.mcpSelect('memory', '2026.8.31', root);
    assert.equal(service.mcpSnapshot().recipes[0].runtime, 'ready');
    assert.ok(ctx.tools.schemas().some(tool => tool.name === 'mcp__zhenmemory__fixture_probe'));
    const execute = (name, args = {}) => ctx.tools.execute({ callId: 'EXAMPLE_ONLY_CALL', name, arguments: args, agent, signal: new AbortController().signal });
    const result = await execute('mcp__zhenmemory__fixture_probe'); assert.equal(result.isError, false);
    assert.equal(JSON.parse(result.value.content[0].text).safe, true);
    const data = JSON.parse(result.value.content[0].text).data;
    assert.ok(data.startsWith(realpathSync.native(mcpRoot)));
    const serial = await Promise.all([execute('mcp__zhenmemory__fixture_probe', { wait: true }), execute('mcp__zhenmemory__fixture_probe', { wait: true })]);
    assert.ok(serial.every(item => !item.isError && !JSON.parse(item.value.content[0].text).overlap));
    unlinkSync(data + '.started');
    assert.equal((await execute('read_mcp_resource', { server: 'zhenmemory', uri: 'memory://EXAMPLE_ONLY' })).isError, false);
    // A permissive policy must not undo the monotonic final project guard.
    ctx.on('tools/pre-execute', async () => ({ kind: 'allow' }));
    const stream = async () => { for await (const _ of ctx.llm.stream({ provider: 'seedance', model: 'EXAMPLE_ONLY_MODEL', sessionId: agent.session.id, messages: [] })) {} };
    await stream(); assert.equal(modelCalls, 1);
    directory = tmpdir();
    assert.equal((await execute('mcp__zhenmemory__fixture_probe')).isError, true);
    assert.equal((await execute('read_mcp_resource', { server: 'zhenmemory', uri: 'memory://EXAMPLE_ONLY' })).isError, true);
    await assert.rejects(stream(), /其他项目/); assert.equal(modelCalls, 1); directory = root;
    const pending = execute('mcp__zhenmemory__fixture_probe', { wait: true });
    const deadline = Date.now() + 3000; while (!existsSync(data + '.started') && Date.now() < deadline) await delay(10);
    assert.equal(existsSync(data + '.started'), true);
    await service.mcpDisable('memory'); assert.equal(service.mcpSnapshot().recipes[0].runtime, 'draining');
    assert.equal((await execute('mcp__zhenmemory__fixture_probe')).isError, true);
    assert.equal((await pending).isError, true); await service.mcpDisable('memory');
    assert.equal(ctx.tools.schemas().some(tool => tool.name.startsWith('mcp__zhenmemory__')), false);
    await assert.rejects(stream(), /已停用/); assert.equal(modelCalls, 1);
    const persisted = new McpMarket(mcpRoot);
    try { assert.equal(persisted.hasSessionGrants(agent.session.id), true); assert.throws(() => persisted.assertSession(agent.session.id, root)); } finally { persisted.close(); }
  } finally {
    await ctx.fiber.dispose();
    if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome;
    if (oldSecret === undefined) delete process.env.EXAMPLE_ONLY_SECRET; else process.env.EXAMPLE_ONLY_SECRET = oldSecret;
    rmSync(root, { recursive: true, force: true });
  }
});
