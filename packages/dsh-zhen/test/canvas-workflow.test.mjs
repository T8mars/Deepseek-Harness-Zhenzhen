import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { CanvasWorkflow } from '../lib/canvas-workflow.js';
import { canvasWorkflowSchema, canvasWorkspacesSchema } from '../lib/canvas-workflow-schema.js';
import { assertNativeApprovalFixture, canvasWorkflowFixture } from '../../../contracts/fixtures/canvas-workflow.mjs';
async function fixture(t, options) { const f = await canvasWorkflowFixture(options); t.after(() => f.dispose()); return f; }
test('native approval fixture retains exact committed source and MIT notice', () => { assert.equal(assertNativeApprovalFixture().revision, 'e6702dc7770bcbe7d4895be22a06f4c7123a085b'); });
test('preview and human review use native HTTP/auth/store/approval; only explicit window approval permits synthetic mutation', async t => {
  const f = await fixture(t);
  assert.ok(f.state.created[0].requestedScopes.includes('canvas:write')); assert.equal(f.state.created[0].requestedScopes.includes('run:execute'), false);
  assert.equal((await f.workflow.workspaces()).canvases[0].revision, 7);
  const plan = await f.preview(); assert.equal(plan.phase, 'preview'); assert.equal(plan.goal, 'EXAMPLE synthetic creative goal'); assert.equal(f.flowState.mutations, 0); assert.equal(f.flowState.requests, 0);
  assert.deepEqual(canvasWorkflowSchema.parse(plan), plan);
  const pending = await f.workflow.approve(plan.id, true); assert.equal(pending.phase, 'pending'); assert.equal(f.flowState.mutations, 0);
  const approval = f.originalStore.loadApproval(f.state.descriptor.instanceId, pending.approvalRequestId, f.state.options);
  for (const content of [JSON.stringify(pending), readFileSync(f.file, 'utf8'), readFileSync(f.credentialFile, 'utf8')]) assert.equal(content.includes(approval.pollSecret), false);
  assert.equal((await f.workflow.complete(plan.id)).phase, 'pending'); assert.equal(f.flowState.mutations, 0);
  f.windowApprove(); const applied = await f.workflow.complete(plan.id); assert.equal(applied.phase, 'applied'); assert.equal(applied.revision, 8); assert.equal(f.flowState.mutations, 1);
  assert.equal(f.originalStore.loadApproval(f.state.descriptor.instanceId, pending.approvalRequestId, f.state.options), null);
  assert.ok(f.state.requests.every(request => !/\/approve$|settings|run-start|run-retry|provider/.test(request.path)));
});
test('default read pairing still previews but cannot request structural write; false confirmation creates no request', async t => {
  const f = await fixture(t, { writable: false }), plan = await f.preview();
  await assert.rejects(f.workflow.approve(plan.id, false), error => error.code === 'WORKFLOW_REVIEW_REQUIRED');
  await assert.rejects(f.workflow.approve(plan.id, true), error => error.code === 'WORKFLOW_WRITE_SCOPE_REQUIRED');
  assert.equal(f.flowState.requests, 0); assert.equal(f.flowState.mutations, 0); assert.equal(f.workflow.snapshot().phase, 'preview');
});
test('denial changes no canvas and exact native approval can resume after Host restart', async t => {
  const f = await fixture(t), plan = await f.preview(); await f.workflow.approve(plan.id, true); f.workflow.close();
  const resumed = new CanvasWorkflow(f.file, f.config); t.after(() => resumed.close());
  f.windowDeny(); assert.equal((await resumed.complete(plan.id)).phase, 'denied'); assert.equal(f.flowState.mutations, 0);
});
test('concurrent clicks consume each UI step once and never reapply a completed structure', async t => {
  const f = await fixture(t), plan = await f.preview();
  const approval = await Promise.allSettled([f.workflow.approve(plan.id, true), f.workflow.approve(plan.id, true)]);
  assert.equal(approval.filter(result => result.status === 'fulfilled').length, 1); assert.equal(f.flowState.requests, 1);
  f.windowApprove(); const result = await Promise.allSettled([f.workflow.complete(plan.id), f.workflow.complete(plan.id)]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1); assert.equal(f.flowState.completes, 1); assert.equal(f.flowState.mutations, 1);
});
test('lost approval creation response stays unknown across restart and cannot resend', async t => {
  const f = await fixture(t), plan = await f.preview(); f.flowState.dropCreate = true;
  await assert.rejects(f.workflow.approve(plan.id, true)); assert.equal(f.workflow.snapshot().phase, 'unknown');
  const resumed = new CanvasWorkflow(f.file, f.config); t.after(() => resumed.close());
  await assert.rejects(resumed.approve(plan.id, true)); await assert.rejects(resumed.complete(plan.id)); await assert.rejects(f.preview());
  assert.equal(f.flowState.requests, 1); assert.equal(f.flowState.mutations, 0);
});
test('lost completion response after native consumption never exposes a resend path', async t => {
  const f = await fixture(t), plan = await f.preview(); await f.workflow.approve(plan.id, true); f.windowApprove(); f.flowState.dropComplete = true;
  await assert.rejects(f.workflow.complete(plan.id)); assert.equal(f.flowState.mutations, 1); assert.equal(f.workflow.snapshot().phase, 'unknown');
  await assert.rejects(f.workflow.complete(plan.id)); assert.equal(f.flowState.completes, 1);
});
test('stale canvas is refused by native review and no new approval is silently created', async t => {
  const f = await fixture(t), plan = await f.preview(); f.flowState.revision++;
  await assert.rejects(f.workflow.approve(plan.id, true)); assert.equal(f.workflow.snapshot().phase, 'expired'); assert.equal(f.flowState.mutations, 0);
  await assert.rejects(f.workflow.approve(plan.id, true)); assert.equal(f.flowState.requests, 1);
  const replacement = await f.preview(); assert.notEqual(replacement.id, plan.id); assert.equal(replacement.canvasRevision, 8); assert.equal(f.flowState.requests, 1);
});
test('mismatched native result records uncertainty without permitting another completion', async t => {
  const f = await fixture(t), plan = await f.preview(); await f.workflow.approve(plan.id, true); f.windowApprove(); f.flowState.mismatch = true;
  await assert.rejects(f.workflow.complete(plan.id), error => error.code === 'WORKFLOW_RESULT_MISMATCH'); assert.equal(f.workflow.snapshot().phase, 'unknown');
  await assert.rejects(f.workflow.complete(plan.id)); assert.equal(f.flowState.mutations, 1);
});
test('native protection failure cannot authorize fallback secret storage or another request', async t => {
  const f = await fixture(t), plan = await f.preview(); f.state.failProtect = true;
  await assert.rejects(f.workflow.approve(plan.id, true)); assert.equal(f.workflow.snapshot().phase, 'unknown');
  assert.equal(f.flowState.mutations, 0); assert.equal(f.flowState.requests, 1); assert.equal(readFileSync(f.file, 'utf8').includes('pollSecret'), false);
});
test('connection changes while requesting approval do not store or apply its response', async t => {
  const f = await fixture(t), plan = await f.preview();
  f.flowState.afterCreate = () => f.changeConfig({ ...f.config(), instance: 'EXAMPLE_OTHER_INSTANCE' });
  await assert.rejects(f.workflow.approve(plan.id, true), error => error.code === 'WORKFLOW_CONNECTION_CHANGED'); assert.equal(f.workflow.snapshot().phase, 'unknown'); assert.equal(f.flowState.mutations, 0);
});
test('approval binding mismatch never reaches a completion request', async t => {
  const f = await fixture(t), plan = await f.preview();
  f.flowState.afterCreate = result => { result.approvalBinding = { ...result.approvalBinding, planDigest: '9'.repeat(64) }; };
  await assert.rejects(f.workflow.approve(plan.id, true), error => error.code === 'WORKFLOW_APPROVAL_MISMATCH'); assert.equal(f.workflow.snapshot().phase, 'unknown');
  assert.equal(f.flowState.completes, 0); assert.equal(f.originalStore.loadApproval(f.state.descriptor.instanceId, {}, f.state.options), null);
});
test('different creative goals are refused and unfinished plans cannot be sent for approval', async t => {
  const f = await fixture(t); f.flowState.afterPlan = plan => { plan.brief.goal = 'EXAMPLE_OTHER_GOAL'; };
  await assert.rejects(f.preview(), error => error.code === 'WORKFLOW_PLAN_MISMATCH'); assert.equal(f.workflow.snapshot(), null); assert.equal(f.flowState.requests, 0);
  f.flowState.afterPlan = plan => { plan.ready = false; plan.patchId = null; plan.questions = [{ question: 'EXAMPLE_REQUIRED_INPUT' }]; };
  const unfinished = await f.preview(); assert.equal(unfinished.ready, false); assert.deepEqual(unfinished.questions, ['EXAMPLE_REQUIRED_INPUT']);
  await assert.rejects(f.workflow.approve(unfinished.id, true), error => error.code === 'WORKFLOW_REVIEW_REQUIRED'); assert.equal(f.flowState.requests, 0);
});
test('session replacement and wrong native approval identity are rejected before completion', async t => {
  const f = await fixture(t), plan = await f.preview(), pending = await f.workflow.approve(plan.id, true);
  const approval = f.originalStore.loadApproval(f.state.descriptor.instanceId, pending.approvalRequestId, f.state.options);
  f.originalStore.storeApproval(f.state.descriptor, { ...approval, projectId: 'EXAMPLE_OTHER_PROJECT' }, f.state.options);
  await assert.rejects(f.workflow.complete(plan.id), error => error.code === 'WORKFLOW_APPROVAL_CHANGED'); assert.equal(f.flowState.completes, 0);
  await f.pairing.begin(false, true); f.approve(); await f.pairing.complete();
  await assert.rejects(f.workflow.complete(plan.id), error => error.code === 'WORKFLOW_CONNECTION_CHANGED'); assert.equal(f.flowState.completes, 0);
});
test('expired, corrupt and interrupted local progress fails closed; view codecs forbid secrets', async t => {
  const f = await fixture(t), plan = await f.preview(), record = JSON.parse(readFileSync(f.file, 'utf8'));
  assert.equal(canvasWorkflowSchema.safeParse({ ...plan, pollSecret: 'EXAMPLE_FORBIDDEN' }).success, false);
  assert.equal(canvasWorkspacesSchema.safeParse({ canvases: [], token: 'EXAMPLE_FORBIDDEN' }).success, false);
  record.view.phase = 'applying'; writeFileSync(f.file, JSON.stringify(record)); assert.equal(f.workflow.snapshot().phase, 'unknown'); await assert.rejects(f.workflow.complete(plan.id));
  record.view.phase = 'preview'; record.view.expiresAt = new Date(0).toISOString(); writeFileSync(f.file, JSON.stringify(record)); assert.equal(f.workflow.snapshot().phase, 'expired'); await assert.rejects(f.workflow.approve(plan.id, true));
  writeFileSync(f.file, '{'); assert.throws(() => f.workflow.snapshot(), error => error.code === 'WORKFLOW_RECORD_INVALID'); assert.equal(f.flowState.requests, 0);
});
