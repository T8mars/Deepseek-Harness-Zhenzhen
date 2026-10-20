import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, realpath, readFile, rm } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm';
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai';
import { parse } from 'yaml';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { GATEWAY_CHECK_POLICY, GATEWAY_CHECK_MODEL, GATEWAY_CHECK_PROMPT } from '../packages/dsh-zhen/lib/gateway-check-schema.js';

const EXAMPLE_KEY = 'EXAMPLE_ONLY_LOOPBACK_CREDENTIAL';
const patch = parse(await readFile(new URL('../packages/dsh-zhen/cordis.patch.yml', import.meta.url), 'utf8'));
async function harness(t, mode = 'success') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-zhen-check-contract-')));
  const previous = process.env.DSH_HOME; process.env.DSH_HOME = root;
  const requests = [], arrived = Promise.withResolvers(), disconnected = Promise.withResolvers();
  const server = createServer((request, response) => {
    const parts = [];
    response.on('close', () => disconnected.resolve());
    request.on('data', value => parts.push(value));
    request.on('end', () => {
      requests.push({ path: request.url, authenticated: request.headers.authorization === `Bearer ${EXAMPLE_KEY}`, body: JSON.parse(Buffer.concat(parts).toString('utf8')) });
      arrived.resolve();
      if (mode === 'error') { response.writeHead(500, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: { message: 'EXAMPLE_PRIVATE_PROVIDER_PAYLOAD' } })); return; }
      response.writeHead(200, { 'content-type': 'text/event-stream' }); response.flushHeaders();
      if (mode === 'hold') return;
      const event = (delta, finish_reason = null, extra = {}) => `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }], ...extra })}\n\n`;
      response.write(event({ role: 'assistant', content: 'EXAMPLE_PRIVATE_RESPONSE' }));
      response.write(event({}, 'stop', { usage: { prompt_tokens: 9, completion_tokens: 2, total_tokens: 11 } }));
      response.end('data: [DONE]\n\n');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const ctx = new Context(), values = new Map([['SEEDANCE_API_KEY', EXAMPLE_KEY]]); let resolved = 0;
  ctx.provide('credentials', {
    describe: async ref => ({ configured: values.has(ref), writable: true }),
    set: async (ref, value) => { values.set(ref, value); }, unset: async ref => { values.delete(ref); },
    resolve: async ref => { resolved++; return values.has(ref) ? { value: values.get(ref), source: 'file' } : undefined; },
    readRecord: async () => undefined, listRecords: async () => [],
  });
  t.after(async () => {
    await ctx.fiber.dispose();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    const rel = relative(await realpath(tmpdir()), await realpath(root));
    assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..'));
    await rm(root, { recursive: true, force: true });
  });
  await ctx.plugin(LlmRuntime);
  const config = structuredClone(patch.find(row => row.id === 'llm-pi-ai').config);
  config.providers.seedance.baseURL = `http://127.0.0.1:${server.address().port}/v1`;
  await ctx.plugin(PiAi, config); await ctx.plugin(ZhenService);
  return { service: ctx.get('zhen'), root, requests, arrived: arrived.promise, disconnected: disconnected.promise, resolutions: () => resolved };
}

test('C19: published prepared-call and Host/Remote preview send one fixed bounded Flash stream and retain no reply', async t => {
  const h = await harness(t), service = h.service;
  const preview = await service.gatewayCheckPreview();
  assert.equal(h.requests.length, 0); assert.equal(h.resolutions(), 0, 'preview must not resolve a credential value');
  assert.deepEqual(TYPERT_REMOTE.methods['zhen/gatewayCheckPreview'].result.create().parse(preview), preview);
  const result = await service.gatewayCheckRun(preview.receipt.id, GATEWAY_CHECK_POLICY);
  assert.equal(result.state, 'passed'); assert.equal(result.inputTokens, 9); assert.equal(result.outputTokens, 2);
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].path, '/v1/chat/completions'); assert.equal(h.requests[0].authenticated, true);
  const wire = h.requests[0].body;
  assert.equal(wire.model, GATEWAY_CHECK_MODEL); assert.equal(wire.max_tokens, 32); assert.equal(wire.max_completion_tokens, undefined);
  assert.equal(wire.stream, true); assert.equal(wire.tools, undefined);
  assert.deepEqual(wire.messages, [{ role: 'user', content: GATEWAY_CHECK_PROMPT }]);
  assert.deepEqual(await service.gatewayCheckRun(preview.receipt.id, GATEWAY_CHECK_POLICY), result); assert.equal(h.requests.length, 1);
  const receipts = service.gatewayCheckHistory();
  assert.deepEqual(TYPERT_REMOTE.methods['zhen/gatewayCheckHistory'].result.create().parse(receipts), receipts);
  const stored = await readFile(join(h.root, 'dsh-zhen', 'gateway-checks.sqlite'));
  for (const secret of [EXAMPLE_KEY, 'EXAMPLE_PRIVATE_RESPONSE']) assert.equal(stored.includes(Buffer.from(secret)), false);
  assert.equal((await service.status()).gatewayVerified, false, 'one limited historical check cannot certify all gateway functionality');
});

test('C19: published adapter error is one request with a redacted receipt and no recovery chain', async t => {
  const h = await harness(t, 'error'), preview = await h.service.gatewayCheckPreview();
  const result = await h.service.gatewayCheckRun(preview.receipt.id, GATEWAY_CHECK_POLICY);
  assert.equal(result.state, 'failed'); assert.equal(result.code, 'SERVER'); assert.equal(h.requests.length, 1);
  assert.equal(JSON.stringify(result).includes('EXAMPLE_PRIVATE'), false);
  await h.service.gatewayCheckRun(preview.receipt.id, GATEWAY_CHECK_POLICY); assert.equal(h.requests.length, 1);
});

test('C19: explicit cancellation closes the published adapter connection and credential changes revoke previews', async t => {
  const h = await harness(t, 'hold'), preview = await h.service.gatewayCheckPreview();
  const running = h.service.gatewayCheckRun(preview.receipt.id, GATEWAY_CHECK_POLICY);
  await h.arrived; h.service.gatewayCheckCancel(preview.receipt.id);
  assert.equal((await running).state, 'cancelled'); await h.disconnected; assert.equal(h.requests.length, 1);
  const pending = await h.service.gatewayCheckPreview();
  await h.service.removeCredential();
  assert.equal((await h.service.gatewayCheckRun(pending.receipt.id, GATEWAY_CHECK_POLICY)).state, 'cancelled');
  await assert.rejects(h.service.gatewayCheckPreview(), error => error.details.reason === 'MISSING_CREDENTIAL');
  assert.equal(h.requests.length, 1);
});

test('C19: connection-check RPC accepts no arbitrary prompt, model, endpoint, key, tools or false confirmation', () => {
  const run = TYPERT_REMOTE.methods['zhen/gatewayCheckRun'].input({ strict: true }).create();
  const args = { id: 'c6ec98c9-c314-4d2a-9f98-8eceee7a41f0', confirmation: GATEWAY_CHECK_POLICY };
  assert.deepEqual(run.parse(args), args);
  for (const field of ['prompt', 'model', 'baseURL', 'key', 'tools']) assert.throws(() => run.parse({ ...args, [field]: 'EXAMPLE_ONLY' }));
  assert.throws(() => run.parse({ ...args, confirmation: true })); assert.throws(() => run.parse({ ...args, id: '../EXAMPLE_ONLY' }));
});

test('C19: a confirmed receipt uses the adapter generation captured before a registry replacement', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-zhen-check-generation-')));
  const previous = process.env.DSH_HOME; process.env.DSH_HOME = root;
  const ctx = new Context(), used = [];
  class ExampleAdapter extends LlmAdapter {
    constructor(label) { super(); this.label = label; }
    async *stream() { used.push(this.label); yield { type: 'text-delta', index: 0, text: 'EXAMPLE_REPLY' }; yield { type: 'finish', reason: { kind: 'stop' } }; }
  }
  ctx.provide('credentials', { describe: async () => ({ configured: true, writable: true }) });
  try {
    await ctx.plugin(LlmRuntime);
    const removeOld = ctx.llm.registerAdapter(['seedance'], new ExampleAdapter('EXAMPLE_GENERATION_A'));
    await ctx.plugin(ZhenService);
    const service = ctx.get('zhen'), preview = await service.gatewayCheckPreview();
    removeOld(); ctx.llm.registerAdapter(['seedance'], new ExampleAdapter('EXAMPLE_GENERATION_B'));
    assert.equal((await service.gatewayCheckRun(preview.receipt.id, GATEWAY_CHECK_POLICY)).state, 'passed');
    assert.deepEqual(used, ['EXAMPLE_GENERATION_A']);
  } finally {
    await ctx.fiber.dispose();
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    const rel = relative(await realpath(tmpdir()), await realpath(root));
    assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..'));
    await rm(root, { recursive: true, force: true });
  }
});
