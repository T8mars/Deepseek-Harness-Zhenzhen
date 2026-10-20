import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CanvasTransfer } from '../../packages/dsh-zhen/lib/canvas-transfer.js';
import { canvasWorkflowFixture } from './canvas-workflow.mjs';
import { canvasCatalog } from './canvas.mjs';
import { examplePng } from './png.mjs';
const require = createRequire(import.meta.url);
const { createAgentControlApprovalService, createAgentControlApprovalBinding } = require('./canvas-run-control/approvals.cjs');
/** Native auth/store/approval service are real. Import database, managed asset
 * copy and placement ledger below are synthetic; original Native proof is separate. */
export async function canvasTransferFixture(options = {}) {
  const f = await canvasWorkflowFixture({ assetTransfer: true, ...options }), approvals = createAgentControlApprovalService(), assets = new Map(), patches = new Map(), receipts = new Map();
  const image = examplePng(), filePath = join(f.base, 'EXAMPLE_EXPORTED.png'); writeFileSync(filePath, image);
  const receipt = { id: randomUUID(), taskRecordId: randomUUID(), ordinal: 1, path: filePath, bytes: image.length, sha256: createHash('sha256').update(image).digest('hex'), mime: 'image/png', savedAt: new Date().toISOString(), recorded: true }; receipts.set(receipt.id, receipt);
  const state = { enabled: true, importWrites: 0, placeWrites: 0, approvalPosts: 0, completePosts: 0, reads: [], dropCreate: false, dropComplete: false, mismatch: false, afterRead: undefined, afterPreview: undefined, afterCreate: undefined, afterComplete: undefined };
  const original = f.state.route;
  const filePreview = () => ({ summary: 'EXAMPLE import', riskLevel: 'L2', currentRevision: f.flowState.revision, projectId: 'EXAMPLE_PROJECT', canvasId: 'EXAMPLE_CANVAS', file: { name: basename(receipt.path), size: receipt.bytes, sha256: receipt.sha256, mimeType: receipt.mime, kind: 'image' }, providerTransfer: { occursNow: false, scope: 'none' } });
  function placePreview(assetId) { const asset = assets.get(assetId); if (!asset) throw Object.assign(Error('EXAMPLE no asset'), { code: 'ASSET_NOT_FOUND', status: 404 }); const key = createHash('sha256').update(assetId + receipt.sha256).digest('hex'); return { preview: { riskLevel: 'L1', patchId: `asset-place-${key.slice(0, 32)}`, previewDigest: key, currentRevision: f.flowState.revision, providerTransfer: { occursNow: false, scope: 'none' } }, asset: { id: asset.id, contentHash: asset.contentHash, size: asset.metadata.size, mimeType: asset.mimeType }, placement: { nodeId: `asset-place-${key.slice(0, 24)}`, position: { x: 420, y: 0 } } }; }
  f.state.route = async (req, body, auth, res) => {
    const url = new URL(req.url, 'http://127.0.0.1'), session = scopes => auth.authenticate(String(req.headers.authorization || '').replace(/^Bearer /, ''), scopes);
    if (req.method === 'GET') state.reads.push(url.pathname);
    if (url.pathname === '/api/agent-control/v1/status') return { compat: { supported: true, fixture: 'EXAMPLE_ONLY' }, ...(state.enabled ? { assetControl: { schema: 't8-agent-asset-control-v1', approvalLookup: true, hashLookup: true, patchLookup: true, maxImportBytes: 512 * 1024 * 1024 } } : {}) };
    if (url.pathname === '/api/agent-control/v1/capability-tools/invoke') {
      const tool = canvasCatalog.tools.find(item => item.name === body.tool);
      if (tool && ['asset.import', 'asset.place'].includes(tool.capabilityId)) {
        const policy = tool.operations.find(item => item.operation === body.operation); session(policy.requiredScopes);
        const data = tool.capabilityId === 'asset.import' ? filePreview() : placePreview(body.input.assetId); state.afterPreview?.();
        return { schema: 't8-versioned-creative-tool-result-v1', tool: { name: tool.name, version: tool.version, capabilityId: tool.capabilityId, operation: body.operation, requestAction: tool.capabilityId }, contract: { protocol: 't8-versioned-creative-tool-v1', capabilityManifestDigest: canvasCatalog.capabilityManifestDigest, capabilityGraphDigest: canvasCatalog.capabilityGraphDigest, riskLevel: 'L0', approvalRequired: false, requiredScopes: policy.requiredScopes }, request: { clientRequestId: body.clientRequestId ?? null, projectId: body.projectId, canvasId: body.canvasId }, readOnly: true, directInternalAccess: false, sideEffects: { canvasWrites: 0, providerCalls: 0, fileWrites: 0 }, data };
      }
    }
    if (url.pathname === '/api/agent-control/v1/assets') { session(['asset:read']); if (url.searchParams.get('projectId') !== 'EXAMPLE_PROJECT' || url.searchParams.get('canvasId') !== 'EXAMPLE_CANVAS') throw Object.assign(Error('EXAMPLE scope'), { code: 'agent_scope_not_found', status: 404 }); const items = [...assets.values()].filter(asset => asset.contentHash === url.searchParams.get('contentHash')); state.afterRead?.(); return { projectId: 'EXAMPLE_PROJECT', canvasId: 'EXAMPLE_CANVAS', canvasRevision: f.flowState.revision, items, total: items.length, limit: 100, offset: 0, catalogRevision: 1 }; }
    if (url.pathname.startsWith('/api/agent-control/v1/patches/')) { session(['canvas:read']); const patch = patches.get(url.pathname.split('/').at(-1)); if (!patch) throw Object.assign(Error('EXAMPLE no patch'), { code: 'PATCH_APPLICATION_NOT_FOUND', status: 404 }); state.afterRead?.(); return { ...patch }; }
    const action = url.pathname.includes('/asset-import-approvals') ? 'import' : url.pathname.includes('/asset-place-approvals') ? 'place' : undefined;
    if (action && url.pathname.includes('/by-operation/')) { const current = session(action === 'import' ? ['asset:transfer'] : ['asset:read', 'canvas:write']); return approvals.inspectOperation({ action: `asset.${action}`, operationId: decodeURIComponent(url.pathname.split('/').at(-1)), sessionId: current.sessionId, projectId: url.searchParams.get('projectId'), canvasId: url.searchParams.get('canvasId') }); }
    if (action && req.method === 'POST') {
      const current = session(action === 'import' ? ['asset:transfer'] : ['asset:read', 'canvas:write']); state.approvalPosts++;
      const place = action === 'place' ? placePreview(body.assetId) : undefined, preview = place ? { ...place.preview, assetId: body.assetId, assetPlacement: place.placement } : filePreview();
      const binding = place ? createAgentControlApprovalBinding({ action: 'asset.place', sessionId: current.sessionId, projectId: body.projectId, canvasId: body.canvasId, subject: { kind: 'persisted-asset-placement', assetId: body.assetId, nodeId: place.placement.nodeId, targetNodeId: null }, subjectVersionDigest: receipt.sha256, planDigest: receipt.sha256, boundary: { providerTransfer: { status: 'not-applicable', occursNow: false, scope: 'project-local-to-canvas' } } }) : undefined;
      const result = approvals.create({ action: `asset.${action}`, operationId: body.operationId, sessionId: current.sessionId, actorId: current.actorId, clientName: current.clientName, projectId: body.projectId, canvasId: body.canvasId, preview, ...(binding ? { approvalBinding: binding } : {}), patchId: place?.preview.patchId, patch: place ? { id: place.preview.patchId } : undefined, payload: { place } });
      state.afterCreate?.(result); if (state.dropCreate) res.destroy(); return result;
    }
    if (/\/approvals\/[0-9a-f-]+\/complete$/.test(url.pathname)) {
      const current = session([]), id = url.pathname.split('/')[5]; state.completePosts++;
      const completion = approvals.beginCompletion({ approvalRequestId: id, pollSecret: body.pollSecret, sessionId: current.sessionId }); if (completion.status !== 'approved') return { approvalRequestId: id, status: completion.status };
      const record = completion.record; let data;
      if (record.action === 'asset.import') { session(['asset:transfer']); if (createHash('sha256').update(readFileSync(receipt.path)).digest('hex') !== receipt.sha256) throw Object.assign(Error('EXAMPLE changed'), { code: 'ASSET_IMPORT_FILE_CHANGED', status: 409 }); let asset = [...assets.values()].find(item => item.contentHash === receipt.sha256); if (!asset) { asset = { id: randomUUID(), projectId: 'EXAMPLE_PROJECT', contentHash: receipt.sha256, kind: 'image', mimeType: receipt.mime, metadata: { size: receipt.bytes }, availability: 'available', storageMode: 'managed' }; assets.set(asset.id, asset); state.importWrites++; } data = { asset, contentHash: receipt.sha256 }; }
      else { session(['canvas:write']); const place = record.payload.place; let patch = patches.get(place.preview.patchId); if (!patch) { patch = { projectId: 'EXAMPLE_PROJECT', canvasId: 'EXAMPLE_CANVAS', patchId: place.preview.patchId, baseRevision: place.preview.currentRevision, appliedRevision: ++f.flowState.revision, status: 'applied', affectedNodeIds: [place.placement.nodeId] }; patches.set(patch.patchId, patch); state.placeWrites++; } data = { patchId: patch.patchId, revision: patch.appliedRevision, status: 'applied' }; }
      approvals.finishCompletion(record, true); state.afterComplete?.(); if (state.dropComplete) res.destroy(); return { approvalRequestId: id, action: record.action, operationId: state.mismatch ? 'EXAMPLE_OTHER_OPERATION' : record.operationId, ...data };
    }
    return original(req, body, auth, res);
  };
  const file = join(f.base, 'EXAMPLE_UI/canvas-transfer.json'), transfer = new CanvasTransfer(file, f.config, id => receipts.get(id));
  return { ...f, receipt, receipts, transfer, transferFile: file, transferState: state, assets, patches, preview: () => transfer.preview({ receiptId: receipt.id, projectId: 'EXAMPLE_PROJECT', canvasId: 'EXAMPLE_CANVAS' }), windowApproveTransfer() { const item = approvals.listPending()[0]; if (!item) throw Error('Missing EXAMPLE transfer approval'); approvals.approve(item.approvalRequestId); }, windowDenyTransfer() { approvals.deny(approvals.listPending()[0].approvalRequestId); },
    seedHostReceipt(home) { const folder = join(home, 'dsh-zhen/media-exports'); mkdirSync(folder, { recursive: true }); const db = new DatabaseSync(join(folder, 'receipts.sqlite')); try { db.exec('CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,receipt TEXT NOT NULL); PRAGMA user_version=1;'); db.prepare('INSERT OR REPLACE INTO receipts VALUES(?,?)').run(receipt.id, JSON.stringify(receipt)); } finally { db.close(); } },
    async dispose() { transfer.close(); await f.dispose(); },
  };
}
