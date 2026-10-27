import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, realpath, readFile, rm,writeFile } from 'node:fs/promises';
import { join, relative, isAbsolute,resolve } from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm';
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai';
import { parse } from 'yaml';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { GATEWAY_CHECK_POLICY, GATEWAY_CHECK_MODEL, GATEWAY_CHECK_PROMPT } from '../packages/dsh-zhen/lib/gateway-check-schema.js';
import {GatewayChecks} from '../packages/dsh-zhen/lib/gateway-check.js';
import {ownedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';

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
      if(typeof mode==='object'){response.writeHead(mode.status,{'content-type':'application/json'});response.end(JSON.stringify({error:{message:mode.message,type:mode.type,code:mode.type}}));return;}
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
  return { ctx,service: ctx.get('zhen'), root, requests, arrived: arrived.promise, disconnected: disconnected.promise, resolutions: () => resolved };
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

for(const status of [402,429])test(`C19: published quota failure at HTTP${status} remains QUOTA through Host/Remote history without retry`,async t=>{
 const h=await harness(t,{status,message:'EXAMPLE_PRIVATE_PROVIDER_PAYLOAD insufficient quota',type:'insufficient_quota'}),preview=await h.service.gatewayCheckPreview();
 const result=await h.service.gatewayCheckRun(preview.receipt.id,GATEWAY_CHECK_POLICY);assert.equal(result.state,'failed');assert.equal(result.code,'QUOTA');assert.equal(h.requests.length,1);
 assert.deepEqual(TYPERT_REMOTE.methods['zhen/gatewayCheckRun'].result.create().parse(result),result);assert.deepEqual(h.service.gatewayCheckHistory()[0],result);assert.deepEqual(await h.service.gatewayCheckRun(result.id,GATEWAY_CHECK_POLICY),result);assert.equal(h.requests.length,1);
 const stored=await readFile(join(h.root,'dsh-zhen','gateway-checks.sqlite'));for(const secret of [EXAMPLE_KEY,'EXAMPLE_PRIVATE_PROVIDER_PAYLOAD'])assert.equal(stored.includes(Buffer.from(secret)),false);
});

test('C19: a scoped owner caller can check the connection without injecting the LLM service itself',async t=>{
 const h=await harness(t,{status:402,message:'EXAMPLE_PRIVATE_PROVIDER_PAYLOAD insufficient quota',type:'insufficient_quota'});let caller;await h.ctx.plugin({inject:['zhen'],apply(scope){caller=scope;}});assert.ok(caller);
 const preview=await caller.zhen.gatewayCheckPreview();assert.equal(h.requests.length,0);const result=await caller.zhen.gatewayCheckRun(preview.receipt.id,GATEWAY_CHECK_POLICY);assert.equal(result.code,'QUOTA');assert.equal(h.requests.length,1);await caller.zhen.gatewayCheckRun(result.id,GATEWAY_CHECK_POLICY);assert.equal(h.requests.length,1);
});

test('C19: a generic payment-required response retains the published unclassified failure rather than guessing an account balance',async t=>{
 const h=await harness(t,{status:402,message:'EXAMPLE_PRIVATE_PROVIDER_PAYLOAD payment required',type:'payment_required'}),preview=await h.service.gatewayCheckPreview(),result=await h.service.gatewayCheckRun(preview.receipt.id,GATEWAY_CHECK_POLICY);
 assert.equal(result.code,'PI_AI_ERROR');assert.equal(h.requests.length,1);assert.equal(JSON.stringify(result).includes('EXAMPLE_PRIVATE'),false);await h.service.gatewayCheckRun(result.id,GATEWAY_CHECK_POLICY);assert.equal(h.requests.length,1);
});

test('C19: quota history survives reopening and the exact dev122 reader and writer remain usable after an upgrade',async()=>{
 const base=await realpath(tmpdir()),prefix='dsh-check-compat-EXAMPLE-',root=await realpath(await mkdtemp(join(base,prefix))),lease=ownedTempCleanup(base,root,prefix),file=join(root,'EXAMPLE_CHECKS.sqlite');let checks;
 const config={provider:'seedance',model:GATEWAY_CHECK_MODEL,maxTokens:32},failure=async()=>({config,retryPolicy:{mode:'normal',maxRetries:0},stream:async function*(){yield{type:'finish',reason:{kind:'error',failure:{code:'QUOTA',message:'EXAMPLE_PRIVATE_QUOTA'}}};}});
 try{
  checks=new GatewayChecks(file,failure);const preview=await checks.preview(),result=await checks.run(preview.receipt.id,GATEWAY_CHECK_POLICY);assert.equal(result.code,'QUOTA');await checks.close();checks=undefined;
  const baseline='90ee4d05596229dd4bdf80d91449c34c1c153a10',source=name=>execFileSync('git',['show',baseline+':packages/dsh-zhen/src/'+name],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
  // Run the prior tagged implementation, rather than a duplicate reader schema.
  for(const name of ['gateway-check.ts','gateway-check-schema.ts'])await writeFile(join(root,name),source(name));
  const owned=resolve('packages/dsh-zhen/src/owned-store-source.ts');assert.equal((await readFile(owned,'utf8')).replace(/\r\n/g,'\n'),source('owned-store-source.ts').replace(/\r\n/g,'\n'));
  const old=join(root,'EXAMPLE_DEV122.mjs');await build({entryPoints:[join(root,'gateway-check.ts')],outfile:old,bundle:true,platform:'node',format:'esm',target:'node22',nodePaths:[resolve('node_modules')],plugins:[{name:'EXAMPLE_UNCHANGED_OWNED_STORE',setup(b){b.onResolve({filter:/^\.\/owned-store-source\.ts$/},()=>({path:owned}));}}],logLevel:'silent'});
  const {GatewayChecks:LegacyChecks}=await import(pathToFileURL(old).href);let oldCalls=0;const legacy=new LegacyChecks(file,async()=>({config,retryPolicy:{mode:'normal',maxRetries:0},stream:async function*(){oldCalls++;yield{type:'text-delta',index:0,text:'EXAMPLE_REPLY'};yield{type:'finish',reason:{kind:'stop'}};}}));
  try{assert.equal(legacy.list().find(row=>row.id===result.id).code,'PI_AI_ERROR');const next=await legacy.preview();assert.equal((await legacy.run(next.receipt.id,GATEWAY_CHECK_POLICY)).state,'passed');assert.equal(oldCalls,1);}finally{await legacy.close();}
  checks=new GatewayChecks(file,failure);assert.equal(checks.list().find(row=>row.id===result.id).code,'QUOTA');assert.ok(checks.list().some(row=>row.state==='passed'));assert.equal(JSON.stringify(checks.list()).includes('EXAMPLE_PRIVATE'),false);
 }finally{await checks?.close();await lease.cleanup();}
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
