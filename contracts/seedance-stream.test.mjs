import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { BlockAssembler, createToolResultMessage } from '@deepseek-ai/dsh-llm';
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools';

// Local synthetic protocol fixtures only. No environment credentials or live API.
const EXAMPLE_KEY = 'EXAMPLE_ONLY_LOCAL_FIXTURE';
const MODEL = 'deepseek/deepseek-v4.1-flash';
const patch = parse(await readFile(new URL('../packages/dsh-zhen/cordis.patch.yml', import.meta.url), 'utf8'));
const chunk = (delta, finish_reason = null, extra = {}) => JSON.stringify({ choices: [{ index: 0, delta, finish_reason }], ...extra });
const textEvents = [chunk({ role: 'assistant', content: '' }), chunk({ content: '示例' }), chunk({ content: '回答' }), chunk({}, 'stop', { usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 } }), '[DONE]'];

async function gateway(t, script) {
  const requests = [];
  const received = Promise.withResolvers();
  const closed = Promise.withResolvers();
  const server = createServer((request, response) => {
    response.on('close', () => closed.resolve());
    const bytes = [];
    request.on('data', value => bytes.push(value));
    request.on('end', () => {
      // Store a boolean comparison, never persist or print credential headers.
      requests.push({ path: request.url, authenticated: request.headers.authorization === `Bearer ${EXAMPLE_KEY}`, body: JSON.parse(Buffer.concat(bytes).toString('utf8')) });
      received.resolve();
      const item = script.shift() ?? { status: 500 };
      if (item.status) {
        response.writeHead(item.status, { 'content-type': 'application/json', 'retry-after': '0' });
        response.end(JSON.stringify({ error: { message: 'EXAMPLE ONLY synthetic failure' } }));
      } else {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.flushHeaders();
        for (const event of item.events ?? []) response.write(`data: ${event}\n\n`);
        if (!item.holdOpen) response.end();
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); });
  return { baseURL: `http://127.0.0.1:${server.address().port}/v1`, requests, received: received.promise, closed: closed.promise };
}

async function harness(t, server, overrides = {}, present = true) {
  const ctx = new Context();
  const resolved = [];
  let configured = present;
  ctx.provide('credentials', {
    resolve: async ref => { resolved.push(ref); return configured && ref === 'SEEDANCE_API_KEY' ? { value: EXAMPLE_KEY, source: 'file' } : undefined; },
    readRecord: async () => undefined,
    listRecords: async () => [],
  });
  t.after(() => ctx.fiber.dispose());
  await ctx.plugin(LlmRuntime);
  const config = structuredClone(patch.find(row => row.id === 'llm-pi-ai').config);
  Object.assign(config.providers.seedance, { baseURL: server.baseURL }, overrides);
  await ctx.plugin(PiAi, config);
  return { ctx, resolved, setConfigured: value => { configured = value; } };
}

async function assemble(ctx, options = {}) {
  const assembler = new BlockAssembler();
  const chunks = [];
  for await (const item of ctx.llm.stream({ provider: 'seedance', model: MODEL, messages: [{ role: 'user', content: [{ type: 'text', text: 'EXAMPLE ONLY' }] }], ...options })) {
    assembler.push(item); chunks.push(item);
  }
  return { chunks, blocks: assembler.blocks(), finish: assembler.finish, usage: assembler.usage, message: assembler.message({ provider: 'seedance', model: options.model ?? MODEL, ...(assembler.replayState ? { replayState: assembler.replayState } : {}) }) };
}

test('C14: every reviewed chat route is offered by the published adapter and preserves its exact wire model', async t => {
  const models = patch.find(row => row.id === 'llm-pi-ai').config.providers.seedance.models;
  assert.equal(models.length, 18);
  assert.equal(patch.find(row => row.id === 'agent-default-model').config.model, MODEL);
  const server = await gateway(t, models.map(() => ({events:textEvents})));
  const {ctx} = await harness(t, server);
  assert.deepEqual((await ctx.llm.listModels('seedance')).map(item => item.id).sort(), models.map(item => item.id).sort());
  for (const model of models) {
    const result = await assemble(ctx, {model:model.id}); assert.equal(result.finish.kind, 'stop');
    assert.equal(server.requests.at(-1).body.model, model.id); assert.equal(server.requests.at(-1).body.max_tokens, 4096);
    assert.deepEqual(model.input, ['text']);
  }
  assert.equal(server.requests.length, 18);
});

test('C12: exact bundled Flash route streams text and usage through the published adapter', async t => {
  const server = await gateway(t, [{ events: textEvents }]);
  const { ctx, resolved } = await harness(t, server);
  const result = await assemble(ctx);
  assert.deepEqual(result.finish, { kind: 'stop' });
  assert.equal(result.blocks.filter(block => block.type === 'text').map(block => block.text).join(''), '示例回答');
  assert.ok(result.chunks.some(item => item.type === 'text-delta'));
  assert.equal(result.usage.inputTokens, 7); assert.equal(result.usage.outputTokens, 2); assert.equal(result.usage.totalTokens, 9);
  assert.equal(server.requests.length, 1);
  const request = server.requests[0];
  assert.equal(request.path, '/v1/chat/completions'); assert.equal(request.authenticated, true);
  assert.equal(request.body.model, MODEL); assert.equal(request.body.stream, true);
  assert.equal(request.body.max_tokens, 4096);
  assert.ok(resolved.includes('SEEDANCE_API_KEY'));
});

test('C12: fragmented tool arguments execute once through ToolRuntime and the result reaches the next model turn', async t => {
  const events = [chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'EXAMPLE_ONLY_CALL', type: 'function', function: { name: 'example_lookup', arguments: '' } }] }), chunk({ tool_calls: [{ index: 0, function: { arguments: '{"name":"示' } }] }), chunk({ tool_calls: [{ index: 0, function: { arguments: '例"}' } }] }), chunk({}, 'tool_calls'), '[DONE]'];
  const server = await gateway(t, [{ events }, { events: textEvents }]);
  const { ctx } = await harness(t, server);
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime);
  let executions = 0;
  ctx.tools.register(defineTool({ name: 'example_lookup', description: 'EXAMPLE ONLY synthetic lookup',
    parameters: { name: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute({ name }) { executions++; assert.equal(name, '示例'); return 'EXAMPLE_ONLY_REFERENCE'; },
  }));
  const tools = ctx.tools.schemas();
  const first = await assemble(ctx, { tools });
  assert.equal(first.finish.kind, 'tool-calls');
  const call = first.blocks.find(block => block.type === 'tool-call');
  assert.ok(call); assert.equal(call.name, 'example_lookup');
  assert.deepEqual(JSON.parse(call.arguments), { name: '示例' });
  const executed = await ctx.tools.execute({ callId: call.id, name: call.name, arguments: JSON.parse(call.arguments), signal: new AbortController().signal });
  assert.equal(executed.isError, false); assert.equal(executions, 1);
  const second = await assemble(ctx, { tools, messages: [{ role: 'user', content: [{ type: 'text', text: 'EXAMPLE ONLY' }] }, first.message, createToolResultMessage({ callId: call.id, content: executed.content, isError: false })] });
  assert.equal(second.finish.kind, 'stop'); assert.equal(executions, 1);
  assert.equal(server.requests.length, 2);
  assert.equal(server.requests[0].body.tools[0].function.name, 'example_lookup');
  const result = server.requests[1].body.messages.find(message => message.role === 'tool');
  assert.equal(result.tool_call_id, call.id); assert.equal(result.content, 'EXAMPLE_ONLY_REFERENCE');
});

test('C12: missing or removed named credentials fail before any provider request', async t => {
  const server = await gateway(t, [{ events: textEvents }]);
  const host = await harness(t, server, {}, false);
  const missing = await assemble(host.ctx);
  assert.equal(missing.finish.failure.code, 'MISSING_CREDENTIAL'); assert.equal(server.requests.length, 0);
  host.setConfigured(true);
  assert.equal((await assemble(host.ctx)).finish.kind, 'stop');
  host.setConfigured(false);
  assert.equal((await assemble(host.ctx)).finish.failure.code, 'MISSING_CREDENTIAL');
  assert.equal(server.requests.length, 1);
});

test('C12: HTTP failures retain stable routing codes and never retry the gateway request', async t => {
  // 402 has no distinct mapping in the pinned adapter. Keep this gap visible.
  for (const [status, code] of [[401, 'AUTH'], [402, 'PI_AI_ERROR'], [429, 'RATE_LIMIT'], [500, 'SERVER']]) {
    await t.test(`HTTP ${status}`, async child => {
      const server = await gateway(child, [{ status }]);
      const { ctx } = await harness(child, server);
      const result = await assemble(ctx);
      assert.equal(result.finish.kind, 'error'); assert.equal(result.finish.failure.code, code);
      assert.equal(server.requests.length, 1);
    });
  }
});

test('C12: cancelling an active stream closes its HTTP connection without a replacement request', async t => {
  const server = await gateway(t, [{ events: [chunk({ role: 'assistant', content: '示例' })], holdOpen: true }]);
  const { ctx } = await harness(t, server);
  const controller = new AbortController();
  const pending = assemble(ctx, { signal: controller.signal });
  await server.received; controller.abort('EXAMPLE ONLY cancellation');
  const result = await pending;
  assert.equal(result.finish.kind, 'aborted'); assert.equal(result.finish.failure.code, 'ABORTED');
  await Promise.race([server.closed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('cancelled connection remained open')), 2000); timer.unref(); })]);
  assert.equal(server.requests.length, 1);
});

test('C12: an idle stream times out and closes without automatic retry', async t => {
  const server = await gateway(t, [{ holdOpen: true }]);
  const { ctx } = await harness(t, server, { streamIdleTimeoutMs: 150 });
  const result = await assemble(ctx);
  assert.equal(result.finish.kind, 'error'); assert.equal(result.finish.failure.code, 'TIMEOUT');
  await server.closed; assert.equal(server.requests.length, 1);
});

test('C12: an output limit cannot turn a truncated tool call into executable content', async t => {
  const server = await gateway(t, [{ events: [chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'EXAMPLE_ONLY_TRUNCATED', type: 'function', function: { name: 'example_lookup', arguments: '{"name":' } }] }), chunk({}, 'length'), '[DONE]'] }]);
  const { ctx } = await harness(t, server);
  const result = await assemble(ctx);
  assert.equal(result.finish.kind, 'max-tokens');
  assert.equal(result.blocks.some(block => block.type === 'tool-call'), false);
});
