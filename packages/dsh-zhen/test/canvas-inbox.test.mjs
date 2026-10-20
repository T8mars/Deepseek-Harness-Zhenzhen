import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CanvasInbox } from '../lib/canvas-inbox.js';
import { CanvasWorkflow } from '../lib/canvas-workflow.js';
import { canvasWorkflowFixture } from '../../../contracts/fixtures/canvas-workflow.mjs';
import { canvasCatalog } from '../../../contracts/fixtures/canvas.mjs';
const config = { root: 'EXAMPLE_REVIEWED_CLI', digest: 'a'.repeat(64), instance: '' };
const tool = canvasCatalog.tools.find(tool => tool.capabilityId === 'create.image');
const args = { tool: tool.name, version: tool.version, operation: 'plan', projectId: 'EXAMPLE_PROJECT', canvasId: 'EXAMPLE_CANVAS', input: { prompt: 'EXAMPLE_GOAL' } };
function packet() {
  const plan = { schema: 't8-creative-plan-v1', planId: randomUUID(), planDigest: '6'.repeat(64), projectId: args.projectId, canvasId: args.canvasId, canvasRevision: 7, action: 'create.image', kind: 'image', brief: { goal: 'EXAMPLE_GOAL' }, ready: true, candidateCount: 1, questions: [], impact: { patchOperationCount: 3 }, visibleAssumptions: { models: { image: { provider: 'EXAMPLE_PROVIDER', model: 'EXAMPLE_MODEL' } } }, patchId: randomUUID(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), approvalBinding: { action: 'creative.apply', sessionId: randomUUID(), projectId: args.projectId, canvasId: args.canvasId, planDigest: '6'.repeat(64) } };
  return { structuredContent: { schema: 't8-versioned-creative-tool-result-v1', tool: { name: tool.name, version: tool.version, capabilityId: tool.capabilityId, operation: 'plan', requestAction: 'create.image' }, contract: { protocol: 't8-versioned-creative-tool-v1', capabilityManifestDigest: canvasCatalog.capabilityManifestDigest, capabilityGraphDigest: canvasCatalog.capabilityGraphDigest, riskLevel: 'L0', approvalRequired: false, requiredScopes: ['canvas:read'] }, request: { projectId: args.projectId, canvasId: args.canvasId, clientRequestId: null }, readOnly: true, directInternalAccess: false, sideEffects: { canvasWrites: 0, providerCalls: 0, fileWrites: 0 }, data: plan } };
}
const capture = callId => ({ config, sessionId: 'EXAMPLE_CHAT_SESSION', callId });
test('inbox binds accepted structured results to request and configuration, copies values and caps sixteen entries', () => {
  const inbox = new CanvasInbox(), value = packet(); inbox.observe(capture('EXAMPLE_CALL_1'), config, args, value);
  const first = inbox.list(config)[0]; assert.equal(first.preview.planId, value.structuredContent.data.planId); assert.equal(first.preview.goal, 'EXAMPLE_GOAL');
  value.structuredContent.data.brief.goal = 'EXAMPLE_MUTATED_AFTER_OBSERVATION'; assert.equal(inbox.list(config)[0].preview.goal, 'EXAMPLE_GOAL');
  first.preview.goal = 'EXAMPLE_MUTATED_PUBLIC_VIEW'; assert.equal(inbox.list(config)[0].preview.goal, 'EXAMPLE_GOAL');
  inbox.observe(capture('EXAMPLE_CALL_1'), config, args, packet()); assert.equal(inbox.list(config).length, 1);
  for (let index = 0; index < 25; index++) inbox.observe(capture(`EXAMPLE_CALL_${index}`), config, args, packet());
  assert.equal(inbox.list(config).length, 16); assert.equal(inbox.list({ ...config, digest: 'b'.repeat(64) }).length, 0);
  assert.equal(inbox.get(first.id, config), undefined); const last = inbox.list(config)[0]; inbox.remove(last.id); assert.equal(inbox.list(config).length, 15); inbox.clear(); assert.deepEqual(inbox.list(config), []);
  const long = packet(); long.structuredContent.data.brief.goal = '鲸'.repeat(4000); inbox.observe(capture('EXAMPLE_LONG_CALL'), config, args, long);
  const short = inbox.list(config)[0]; assert.equal(short.preview.goal.length, 241); assert.equal(inbox.get(short.id, config).plan.brief.goal.length, 4000);
});
test('plain text, paid results, foreign targets, carriers, plan/binding drift and stale configuration do not stage', () => {
  const changes = [value => { value.structuredContent.contract.riskLevel = 'L2'; }, value => { value.structuredContent.data.schema = 'EXAMPLE_RUN_QUOTE'; }, value => { value.structuredContent.data.approvalBinding.action = 'run.start'; }, value => { value.structuredContent.data.approvalBinding.planDigest = '9'.repeat(64); }, value => { value.structuredContent.request.canvasId = 'EXAMPLE_OTHER_CANVAS'; }, value => { value.structuredContent.tool.version = '0.0.0'; }, value => { value.structuredContent.data.expiresAt = new Date(0).toISOString(); }];
  for (const change of changes) { const inbox = new CanvasInbox(), value = packet(); change(value); inbox.observe(capture('EXAMPLE_CALL'), config, args, value); assert.deepEqual(inbox.list(config), []); }
  const inbox = new CanvasInbox(); inbox.observe(capture('EXAMPLE_CALL'), config, { ...args, input: { route: '/EXAMPLE_FORBIDDEN' } }, packet());
  inbox.observe(capture('EXAMPLE_CALL'), { ...config, instance: 'EXAMPLE_CHANGED_INSTANCE' }, args, packet()); inbox.observe(capture('EXAMPLE_CALL'), config, args, { content: [{ type: 'text', text: JSON.stringify(packet()) }] }); assert.deepEqual(inbox.list(config), []);
});
test('zero-candidate native structural actions use their explicit action label when no creative goal exists', () => {
  const inbox = new CanvasInbox(), value = packet(); value.structuredContent.data.candidateCount = 0; value.structuredContent.data.kind = 'graph'; value.structuredContent.data.action = 'graph.node-add'; value.structuredContent.data.brief = {};
  inbox.observe(capture('EXAMPLE_GRAPH_CALL'), config, args, value);
  const candidate = inbox.list(config)[0]; assert.ok(candidate); assert.equal(candidate.preview.candidates, 0); assert.equal(candidate.preview.goal, '画布操作：graph.node-add');
});
test('existing native plan is adopted without replanning; session changes and pending operations retain their barriers', async t => {
  const f = await canvasWorkflowFixture(); t.after(() => f.dispose());
  await f.preview(); const plan = f.flowState.latest.plan, value = packet(); value.structuredContent.data = plan;
  const inbox = new CanvasInbox(); inbox.observe({ ...capture('EXAMPLE_CALL'), config: f.config() }, f.config(), args, value);
  const item = inbox.get(inbox.list(f.config())[0].id, f.config()); assert.ok(item);
  const accepted = await f.workflow.adopt(item); assert.equal(accepted.planId, plan.planId); assert.equal(f.flowState.plans, 1); assert.equal(f.flowState.requests, 0); assert.equal(f.flowState.mutations, 0);
  await f.workflow.approve(accepted.id, true); await assert.rejects(f.workflow.adopt(item), error => error.code === 'WORKFLOW_PENDING');
  f.windowDeny(); await f.workflow.complete(accepted.id);
  await f.pair(); await assert.rejects(f.workflow.adopt(item), error => error.code === 'WORKFLOW_CONNECTION_CHANGED');
});
test('twelve thousand Chinese characters remain readable after native preview and Host restart', async t => {
  const f = await canvasWorkflowFixture(); t.after(() => f.dispose());
  const goal = '鲸'.repeat(12000), plan = await f.workflow.preview({ projectId: args.projectId, canvasId: args.canvasId, kind: 'image', prompt: goal });
  assert.equal(plan.goal, goal); assert.ok(Buffer.byteLength(readFileSync(f.file, 'utf8')) > 32768);
  const restarted = new CanvasWorkflow(f.file, f.config); t.after(() => restarted.close()); assert.equal(restarted.snapshot().goal, goal);
  const pending = await restarted.approve(plan.id, true); assert.equal(pending.phase, 'pending'); assert.equal(f.flowState.mutations, 0);
});
