import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Context } from '@deepseek-ai/cordis';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { exampleTask, exampleTaskId } from './fixtures/gateway-tasks.mjs';

const endpoints = [['video', '/v1/videos/'], ['legacy-video', '/v1/video/generations/'], ['image', '/v1/image/generations/'], ['audio', '/v1/audio/generations/'], ['three-d', '/v1/3d/generations/'], ['music', '/v1/music/tasks/'], ['midjourney', '/v1/midjourney/tasks/'], ['minimax-v2', '/v2/query/video_generation/']];
async function environment(work, handler) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-zhen-task-contract-'))), previousHome = process.env.DSH_HOME, realFetch = globalThis.fetch;
  const requests = [], hosts = [];
  const server = createServer((request, response) => {
    requests.push({ path: request.url, method: request.method, authorization: request.headers.authorization });
    const route = endpoints.find(([, path]) => request.url.startsWith(path));
    assert.ok(route, 'Only a documented task-query path may reach this synthetic server.'); assert.equal(request.method, 'GET');
    const id = request.url.slice(route[1].length); assert.ok(/^[A-Za-z0-9_-]+$/.test(id));
    if (handler) handler({ request, response, protocol: route[0], id });
    else { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(exampleTask(route[0], { id }))); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.DSH_HOME = root;
  globalThis.fetch = async (input, options) => {
    const target = new URL(input); assert.equal(target.origin, 'https://api.seedance.nz'); assert.equal(target.search, ''); assert.equal(options.redirect, 'error'); assert.equal(options.method, 'GET');
    return realFetch(`http://127.0.0.1:${server.address().port}${target.pathname}`, options);
  };
  async function host() {
    let key = 'EXAMPLE_TEST_ONLY_KEY', reads = 0; const ctx = new Context();
    ctx.provide('credentials', { resolve: async ref => { assert.equal(ref, credentialRef('SEEDANCE_API_KEY')); reads++; return key ? { value: key, source: 'example' } : undefined; }, describe: async () => ({ configured: !!key, writable: true }), set: async (_ref, value) => { key = value; }, unset: async () => { key = ''; } });
    await ctx.plugin(ZhenService); const item = { ctx, service: ctx.get('zhen'), reads: () => reads }; hosts.push(item); return item;
  }
  try { await work({ host, requests, root }); }
  finally {
    for (const h of hosts.reverse()) await h.ctx.fiber.dispose();
    globalThis.fetch = realFetch; if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    const rel = relative(realpathSync.native(tmpdir()), root); assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..')); rmSync(root, { recursive: true, force: true });
  }
}

test('C141: actual published Host and Remote accept a generic TaskDto numeric row id with matching public task_id', async () => {
  await environment(async ({host,requests})=>{
    const h=await host(),item=await h.service.gatewayTaskAdd({protocol:'image',taskId:exampleTaskId}),result=await h.service.gatewayTaskRefresh(item.id);
    assert.equal(result.status,'succeeded');assert.equal(result.code,'');assert.equal(result.resultCount,2);
    assert.deepEqual(result.usage,{amount:1.23456789,currency:'EXAMPLE积分'});
    assert.deepEqual(TYPERT_REMOTE.methods['zhen/gatewayTaskRefresh'].result.create().parse(result),result);
    assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');
    const encoded=JSON.stringify(result);for(const text of ['12345','PRIVATE','https://','EXAMPLE_SIGNATURE'])assert.equal(encoded.includes(text),false);
    console.log(JSON.stringify({contract:'C141',actualPublishedHostAndRemote:true,numericRowIdNotPublicIdentity:true,exactTaskIdStillRequired:true,customUnitAndBilledAmountPreserved:true,readOnlyQueries:true,internalRowIdAndSignedUrlsNotReturned:true,nativeRequests:0,modelRequests:0}));
  },({response})=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify(exampleTask('image',{record:{id:12345,task_id:exampleTaskId,usage:{amount:1.23456789,currency:'EXAMPLE积分'}}})));});
});

test('C22: successful HTTP Retry-After survives the published Host and Remote boundary and restart without an early query',async()=>{
 await environment(async({host,requests})=>{const first=await host(),item=await first.service.gatewayTaskAdd({protocol:'image',taskId:exampleTaskId});await first.service.gatewayTaskTracking(item.id,true);const pending=await first.service.gatewayTaskRefresh(item.id);assert.equal(pending.status,'running');const wait=Date.parse(pending.nextCheckAt)-Date.parse(pending.checkedAt);assert.ok(wait>=60000&&wait<61000);assert.deepEqual(TYPERT_REMOTE.methods['zhen/gatewayTaskRefresh'].result.create().parse(pending),pending);await first.ctx.fiber.dispose();const reopened=await host();assert.equal((await reopened.service.gatewayTaskList())[0].nextCheckAt,pending.nextCheckAt);await reopened.service.gatewayTaskRefresh(item.id);await delay(6100);assert.equal(requests.length,1);assert.equal(reopened.reads(),0);console.log(JSON.stringify({contract:'C22',successfulRetryAfterThroughActualHttp:true,persistedAcrossPublishedHostRestart:true,manualAndAutomaticWaitPreserved:true,readOnlyRequests:1,submitRequests:0}));},({response})=>{response.setHeader('Content-Type','application/json');response.setHeader('Retry-After','60');response.end(JSON.stringify(exampleTask('image',{record:{status:'IN_PROGRESS'}})));});
});

test('C22: published Host/Remote queries eight independent documented routes through a real isolated HTTP transport without returning provider material', async () => {
  await environment(async ({ host, requests }) => {
    const h = await host(); assert.deepEqual(await h.service.gatewayTaskList(), []); assert.equal(h.reads(), 0);
    for (const [protocol, path] of endpoints) {
      const item = await h.service.gatewayTaskAdd({ protocol, taskId: exampleTaskId });
      const result = await h.service.gatewayTaskRefresh(item.id);
      assert.deepEqual(TYPERT_REMOTE.methods['zhen/gatewayTaskRefresh'].result.create().parse(result), result);
      assert.equal(result.status, 'succeeded'); assert.equal(result.usage.currency, 'CNY'); assert.equal(result.usage.amount, 1.23456789);
      assert.equal(requests.at(-1).path, path + exampleTaskId); assert.equal(requests.at(-1).authorization, 'Bearer EXAMPLE_TEST_ONLY_KEY');
      const text = JSON.stringify(result); for (const forbidden of ['PRIVATE', 'EXAMPLE_SIGNATURE', 'https://', 'cost', 'lyrics', 'EXAMPLE_TEST_ONLY_KEY']) assert.equal(text.includes(forbidden), false);
    }
    assert.equal(h.reads(), 8); assert.equal(requests.length, 8);
    const all = await h.service.gatewayTaskList(); assert.deepEqual(TYPERT_REMOTE.methods['zhen/gatewayTaskList'].result.create().parse(all), all);
    const input = TYPERT_REMOTE.methods['zhen/gatewayTaskAdd'].parameters[0].strictCodec.create();
    for (const spec of [{ protocol: 'image', taskId: exampleTaskId, key: 'EXAMPLE_FORBIDDEN' }, { protocol: 'image', taskId: 'https://example.com/path' }, { protocol: 'submit', taskId: exampleTaskId }]) assert.equal(input.safeParse(spec).success, false);
  });
});

test('C22: published Host resumes only explicitly enabled existing-task polling after restart and stops at terminal usage', async () => {
  await environment(async ({ host, requests }) => {
    const first = await host(), item = await first.service.gatewayTaskAdd({ protocol: 'image', taskId: exampleTaskId });
    await first.service.gatewayTaskTracking(item.id, true); assert.equal(first.reads(), 0); await first.ctx.fiber.dispose();
    const second = await host(); assert.equal((await second.service.gatewayTaskList())[0].tracking, true); assert.equal(second.reads(), 0);
    for (let i = 0; i < 65 && requests.length === 0; i++) await delay(100);
    for (let i = 0; i < 20 && (await second.service.gatewayTaskList())[0].status !== 'succeeded'; i++) await delay(25);
    const result = (await second.service.gatewayTaskList())[0]; assert.equal(result.status, 'succeeded'); assert.equal(result.tracking, false); assert.equal(second.reads(), 1); assert.equal(requests.length, 1);
    await second.service.gatewayTaskRemove(item.id); assert.deepEqual(await second.service.gatewayTaskList(), []); assert.equal(requests.length, 1);
  });
});

test('C22: credential replacement cancels the previous Host query generation and the next task uses only the newly resolved credential', async () => {
  let began; const started = new Promise(resolve => { began = resolve; }); let release;
  await environment(async ({ host, requests }) => {
    const h = await host(), item = await h.service.gatewayTaskAdd({ protocol: 'image', taskId: exampleTaskId }); await h.service.gatewayTaskTracking(item.id, true);
    const pending = h.service.gatewayTaskRefresh(item.id); await started;
    await h.service.saveCredential('EXAMPLE_NEW_TEST_ONLY_KEY'); release();
    const result = await pending; assert.equal(result.code, 'CONFIG_CHANGED'); assert.equal(result.tracking, false); assert.equal(result.status, 'unknown');
    const next = await h.service.gatewayTaskAdd({ protocol: 'image', taskId: 'task_EXAMPLE_NEXT' }); await h.service.gatewayTaskRefresh(next.id);
    assert.equal(requests.length, 2); assert.equal(requests[1].authorization, 'Bearer EXAMPLE_NEW_TEST_ONLY_KEY'); assert.equal(h.reads(), 2);
  }, ({ response, protocol, id }) => {
    const send = () => { if (!response.destroyed) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(exampleTask(protocol, { id }))); } };
    if (id === exampleTaskId) { release = send; began(); } else send();
  });
});
