import test from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';
import {Context} from '@deepseek-ai/cordis';import SystemPrompt from '@deepseek-ai/dsh-system-prompt';import ToolRuntime from '@deepseek-ai/dsh-tools';import Typert from '@deepseek-ai/dsh-typert-registry';import Access from '@deepseek-ai/dsh-api-remote-access';import Gateway from '@deepseek-ai/dsh-api-gateway';
import ZhenService from '../packages/dsh-zhen/lib/index.js';import {TYPERT} from '../packages/dsh-zhen/lib/typert.js';import {TYPERT_REMOTE} from '../packages/dsh-zhen/lib/remote.js';import {canvasWorkflowFixture} from './fixtures/canvas-workflow.mjs';

test('C66: actual published Host/Gateway projects workspace completeness, denies anonymous reads and refuses inconsistent identities without planning', async () => {
 const f = await canvasWorkflowFixture(), previous = process.env.DSH_HOME;
 process.env.DSH_HOME = join(f.base, 'EXAMPLE_TARGET_HOST');
 const ctx = new Context();let keys = 0, reads = 0;
 ctx.provide('credentials', {resolve: async () => {keys++; throw Error('EXAMPLE_NO_PROVIDER_KEY');}, describe: async () => ({configured: false, writable: true})});
 const a = {id: 'EXAMPLE_SHARED', projectId: 'EXAMPLE_A', name: 'EXAMPLE alpha', revision: 1, nodeCount: 0};
 const b = {...a, projectId: 'EXAMPLE_B', name: 'EXAMPLE beta'};
 let report = {canvases: [a, b], total: 2, truncated: false, actorId: 'EXAMPLE_NOT_PROJECTED'};
 const original = f.state.route;
 f.state.route = (request, body, auth, response) => {
  if (request.url === '/api/agent-control/v1/workspaces') {
   auth.authenticate(String(request.headers.authorization || '').replace(/^Bearer /, ''), ['canvas:read']);
   reads++; return structuredClone(report);
  }
  return original(request, body, auth, response);
 };
 try {
  for (const plugin of [SystemPrompt, ToolRuntime, Typert, Access, ZhenService]) await ctx.plugin(plugin);
  ctx.typert.register(TYPERT);await ctx.plugin(Gateway, {});
  const config = f.config();await ctx.get('zhen').connectCanvas(config.root, '', config.digest);
  const peer = {id: 'EXAMPLE_OWNER', ctx, principal: {kind: 'owner'}, signal: new AbortController().signal, interactions: 'none', dispose: async () => {}};
  const invoke = (principal = peer.principal) => ctx.typertGateway.invoke({namespace: 'zhen', method: 'canvasWorkspaces', args: {}, peer: {...peer, principal}});
  const result = await invoke();
  assert.equal(result.total, 2);assert.equal(result.truncated, false);assert.equal(result.canvases.length, 2);
  assert.deepEqual(result.canvases.map(item => item.projectId), ['EXAMPLE_A', 'EXAMPLE_B']);
  assert.equal('actorId' in result, false);assert.equal('nodeCount' in result.canvases[0], false);
  assert.deepEqual(TYPERT_REMOTE.methods['zhen/canvasWorkspaces'].result.create().parse(JSON.parse(JSON.stringify(result))), result);
  const before = reads;await assert.rejects(invoke({kind: 'anonymous'}));assert.equal(reads, before);
  report = {canvases: [a]};const legacy = await invoke();assert.equal('total' in legacy, false);assert.equal('truncated' in legacy, false);
  report = {canvases: [a], total: 1, truncated: true};assert.equal((await invoke()).truncated, true);
  for (const invalid of [{canvases: [a, a], total: 2, truncated: false}, {canvases: [a, b], total: 1}, {canvases: [a], total: 1, truncated: 'false'}]) {report = invalid;await assert.rejects(invoke());}
  assert.equal(keys, 0);for (const key of ['plans', 'requests', 'completes', 'mutations']) assert.equal(f.flowState[key], 0);
 } finally {
  await ctx.fiber.dispose();if (previous === undefined) delete process.env.DSH_HOME;else process.env.DSH_HOME = previous;await f.dispose();
 }
});
