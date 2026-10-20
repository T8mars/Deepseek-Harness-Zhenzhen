import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { CanvasRuns } from '../lib/canvas-run.js';
import { canvasRunViewSchema } from '../lib/canvas-run-schema.js';
import { canvasRunFixture, assertRunApprovalFixture } from '../../../contracts/fixtures/canvas-run.mjs';
async function fixture(t, options) { const f = await canvasRunFixture(options); t.after(() => f.dispose()); return f; }
test('native instance IDs starting with a base64url dash persist in run references', async t => {
  const f = await fixture(t, { autoPair: false }); f.state.descriptor.instanceId = '-' + 'a'.repeat(42); await f.pair();
  const quote = await f.quote(), reopened = new CanvasRuns(f.runFile, f.config); t.after(() => reopened.close()); assert.equal(reopened.snapshot().quoteId, quote.quoteId);
});
test('run fixture is an explicitly labelled working-source approval snapshot', () => { assert.equal(assertRunApprovalFixture().status, 'unreleased-working-source-snapshot'); });
test('quote has unknown price; both human confirmations and native window are needed before any intent', async t => {
  const f = await fixture(t), nodes = await f.runs.nodes('EXAMPLE_PROJECT', 'EXAMPLE_CANVAS'); assert.equal(nodes.nodes[0].executable, true); assert.equal(nodes.nodes[1].executable, false);
  const quote = await f.quote(); assert.equal(quote.priceKnown, false); assert.equal(quote.estimatedCost, null); assert.equal(f.runState.writes, 0);
  for (const confirmations of [[false, true], [true, false]]) await assert.rejects(f.runs.approve(quote.quoteId, ...confirmations), e => e.code === 'RUN_REVIEW_REQUIRED');
  assert.equal(f.runState.approvals, 0); const pending = await f.runs.approve(quote.quoteId, true, true); assert.equal(pending.phase, 'pending');
  const record = f.originalStore.loadApproval(f.state.descriptor.instanceId, pending.approvalRequestId, f.state.options);
  for (const value of [JSON.stringify(pending), readFileSync(f.runFile, 'utf8'), readFileSync(f.credentialFile, 'utf8')]) assert.equal(value.includes(record.pollSecret), false);
  assert.equal((await f.runs.submit(quote.quoteId)).phase, 'pending'); assert.equal(f.runState.writes, 0);
  f.approveRun(); const accepted = await f.runs.submit(quote.quoteId); assert.equal(accepted.phase, 'tracking'); assert.equal(accepted.intent.status, 'accepted'); assert.equal(f.runState.writes, 1);
  assert.deepEqual(canvasRunViewSchema.parse(accepted), accepted); await assert.rejects(f.runs.submit(quote.quoteId), e => e.code === 'RUN_QUERY_ONLY');
  assert.equal((await f.runs.refresh(quote.quoteId)).intent.id, accepted.intent.id); assert.equal(f.runState.writes, 1);
});
test('default read-only pairing previews without requesting execution permission or approvals', async t => {
  const f = await fixture(t, { runnable: false }), quote = await f.quote(); assert.equal(f.state.created[0].requestedScopes.includes('run:execute'), false);
  await assert.rejects(f.runs.approve(quote.quoteId, true, true), e => e.code === 'RUN_SCOPE_REQUIRED'); assert.equal(f.runState.approvals, 0);
});
test('native denial and repeated clicks cannot reserve two intents', async t => {
  const f = await fixture(t), quote = await f.quote(); const results = await Promise.allSettled([f.runs.approve(quote.quoteId, true, true), f.runs.approve(quote.quoteId, true, true)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); f.denyRun(); assert.equal((await f.runs.submit(quote.quoteId)).phase, 'denied'); assert.equal(f.runState.writes, 0);
  const next = await f.quote(); await f.runs.approve(next.quoteId, true, true); f.approveRun(); const submitted = await Promise.allSettled([f.runs.submit(next.quoteId), f.runs.submit(next.quoteId)]);
  assert.equal(submitted.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.runState.writes, 1);
});
test('lost approval acknowledgement recovers through authenticated GET without another creation POST', async t => {
  const f = await fixture(t), quote = await f.quote(); f.runState.dropApproval = true; await assert.rejects(f.runs.approve(quote.quoteId, true, true)); assert.equal(f.runs.snapshot().phase, 'unknown');
  f.runs.close(); const resumed = new CanvasRuns(f.runFile, f.config); t.after(() => resumed.close());
  await assert.rejects(resumed.approve(quote.quoteId, true, true)); assert.equal((await resumed.refresh(quote.quoteId)).phase, 'pending'); assert.equal(f.runState.approvals, 1); assert.equal(f.runState.completePosts, 0);
  f.approveRun(); assert.equal((await resumed.submit(quote.quoteId)).phase, 'tracking'); assert.equal(f.runState.writes, 1);
});
test('lost completion acknowledgement resumes by operation lookup after restart without another completion POST', async t => {
  const f = await fixture(t), quote = await f.quote(); await f.runs.approve(quote.quoteId, true, true); f.approveRun(); f.runState.dropComplete = true;
  await assert.rejects(f.runs.submit(quote.quoteId)); assert.equal(f.runs.snapshot().phase, 'unknown'); assert.equal(f.runState.writes, 1);
  f.runs.close(); const resumed = new CanvasRuns(f.runFile, f.config); t.after(() => resumed.close()); await assert.rejects(resumed.submit(quote.quoteId));
  assert.equal((await resumed.refresh(quote.quoteId)).phase, 'tracking'); assert.equal(f.runState.completePosts, 1); assert.equal(f.runState.writes, 1);
});
test('unknown acceptance followed by a missing intent never offers resend or replacement quote', async t => {
  const f = await fixture(t), quote = await f.quote(); await f.runs.approve(quote.quoteId, true, true); f.approveRun(); f.runState.dropComplete = true; await assert.rejects(f.runs.submit(quote.quoteId)); f.intents.clear();
  assert.equal((await f.runs.refresh(quote.quoteId)).phase, 'unknown'); await assert.rejects(f.runs.submit(quote.quoteId)); await assert.rejects(f.quote(), e => e.code === 'RUN_PENDING'); assert.equal(f.runState.completePosts, 1);
});
test('mismatched completion cannot be accepted; GET recovery must match original authority', async t => {
  const f = await fixture(t), quote = await f.quote(); await f.runs.approve(quote.quoteId, true, true); f.approveRun(); f.runState.mismatch = true;
  await assert.rejects(f.runs.submit(quote.quoteId), e => e.code === 'RUN_RESULT_MISMATCH'); assert.equal(f.runs.snapshot().phase, 'unknown');
  const intent = [...f.intents.values()][0]; intent.requestedBy = 'EXAMPLE_OTHER_ACTOR'; assert.equal((await f.runs.refresh(quote.quoteId)).phase, 'unknown'); assert.equal(f.runState.completePosts, 1);
});
test('older native backend is refused before a plan or execution approval is created', async t => {
  const f = await fixture(t); f.runState.enabled = false; await assert.rejects(f.quote(), e => e.code === 'RUN_CONTROL_UPDATE_REQUIRED'); assert.equal(f.runState.planPosts, 0);
});
test('changed pairing/configuration or local record cannot permit submission', async t => {
  const f = await fixture(t), quote = await f.quote(); await f.runs.approve(quote.quoteId, true, true); f.approveRun(); f.changeConfig({ ...f.config(), digest: 'f'.repeat(64) }); await assert.rejects(f.runs.submit(quote.quoteId)); assert.equal(f.runState.completePosts, 0);
  writeFileSync(f.runFile, 'EXAMPLE invalid reference'); assert.throws(() => f.runs.snapshot(), e => e.code === 'RUN_RECORD_INVALID');
});
test('native approval cannot extend quote expiry and altered model preview is refused', async t => {
  const f = await fixture(t), quote = await f.quote(), state = JSON.parse(readFileSync(f.runFile, 'utf8')); state.view.expiresAt = new Date(Date.now() + 5000).toISOString(); writeFileSync(f.runFile, JSON.stringify(state));
  const pending = await f.runs.approve(quote.quoteId, true, true); assert.equal(pending.expiresAt, state.view.expiresAt);
  const f2 = await fixture(t), quote2 = await f2.quote(); f2.runState.afterApproval = data => { data.preview.run.declarations[0].model = 'EXAMPLE_CHANGED_MODEL'; };
  await assert.rejects(f2.runs.approve(quote2.quoteId, true, true), e => e.code === 'RUN_APPROVAL_MISMATCH'); assert.equal(f2.runState.completePosts, 0);
});
