import test from 'node:test';
import assert from 'node:assert/strict';
import { Config } from '@deepseek-ai/dsh-mcp-client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ZhenService from '../packages/dsh-zhen/lib/index.js';

test('C10: published MCP bridge accepts the explicit local transport with reconnect disabled', () => {
  const config = Config({ transport: 'stdio', serverName: 't8canvas', command: process.execPath, args: ['EXAMPLE_ONLY_SERVER.js'], env: {}, cwd: process.cwd(), toolCallTimeoutMs: 30000, failOnStartupError: true, maxInstructionBytes: 4096, reconnect: { enabled: false } });
  assert.equal(config.reconnect.enabled, false);
  assert.deepEqual(config.env, {});
  const source = readFileSync('packages/dsh-zhen/src/canvas.ts', 'utf8');
  assert.ok(source.includes('client.selectInstance(this.config.instance)'));
  assert.ok(source.includes('store.loadSession(instance.instanceId)'));
  assert.equal(source.includes('/api/settings/raw'), false);
});

test('C10: Host connection RPC mounts the bundled MCP and disconnect removes its tools', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-canvas-host-'));
  const cli = join(root, 'example-cli'); mkdirSync(join(cli, 'src'), { recursive: true });
  writeFileSync(join(cli, 'manifest.json'), JSON.stringify({ schema: 't8-zcanvas-manifest-v1', controlProtocol: 't8-agent-control-v1' }));
  writeFileSync(join(cli, 'src/discovery.cjs'), "exports.discoverInstances=async()=>[{instanceId:'EXAMPLE_ONLY_INSTANCE',origin:'http://127.0.0.1:1'}];");
  writeFileSync(join(cli, 'src/secureStore.cjs'), 'exports.loadSession=()=>null;');
  writeFileSync(join(cli, 'src/agentClient.cjs'), "exports.selectInstance=async()=>{throw Error('EXAMPLE_ONLY_UNPAIRED');};exports.requestAgentControl=async()=>({ok:true,data:{compat:{fixture:'EXAMPLE_ONLY'}}});");
  const previous = process.env.DSH_HOME; process.env.DSH_HOME = root;
  const ctx = new Context(); ctx.provide('credentials', {});
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService);
    const service = ctx.get('zhen');
    const status = await service.connectCanvas(cli, '');
    assert.equal(status.connected, true);
    assert.deepEqual(status.compat, { fixture: 'EXAMPLE_ONLY' });
    assert.equal(ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__t8canvas__')).length, 11);
    await service.disconnectCanvas();
    assert.equal(ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__t8canvas__')).length, 0);
    assert.ok(ctx.tools.schemas().some(tool => tool.name === 'zhen_capabilities'));
    assert.equal((await service.canvasStatus()).configured, false);
  } finally {
    await ctx.fiber.dispose();
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test('C10: the published DSH MCP client registers and disposes the real stdio server tools', async () => {
  const ctx = new Context();
  try {
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(ToolRuntime);
    const mounted = await ctx.plugin(mcpClient, Config({ transport: 'stdio', serverName: 'examplecanvas', command: process.execPath,
      args: [resolve('packages/dsh-zhen/lib/canvas-server.js'), '--cli-root', resolve('EXAMPLE_ONLY_NONEXISTENT_CLI'), '--digest', '0'.repeat(64)],
      env: {}, cwd: process.cwd(), toolCallTimeoutMs: 30000, failOnStartupError: true, maxInstructionBytes: 4096, reconnect: { enabled: false } }));
    const tools = ctx.tools.schemas();
    assert.equal(tools.length, 11);
    assert.ok(tools.every(tool => tool.name.startsWith('mcp__examplecanvas__canvas_')));
    await mounted.dispose();
    assert.equal(ctx.tools.schemas().length, 0);
  } finally { await ctx.fiber.dispose(); }
});
