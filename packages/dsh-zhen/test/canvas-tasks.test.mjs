import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CanvasTasks } from '../lib/canvas-tasks.js';
import { CanvasBridge } from '../lib/canvas.js';
import { canvasTaskDetailSchema, canvasTaskListSchema } from '../lib/canvas-task-schema.js';
import { canvasRunFixture } from '../../../contracts/fixtures/canvas-run.mjs';
const scope = { projectId: 'EXAMPLE_PROJECT', canvasId: 'EXAMPLE_CANVAS' };
async function fixture(t) { const f = await canvasRunFixture({ runnable: false }), runtime = await new CanvasBridge(f.config()).workflowRuntime(), tasks = new CanvasTasks(f.config); t.after(async () => { tasks.close(); await f.dispose(); }); const intent = { id: randomUUID(), ...scope, canvasRevision: 7, nodeIds: ['EXAMPLE_IMAGE'], requestedBy: runtime.actorId, status: 'accepted', runId: null, queueRevision: 1, provider: 'EXAMPLE_PROVIDER', model: 'EXAMPLE_MODEL', createdAt: Date.now(), updatedAt: Date.now() }; f.intents.set('EXAMPLE_QUERY_OPERATION', intent); return { ...f, tasks, intent, reference: { ...scope, id: intent.id } }; }
function complete(intent) { return { ...intent, status: 'completed', runId: 'EXAMPLE_RUN', completionVerified: true, artifactVerification: { verified: true, reasons: [], run: { runId: 'EXAMPLE_RUN', status: 'completed', canvasRevision: intent.canvasRevision }, nodeRuns: [{ nodeRunId: 'EXAMPLE_NODE_RUN', nodeId: intent.nodeIds[0], status: 'succeeded', latestAttemptId: 'EXAMPLE_ATTEMPT', latestAttemptStatus: 'succeeded', outputAssetIds: ['EXAMPLE_ASSET'] }], assets: [{ assetId: 'EXAMPLE_ASSET', nodeRunId: 'EXAMPLE_NODE_RUN', stored: true, hashVerified: true, magicVerified: true, associationVerified: true }] } }; }
test('read-only pairing lists multiple original intents without a run plan, approval or local task ledger', async t => {
  const f = await fixture(t); const other = { ...f.intent, id: randomUUID() }; f.intents.set('EXAMPLE_SECOND_OPERATION', other); f.runState.enabled = false;
  const list = await f.tasks.list(scope); assert.equal(list.items.length, 2); assert.equal(list.atLimit, false); assert.deepEqual(canvasTaskListSchema.parse(list), list);
  assert.equal(f.state.created[0].requestedScopes.includes('run:execute'), false); assert.equal(f.runState.planPosts + f.runState.approvals + f.runState.completePosts + f.runState.writes, 0);
  const detail = await f.tasks.detail(f.reference); assert.equal(detail.evidence.verdict, 'not-completed'); assert.deepEqual(detail.evidence.reasons, ['run-incomplete']);
  assert.ok(f.state.requests.filter(request => request.path.includes('/run-intents')).every(request => request.method === 'GET'));
});
test('completed alone is not verified; only consistent complete native node/attempt/asset evidence is labelled verified', async t => {
  const f = await fixture(t); f.intent.status = 'completed'; assert.equal((await f.tasks.detail(f.reference)).evidence.verdict, 'unverified');
  f.runState.detailReply = complete(f.intent); const detail = await f.tasks.detail(f.reference); assert.equal(detail.evidence.verdict, 'verified'); assert.equal(detail.evidence.hashVerifiedAssets, 1); assert.deepEqual(detail.evidence.reasons, []); assert.deepEqual(canvasTaskDetailSchema.parse(detail), detail);
});
test('contradictory node, attempt, asset or run evidence never produces a verified result even with native true flags', async t => {
  const f = await fixture(t);
  for (const mutate of [data => { data.artifactVerification.assets = []; }, data => { data.artifactVerification.assets[0].hashVerified = false; }, data => { data.artifactVerification.assets[0].associationVerified = false; }, data => { data.artifactVerification.nodeRuns[0].latestAttemptStatus = 'running'; }, data => { data.artifactVerification.run.runId = 'EXAMPLE_OTHER_RUN'; }, data => { data.artifactVerification.nodeRuns[0].nodeId = 'EXAMPLE_OTHER_NODE'; }, data => { data.artifactVerification.assets.push({ ...data.artifactVerification.assets[0] }); }, data => { data.artifactVerification.nodeRuns[0].outputAssetIds = ['EXAMPLE_OTHER_ASSET']; }, data => { data.artifactVerification.reasons = ['output_asset_unverified:EXAMPLE_ASSET']; }]) {
    const data = complete(f.intent); mutate(data); f.runState.detailReply = data; const detail = await f.tasks.detail(f.reference); assert.equal(detail.evidence.verdict, 'unverified'); assert.ok(detail.evidence.reasons.includes('inconsistent-evidence'));
  }
});
test('safe summaries exclude raw errors, polling secrets, URLs and reason suffixes', async t => {
  const f = await fixture(t), privateValue = 'EXAMPLE_PRIVATE_VALUE', data = complete(f.intent); data.pollSecret = privateValue; data.lastErrorMessage = privateValue; data.artifactVerification.assets[0].url = `https://example.invalid/result?signature=${privateValue}`; data.artifactVerification.reasons = [`output_asset_unverified:https://example.invalid/?signature=${privateValue}`]; data.provider = `https://example.invalid/?signature=${privateValue}`; f.runState.detailReply = data;
  const detail = await f.tasks.detail(f.reference); assert.equal(detail.provider, null); assert.equal(JSON.stringify(detail).includes(privateValue), false); assert.ok(detail.evidence.reasons.includes('asset-unverified'));
  assert.equal(canvasTaskDetailSchema.safeParse({ ...detail, pollSecret: privateValue }).success, false);
});
test('cross-project, cross-canvas and different-owner replies are refused as a whole', async t => {
  const f = await fixture(t);
  for (const changed of [{ projectId: 'EXAMPLE_OTHER' }, { canvasId: 'EXAMPLE_OTHER' }, { requestedBy: 'EXAMPLE_OTHER' }]) { f.runState.listReply = { items: [{ ...f.intent, ...changed }] }; await assert.rejects(f.tasks.list(scope), e => e.code === 'TASK_RESULT_MISMATCH'); }
  f.runState.detailReply = { ...complete(f.intent), id: 'EXAMPLE_OTHER_INTENT' }; await assert.rejects(f.tasks.detail(f.reference), e => e.code === 'TASK_RESULT_MISMATCH');
  await assert.rejects(f.tasks.detail({ ...f.reference, canvasId: 'EXAMPLE_OTHER' }), e => e.code === 'RUN_INTENT_NOT_FOUND');
});
test('duplicate/oversized native lists fail; exactly 100 is marked as a bounded native listing', async t => {
  const f = await fixture(t); f.runState.listReply = { items: [f.intent, f.intent] }; await assert.rejects(f.tasks.list(scope), e => e.code === 'TASK_RESULT_MISMATCH');
  const items = Array.from({ length: 100 }, () => ({ ...f.intent, id: randomUUID() })); f.runState.listReply = { items }; assert.equal((await f.tasks.list(scope)).atLimit, true);
  f.runState.listReply = { items: [...items, { ...f.intent, id: randomUUID() }] }; await assert.rejects(f.tasks.list(scope));
});
test('configuration changes and Host disposal during a native GET prevent late result disclosure', async t => {
  const f = await fixture(t); f.runState.afterRead = () => f.changeConfig({ ...f.config(), instance: 'EXAMPLE_OTHER' }); await assert.rejects(f.tasks.list(scope), e => e.code === 'TASK_CONNECTION_CHANGED');
  const other = await fixture(t); other.runState.afterRead = () => other.tasks.close(); await assert.rejects(other.tasks.detail(other.reference), e => e.code === 'TASK_CONNECTION_CHANGED');
});
test('unknown native statuses stay unknown and old queue revisions or missing evidence are not silently accepted', async t => {
  const f = await fixture(t); f.intent.status = 'EXAMPLE_FUTURE_STATUS'; assert.equal((await f.tasks.list(scope)).items[0].status, 'unknown');
  f.runState.detailReply = { ...complete(f.intent), artifactVerification: undefined }; await assert.rejects(f.tasks.detail(f.reference));
  f.runState.listReply = { items: [{ ...f.intent, queueRevision: 0 }] }; await assert.rejects(f.tasks.list(scope));
});
test('aggregate output reference limit applies across nodes, and large bounded evidence does not require nested scans', async t => {
  const f = await fixture(t), data = complete(f.intent), refs = Array.from({ length: 2501 }, (_, index) => `EXAMPLE_ASSET_${index}`);
  data.artifactVerification.nodeRuns = [0, 1].map(index => ({ ...data.artifactVerification.nodeRuns[0], nodeRunId: `EXAMPLE_NODE_RUN_${index}`, outputAssetIds: refs })); f.runState.detailReply = data; await assert.rejects(f.tasks.detail(f.reference), error => error.name === 'ZodError' && error.issues.some(issue => issue.message.includes('bounded output reference limit')));
  data.artifactVerification.nodeRuns = [{ ...data.artifactVerification.nodeRuns[0], outputAssetIds: refs.slice(0, 500) }];
  data.artifactVerification.assets = refs.slice(0, 500).map(assetId => ({ assetId, nodeRunId: 'EXAMPLE_NODE_RUN_0', stored: true, hashVerified: true, magicVerified: true, associationVerified: true }));
  assert.equal((await f.tasks.detail(f.reference)).evidence.verdict, 'verified');
});
