import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CanvasBridge, inspectCanvasCli } from '../lib/canvas.js';
import { createCanvasMcp } from '../lib/canvas-mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const compat = { supported: false, reason: 'EXAMPLE_ONLY_MISMATCH', digest: 'EXAMPLE_ONLY_DIGEST' };

test('MCP initialization/listing has no canvas side effects; status preserves compat and no paid tool exists', async () => {
  let calls = 0;
  const server = createCanvasMcp({ read: async operation => { calls++; return { compat, operation }; } });
  const client = new Client({ name: 'EXAMPLE_ONLY_TEST', version: '1.0.0' });
  const [left, right] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(left); await client.connect(right);
    const tools = (await client.listTools()).tools;
    assert.equal(calls, 0);
    assert.equal(tools.length, 11);
    assert.ok(tools.every(tool => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint));
    assert.ok(!tools.some(tool => /submit|create|retry|approve|generate/.test(tool.name)));
    const result = await client.callTool({ name: 'canvas_status', arguments: {} });
    assert.deepEqual(result.structuredContent.compat, compat);
    assert.equal(calls, 1);
    const invalid = await client.callTool({ name: 'canvas_task_status', arguments: { id: '../../EXAMPLE_ONLY' } });
    assert.equal(invalid.isError, true); assert.equal(calls, 1);
    const extra = await client.callTool({ name: 'canvas_status', arguments: { submit: true } });
    assert.equal(extra.isError, true); assert.equal(calls, 1);
  } finally { await client.close(); await server.close(); }
});

test('MCP responses redact credentials, signed URL parameters and thrown transport details', async () => {
  const server = createCanvasMcp({ read: async operation => {
    if (operation === 'status') throw new Error('EXAMPLE_ONLY_SECRET: Bearer EXAMPLE_ONLY_TOKEN');
    return { accessToken: 'EXAMPLE_ONLY_TOKEN', url: 'https://example.invalid/output?signature=EXAMPLE_ONLY_SIGNATURE' };
  } });
  const client = new Client({ name: 'EXAMPLE_ONLY_TEST', version: '1.0.0' });
  const [left, right] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(left); await client.connect(right);
    assert.ok(!JSON.stringify(await client.callTool({ name: 'canvas_status', arguments: {} })).includes('EXAMPLE_ONLY_SECRET'));
    const result = await client.callTool({ name: 'canvas_capabilities', arguments: {} });
    assert.equal(JSON.stringify(result).includes('EXAMPLE_ONLY_TOKEN'), false);
    assert.equal(JSON.stringify(result).includes('EXAMPLE_ONLY_SIGNATURE'), false);
  } finally { await client.close(); await server.close(); }
});

test('CLI closure is pinned; bridge reuses its handshake and secureStore without paid requests', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-canvas-cli-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'manifest.json'), JSON.stringify({ schema: 't8-zcanvas-manifest-v1', controlProtocol: 't8-agent-control-v1' }));
    writeFileSync(join(root, 'src/discovery.cjs'), "exports.discoverInstances=async()=>[{instanceId:'EXAMPLE_ONLY_INSTANCE',origin:'http://127.0.0.1:1'}];");
    writeFileSync(join(root, 'src/secureStore.cjs'), "exports.loadSession=()=>({accessToken:'EXAMPLE_ONLY_TOKEN',expiresAt:'2099-01-01T00:00:00Z'});");
    writeFileSync(join(root, 'src/agentClient.cjs'), `exports.selectInstance=async()=>({instanceId:'EXAMPLE_ONLY_INSTANCE'});exports.requestAgentControl=async(instance,path,options)=>{if(path!='/api/agent-control/v1/status'&&options.accessToken!=='EXAMPLE_ONLY_TOKEN')throw Error('missing secureStore');return {ok:true,data:{compat:${JSON.stringify(compat)},path}};};`);
    const config = inspectCanvasCli(root);
    const bridge = new CanvasBridge(config);
    assert.deepEqual((await bridge.status()).compat, compat);
    await assert.rejects(bridge.read('task', 'EXAMPLE_ONLY_TASK'), error => error.code === 'SCOPE_REQUIRED');
    const scope = { projectId: 'EXAMPLE_ONLY_PROJECT', canvasId: 'EXAMPLE_ONLY_CANVAS' };
    assert.equal((await bridge.read('task', 'EXAMPLE_ONLY_TASK', scope)).path, '/api/agent-control/v1/run-intents/EXAMPLE_ONLY_TASK?projectId=EXAMPLE_ONLY_PROJECT&canvasId=EXAMPLE_ONLY_CANVAS');
    assert.equal((await bridge.read('creator-session', 'EXAMPLE_ONLY_SESSION', scope)).path, '/api/agent-control/v1/creator-sessions/EXAMPLE_ONLY_SESSION?projectId=EXAMPLE_ONLY_PROJECT&canvasId=EXAMPLE_ONLY_CANVAS');
    await assert.rejects(bridge.read('task', '../EXAMPLE_ONLY'), /格式/);
    await assert.rejects(bridge.read('submit'), /未开放/);
    writeFileSync(join(root, 'src/discovery.cjs'), '// EXAMPLE ONLY changed version');
    assert.equal((await bridge.status()).code, 'CLI_CHANGED');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('actual stdio server initializes and lists tools before any CLI is loaded', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('packages/dsh-zhen/lib/canvas-server.js'), '--cli-root', resolve('EXAMPLE_ONLY_NONEXISTENT_CLI'), '--digest', '0'.repeat(64)], stderr: 'pipe' });
  const client = new Client({ name: 'EXAMPLE_ONLY_TEST', version: '1.0.0' });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 11);
    const result = await client.callTool({ name: 'canvas_status', arguments: {} });
    assert.equal(result.isError, true);
    assert.ok(!JSON.stringify(result).includes('EXAMPLE_ONLY_NONEXISTENT_CLI'));
  } finally { await client.close(); await transport.close(); }
});
