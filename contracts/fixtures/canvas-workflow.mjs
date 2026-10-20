import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CanvasWorkflow } from '../../packages/dsh-zhen/lib/canvas-workflow.js';
import { canvasPairingFixture } from './canvas-pairing.mjs';
import { canvasFacts, canvasCatalog } from './canvas.mjs';
import { inspectCanvasCli } from '../../packages/dsh-zhen/lib/canvas.js';
const require = createRequire(import.meta.url);
const { createAgentControlApprovalService, createAgentControlApprovalBinding } = require('./canvas-approval/approvals.cjs');
export function assertNativeApprovalFixture() {
  const metadata = JSON.parse(readFileSync(new URL('canvas-approval/source.json', import.meta.url)));
  for (const file of metadata.files) if (createHash('sha256').update(readFileSync(new URL(`canvas-approval/${file.file}`, import.meta.url))).digest('hex') !== file.sha256) throw Error('Native approval fixture changed');
  return metadata;
}
/** Real auth/client/secureStore/approval service over HTTP. Plan construction and
 * database mutation are synthetic; this is not an actual Canvas window/DB test. */
export async function canvasWorkflowFixture({ writable = true, runnable = false, assetTransfer = false, dpapi = false, stdio = false, autoPair = true } = {}) {
  const f = await canvasPairingFixture({ transactionStore: true, dpapi, stdio });
  mkdirSync(join(f.root, 'generated'), { recursive: true }); writeFileSync(join(f.root, 'generated/creative-capability-surfaces.json'), JSON.stringify(canvasFacts)); f.changeConfig(inspectCanvasCli(f.root));
  const approvals = createAgentControlApprovalService(), state = { revision: 7, plans: 0, requests: 0, completes: 0, mutations: 0, latest: null, dropCreate: false, dropComplete: false, mismatch: false, afterPlan: undefined, afterCreate: undefined, afterComplete: undefined };
  f.state.route = async (req, body, auth, res) => {
    const authenticate = scopes => auth.authenticate(String(req.headers.authorization || '').replace(/^Bearer /, ''), scopes);
    if (req.url === '/api/agent-control/v1/capability-tools') { authenticate(['canvas:read']); return structuredClone(canvasCatalog); }
    if (req.url === '/api/agent-control/v1/workspaces') { authenticate(['canvas:read']); return { projectId: 'EXAMPLE_PROJECT', canvases: [{ id: 'EXAMPLE_CANVAS', projectId: 'EXAMPLE_PROJECT', revision: state.revision, name: 'EXAMPLE empty canvas', nodeCount: 0, createdAt: 0 }], total: 1 }; }
    if (req.url === '/api/agent-control/v1/creative-plans' || req.url === '/api/agent-control/v1/capability-tools/invoke') {
      const session = authenticate(['canvas:read']); state.plans++;
      const tool = req.url.endsWith('/invoke') ? canvasCatalog.tools.find(tool => tool.name === body.tool && tool.version === body.version && tool.directOperations.includes(body.operation)) : undefined;
      if (req.url.endsWith('/invoke') && !tool) throw Object.assign(Error('EXAMPLE_UNSUPPORTED_CAPABILITY'), { code: 'EXAMPLE_UNSUPPORTED_CAPABILITY', status: 400 });
      const kind = body.input.kind || tool?.capabilityId.replace(/^create\./, '') || 'image';
      const plan = { schema: 't8-creative-plan-v1', planId: randomUUID(), planDigest: '6'.repeat(64), projectId: body.projectId, canvasId: body.canvasId, canvasRevision: state.revision, action: tool?.capabilityId || `create.${kind}`, kind, brief: { goal: body.input.prompt || '' }, ready: true, candidateCount: 1, questions: [], impact: { patchOperationCount: 3 }, visibleAssumptions: { models: { image: { provider: 'EXAMPLE_PROVIDER', model: 'EXAMPLE_MODEL' } } }, patchId: randomUUID(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
      plan.approvalBinding = createAgentControlApprovalBinding({ action: 'creative.apply', sessionId: session.sessionId, projectId: plan.projectId, canvasId: plan.canvasId, subject: { kind: 'creative-plan', action: plan.action, creativeKind: plan.kind }, subjectVersionDigest: plan.planDigest, planDigest: plan.planDigest, boundary: { providerTransfer: { status: 'approval-required', occursNow: false, scope: 'canvas-structure-only' } } });
      state.latest = { plan, session }; state.afterPlan?.(plan);
      if (!tool) return plan;
      const policy = tool.operations.find(policy => policy.operation === body.operation);
      return { schema: 't8-versioned-creative-tool-result-v1', tool: { name: tool.name, version: tool.version, capabilityId: tool.capabilityId, operation: body.operation, requestAction: tool.capabilityId }, contract: { protocol: 't8-versioned-creative-tool-v1', capabilityManifestDigest: canvasCatalog.capabilityManifestDigest, capabilityGraphDigest: canvasCatalog.capabilityGraphDigest, riskLevel: 'L0', approvalRequired: false, requiredScopes: policy.requiredScopes }, request: { clientRequestId: body.clientRequestId ?? null, projectId: body.projectId, canvasId: body.canvasId }, readOnly: true, directInternalAccess: false, sideEffects: { canvasWrites: 0, providerCalls: 0, fileWrites: 0 }, data: plan };
    }
    if (req.url === '/api/agent-control/v1/creative-approvals') {
      const session = authenticate(['canvas:write']); state.requests++;
      const { plan } = state.latest;
      if (body.planId !== plan.planId || body.projectId !== plan.projectId || body.canvasId !== plan.canvasId || plan.canvasRevision !== state.revision || state.latest.session.sessionId !== session.sessionId) throw Object.assign(Error('EXAMPLE stale'), { code: 'CREATIVE_CANVAS_STALE', status: 409 });
      const binding = createAgentControlApprovalBinding({ action: 'creative.apply', sessionId: session.sessionId, projectId: plan.projectId, canvasId: plan.canvasId, subject: { kind: 'creative-plan', action: plan.action, creativeKind: plan.kind }, subjectVersionDigest: plan.planDigest, planDigest: plan.planDigest, boundary: { providerTransfer: { status: 'approval-required', occursNow: false, scope: 'canvas-structure-only' } } });
      const result = approvals.create({ action: 'creative.apply', operationId: body.operationId, sessionId: session.sessionId, actorId: session.actorId, clientName: session.clientName, projectId: plan.projectId, canvasId: plan.canvasId, patchId: plan.patchId, patch: { id: plan.patchId }, preview: { providerTransfer: { occursNow: false, scope: 'canvas-structure-only' } }, approvalBinding: binding });
      state.afterCreate?.(result);
      if (state.dropCreate) { res.destroy(); return result; }
      return result;
    }
    if (/\/approvals\/[0-9a-f-]+\/complete$/.test(req.url)) {
      const session = authenticate([]); state.completes++;
      const id = req.url.split('/')[5], completion = approvals.beginCompletion({ approvalRequestId: id, pollSecret: body.pollSecret, sessionId: session.sessionId });
      if (completion.status !== 'approved') return { approvalRequestId: id, status: completion.status };
      authenticate(['canvas:write']);
      if (state.latest.plan.canvasRevision !== state.revision) { approvals.finishCompletion(completion.record, false); throw Object.assign(Error('EXAMPLE stale'), { code: 'CREATIVE_CANVAS_STALE', status: 409 }); }
      state.mutations++; state.revision++; approvals.finishCompletion(completion.record, true);
      const result = { approvalRequestId: id, action: 'creative.apply', operationId: completion.record.operationId, patchId: state.mismatch ? 'EXAMPLE_OTHER_PATCH' : completion.record.patchId, revision: state.revision, status: 'applied' };
      state.afterComplete?.(result);
      if (state.dropComplete) res.destroy();
      return result;
    }
  };
  const pair = async () => { await f.pairing.begin(false, writable, runnable, assetTransfer); f.approve(); return f.pairing.complete(); };
  if (autoPair) await pair();
  const file = join(f.base, 'EXAMPLE_DSH', 'canvas-workflow.json'), workflow = new CanvasWorkflow(file, f.config);
  return { ...f, file, workflow, pair, approvalService: approvals, flowState: state, preview: () => workflow.preview({ projectId: 'EXAMPLE_PROJECT', canvasId: 'EXAMPLE_CANVAS', kind: 'image', prompt: 'EXAMPLE synthetic creative goal' }),
    windowApprove() { const pending = approvals.listPending()[0]; if (!pending) throw Error('No EXAMPLE pending approval'); approvals.approve(pending.approvalRequestId); },
    windowDeny() { const pending = approvals.listPending()[0]; approvals.deny(pending.approvalRequestId); },
    async dispose() { workflow.close(); await f.dispose(); },
  };
}
