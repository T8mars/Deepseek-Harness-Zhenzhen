import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { CanvasTransfer } from '../lib/canvas-transfer.js';
import { canvasTransferFixture } from '../../../contracts/fixtures/canvas-transfer.mjs';
async function fixture(t, options) { const f = await canvasTransferFixture(options); t.after(() => f.dispose()); return f; }
test('owned saved file is previewed, separately approved for import and placement, then applied without generation', async t => {
  const f = await fixture(t), preview = await f.preview(); assert.equal(preview.phase, 'preview'); assert.equal(f.transferState.approvalPosts, 0);
  await assert.rejects(f.transfer.approve(preview.id, false), e => e.code === 'TRANSFER_REVIEW_REQUIRED');
  const pending = await f.transfer.approve(preview.id, true); assert.equal(pending.stage, 'import'); assert.equal((await f.transfer.complete(preview.id)).phase, 'pending'); assert.equal(f.transferState.importWrites, 0);
  const secret = f.originalStore.loadApproval(f.state.descriptor.instanceId, pending.approvalRequestId, f.state.options).pollSecret; assert.equal(readFileSync(f.transferFile, 'utf8').includes(secret), false); assert.equal(JSON.stringify(pending).includes(secret), false);
  f.windowApproveTransfer(); assert.equal((await f.transfer.complete(preview.id)).phase, 'available'); assert.equal(f.transferState.importWrites, 1); assert.equal(f.transferState.placeWrites, 0); assert.equal(existsSync(f.receipt.path), true);
  const place = await f.transfer.previewPlacement(preview.id); assert.equal(place.stage, 'place'); assert.ok(place.placement.nodeId); await f.transfer.approve(preview.id, true); f.windowApproveTransfer(); const applied = await f.transfer.complete(preview.id); assert.equal(applied.phase, 'applied'); assert.equal(f.transferState.placeWrites, 1);
  await assert.rejects(f.transfer.complete(preview.id), e => e.code === 'TRANSFER_QUERY_ONLY'); assert.equal((await f.transfer.refresh(preview.id)).phase, 'applied'); assert.equal(f.state.created[0].requestedScopes.includes('browser:handoff'), false); assert.equal(f.state.created[0].requestedScopes.includes('run:execute'), false);
});
test('default pairing has no transfer scope and imported media can remain in the project without write permission', async t => {
  const readOnly = await fixture(t, { assetTransfer: false, writable: false }); await assert.rejects(readOnly.preview(), e => e.code === 'TRANSFER_SCOPE_REQUIRED'); assert.equal(readOnly.transferState.approvalPosts, 0); assert.deepEqual(readOnly.state.created[0].requestedScopes, ['canvas:read', 'run:read', 'asset:read']);
  const f = await fixture(t, { writable: false }), view = await f.preview(); await f.transfer.approve(view.id, true); f.windowApproveTransfer(); assert.equal((await f.transfer.complete(view.id)).phase, 'available'); await assert.rejects(f.transfer.previewPlacement(view.id), e => e.code === 'TRANSFER_SCOPE_REQUIRED'); assert.equal(f.transferState.placeWrites, 0);
});
test('lost approval creation response recovers by scoped GET without another POST', async t => {
  const f = await fixture(t), view = await f.preview(); f.transferState.dropCreate = true; await assert.rejects(f.transfer.approve(view.id, true)); assert.equal(f.transfer.snapshot().phase, 'unknown');
  const resumed = new CanvasTransfer(f.transferFile, f.config, id => f.receipts.get(id)); t.after(() => resumed.close()); assert.equal((await resumed.refresh(view.id)).phase, 'pending'); assert.equal(f.transferState.approvalPosts, 1); assert.equal(f.transferState.importWrites, 0);
});
test('lost import or placement completion response queries original native records and never resends', async t => {
  const f = await fixture(t), view = await f.preview(); await f.transfer.approve(view.id, true); f.windowApproveTransfer(); f.transferState.dropComplete = true; await assert.rejects(f.transfer.complete(view.id)); await assert.rejects(f.transfer.complete(view.id)); assert.equal((await f.transfer.refresh(view.id)).phase, 'available'); assert.equal(f.transferState.importWrites, 1);
  await f.transfer.previewPlacement(view.id); await f.transfer.approve(view.id, true); f.windowApproveTransfer(); await assert.rejects(f.transfer.complete(view.id)); assert.equal((await f.transfer.refresh(view.id)).phase, 'applied'); assert.equal(f.transferState.placeWrites, 1); assert.equal(f.transferState.completePosts, 2);
});
test('changed or forgotten exported files are refused before requesting a window approval', async t => {
  const f = await fixture(t), view = await f.preview(); writeFileSync(f.receipt.path, 'EXAMPLE_CHANGED'); await assert.rejects(f.transfer.approve(view.id, true), e => e.code === 'TRANSFER_FILE_CHANGED'); assert.equal(f.transferState.approvalPosts, 0);
  const other = await fixture(t), selected = await other.preview(); other.receipts.delete(other.receipt.id); await assert.rejects(other.transfer.approve(selected.id, true), e => e.code === 'TRANSFER_RECEIPT_MISSING'); assert.equal(other.transferState.approvalPosts, 0);
});
test('native denial and duplicate clicks do not copy or place a second time', async t => {
  const f = await fixture(t), view = await f.preview(), results = await Promise.allSettled([f.transfer.approve(view.id, true), f.transfer.approve(view.id, true)]); assert.equal(results.filter(item => item.status === 'fulfilled').length, 1); f.windowDenyTransfer(); assert.equal((await f.transfer.complete(view.id)).phase, 'denied'); assert.equal(f.transferState.importWrites, 0);
});
test('older backend and configuration races refuse transfer before state/side effects', async t => {
  const f = await fixture(t); f.transferState.enabled = false; await assert.rejects(f.preview(), e => e.code === 'TRANSFER_UPDATE_REQUIRED'); assert.equal(f.transferState.approvalPosts, 0);
  const other = await fixture(t); other.transferState.afterRead = () => other.changeConfig({ ...other.config(), instance: 'EXAMPLE_CHANGED' }); await assert.rejects(other.preview(), e => e.code === 'TRANSFER_CONNECTION_CHANGED'); assert.equal(other.transferState.approvalPosts, 0);
});
test('native base64url instance prefixes persist through workflow, transfer and reopen', async t => {
  const f = await fixture(t, { autoPair: false }); f.state.descriptor.instanceId = '_' + 'a'.repeat(42); await f.pair();
  const plan = await f.workflow.preview({ projectId: 'EXAMPLE_PROJECT', canvasId: 'EXAMPLE_CANVAS', kind: 'image', prompt: 'EXAMPLE' }); assert.equal(plan.phase, 'preview');
  const view = await f.preview(), reopened = new CanvasTransfer(f.transferFile, f.config, id => f.receipts.get(id)); t.after(() => reopened.close()); assert.equal(reopened.snapshot().id, view.id); assert.equal(JSON.parse(readFileSync(f.transferFile, 'utf8')).instanceId[0], '_');
});
test('forgotten receipt after window approval prevents copying, and absent result after ambiguous completion remains query-only', async t => {
  const f = await fixture(t), view = await f.preview(); await f.transfer.approve(view.id, true); f.windowApproveTransfer(); f.receipts.delete(f.receipt.id);
  await assert.rejects(f.transfer.complete(view.id), error => error.code === 'TRANSFER_RECEIPT_MISSING'); assert.equal(f.transfer.snapshot().phase, 'expired'); assert.equal(f.transferState.completePosts, 0);
  const other = await fixture(t), pending = await other.preview(); await other.transfer.approve(pending.id, true); other.windowApproveTransfer(); other.transferState.dropComplete = true; other.transferState.afterComplete = () => other.assets.clear(); await assert.rejects(other.transfer.complete(pending.id)); assert.equal((await other.transfer.refresh(pending.id)).phase, 'unknown'); await assert.rejects(other.transfer.complete(pending.id)); assert.equal(other.transferState.completePosts, 1);
});
