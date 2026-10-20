import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { mkdtempSync, realpathSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { withMediaTransport, EXAMPLE_MEDIA_URL, EXAMPLE_PNG } from './fixtures/media-transport.mjs';

async function environment(work) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-zhen-media-contract-'))), output = join(root, 'EXAMPLE_OUTPUT'); mkdirSync(output);
  const previousHome = process.env.DSH_HOME, realFetch = globalThis.fetch, hosts = []; let queries = 0;
  process.env.DSH_HOME = root;
  globalThis.fetch = async (input, options) => { assert.equal(input, 'https://api.seedance.nz/v1/image/generations/task_EXAMPLE_MEDIA'); assert.equal(options.method, 'GET'); queries++; return Response.json({ code: 'success', data: { task_id: 'task_EXAMPLE_MEDIA', status: 'SUCCESS', result_url: EXAMPLE_MEDIA_URL, usage: { amount: 0, currency: 'CNY' } } }); };
  async function host() { const ctx = new Context(); let keys = 0;
    ctx.provide('credentials', { resolve: async () => { keys++; return { value: 'EXAMPLE_ONLY_TEST_KEY', source: 'example' }; }, set: async () => {}, unset: async () => {}, describe: async () => ({ configured: true, writable: true }) });
    await ctx.plugin(ZhenService); const h = { ctx, service: ctx.get('zhen'), keys: () => keys }; hosts.push(h); return h;
  }
  try { await work({ host, output, root, queries: () => queries }); }
  finally { for (const h of hosts.reverse()) await h.ctx.fiber.dispose(); globalThis.fetch = realFetch; if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; const rel = relative(realpathSync.native(tmpdir()), root); assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..')); rmSync(root, { recursive: true, force: true }); }
}

test('C23: actual published Host/Remote exports a task result with anonymous pinned media transport, exact bytes and closed URL-free codecs', async () => {
  await environment(async ({ host, output, queries }) => {
    const h = await host(), task = await h.service.gatewayTaskAdd({ protocol: 'image', taskId: 'task_EXAMPLE_MEDIA' }); await h.service.gatewayTaskRefresh(task.id);
    assert.equal(h.keys(), 1); const tickets = await h.service.gatewayMediaPreview(task.id);
    assert.deepEqual(TYPERT_REMOTE.methods['zhen/gatewayMediaPreview'].result.create().parse(tickets), tickets); assert.equal(JSON.stringify(tickets).includes('EXAMPLE_SIGNATURE'), false);
    await withMediaTransport(async ({ requests }) => {
      const result = await h.service.gatewayMediaSave(tickets[0].id, output); assert.deepEqual(TYPERT_REMOTE.methods['zhen/gatewayMediaSave'].result.create().parse(result), result);
      assert.deepEqual(readFileSync(result.path), EXAMPLE_PNG); assert.equal(result.recorded, true); assert.equal(requests.length, 1); assert.equal(h.keys(), 1); assert.equal(queries(), 1);
      assert.equal(JSON.stringify(result).includes('EXAMPLE_SIGNATURE'), false); assert.equal(JSON.stringify(result).includes('EXAMPLE_ONLY_TEST_KEY'), false);
      assert.deepEqual(TYPERT_REMOTE.methods['zhen/gatewayMediaList'].result.create().parse(await h.service.gatewayMediaList()), [result]);
      const tokenCodec = TYPERT_REMOTE.methods['zhen/gatewayMediaSave'].parameters[0].strictCodec.create(); assert.equal(tokenCodec.safeParse(EXAMPLE_MEDIA_URL).success, false);
    });
  });
});

test('C23: changing credentials aborts an in-flight result download without resubmitting a task or retaining partial output', async () => {
  await environment(async ({ host, output, queries }) => {
    const h = await host(), task = await h.service.gatewayTaskAdd({ protocol: 'image', taskId: 'task_EXAMPLE_MEDIA' }); await h.service.gatewayTaskRefresh(task.id); const [ticket] = await h.service.gatewayMediaPreview(task.id);
    let began; const started = new Promise(resolve => { began = resolve; });
    await withMediaTransport(async ({ requests }) => {
      const pending = h.service.gatewayMediaSave(ticket.id, output); await started; await h.service.saveCredential('EXAMPLE_NEW_TEST_KEY');
      await assert.rejects(pending); await assert.rejects(h.service.gatewayMediaSave(ticket.id, output)); assert.deepEqual(readdirSync(output), []); assert.equal(requests.length, 1); assert.equal(queries(), 1);
    }, (_request, response) => { response.write(EXAMPLE_PNG.subarray(0, 20)); began(); });
  });
});

test('C23: restarted published Host retains export receipts, forget/remove do not delete media, and reading history never resolves a credential', async () => {
  await environment(async ({ host, output }) => {
    const first = await host(), task = await first.service.gatewayTaskAdd({ protocol: 'image', taskId: 'task_EXAMPLE_MEDIA' }); await first.service.gatewayTaskRefresh(task.id); const [ticket] = await first.service.gatewayMediaPreview(task.id); let receipt;
    await withMediaTransport(async () => { receipt = await first.service.gatewayMediaSave(ticket.id, output); }); await first.ctx.fiber.dispose();
    const second = await host(); assert.equal((await second.service.gatewayMediaList())[0].path, receipt.path); assert.equal(second.keys(), 0);
    await second.service.gatewayTaskRemove(task.id); await second.service.gatewayMediaForget(receipt.id); assert.deepEqual(await second.service.gatewayMediaList(), []); assert.deepEqual(readFileSync(receipt.path), EXAMPLE_PNG); assert.equal(second.keys(), 0);
  });
});
