import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CanvasRuns } from '../../packages/dsh-zhen/lib/canvas-run.js';
import { canvasWorkflowFixture } from './canvas-workflow.mjs';
const require = createRequire(import.meta.url);
const { createAgentControlApprovalService, createAgentControlApprovalBinding } = require('./canvas-run-control/approvals.cjs');
export function assertRunApprovalFixture() { const meta = JSON.parse(readFileSync(new URL('./canvas-run-control/source.json', import.meta.url))); for (const file of meta.files) if (createHash('sha256').update(readFileSync(new URL(`./canvas-run-control/${file.file}`, import.meta.url))).digest('hex') !== file.sha256) throw Error('Native run-approval source fixture changed'); return meta; }
export async function canvasRunFixture(options = {}) {
  const f = await canvasWorkflowFixture({ writable: false, runnable: true, ...options });
  const approvals = createAgentControlApprovalService(), plans = new Map(), intents = new Map();
  const previous = f.state.route, state = { planPosts: 0, approvals: 0, completePosts: 0, writes: 0, gets: [], enabled: true, dropApproval: false, dropComplete: false, mismatch: false, afterApproval: undefined, listReply: undefined, detailReply: undefined, afterRead: undefined };
  f.state.route = async (req, body, auth, res) => {
    const session = scopes => auth.authenticate(String(req.headers.authorization || '').replace(/^Bearer /, ''), scopes);
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET') state.gets.push(url.pathname);
    if (url.pathname === '/api/agent-control/v1/status') return { compat: { supported: true, fixture: 'EXAMPLE_ONLY' }, ...(state.enabled ? { runControl: { schema: 't8-agent-run-control-v1', singleUsePlan: true, operationLookup: true, approvalLookup: true } } : {}) };
    if (url.pathname === '/api/agent-control/v1/tools') {
      const current = session(['canvas:read']);
      const data = body.tool === 'inspectCanvas' ? { canvasId: body.canvasId, revision: f.flowState.revision, nodes: [{ id: 'EXAMPLE_IMAGE', type: 'image' }, { id: 'EXAMPLE_TEXT', type: 'text' }], page: { hasMoreNodes: false } } : { items: [{ type: 'image', label: 'EXAMPLE image', executable: true }, { type: 'text', label: 'EXAMPLE text', executable: false }], page: { hasMore: false } };
      return { schema: 't8-canvas-agent-tool-result-v1', tool: body.tool, requestId: body.requestId, projectId: body.projectId, canvasId: body.canvasId, canvasRevision: f.flowState.revision, actorId: current.actorId, role: 'editor', authority: {}, nodeSchemaDigest: '1'.repeat(64), readOnly: true, truncated: false, data, digest: '8'.repeat(64) };
    }
    if (url.pathname === '/api/agent-control/v1/run-plans') {
      const current = session(['run:read']); state.planPosts++;
      const plan = { schema: 't8-agent-run-plan-v1', planId: randomUUID(), planDigest: '7'.repeat(64), projectId: body.projectId, canvasId: body.canvasId, canvasRevision: body.canvasRevision, requestedNodeIds: [...body.nodeIds].sort(), authorizedNodeIds: [...body.nodeIds].sort(), declarations: [{ provider: 'EXAMPLE_PROVIDER', model: 'EXAMPLE_MODEL', nodeIds: [...body.nodeIds].sort() }], mode: body.mode, canStart: true, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
      plan.approvalBinding = createAgentControlApprovalBinding({ action: 'run.start', sessionId: current.sessionId, projectId: plan.projectId, canvasId: plan.canvasId, subject: { kind: 'run-plan', requestedNodeIds: plan.requestedNodeIds }, planDigest: plan.planDigest, boundary: { providerTransfer: { occursNow: false, scope: 'after-approval-only' } } });
      plans.set(plan.planId, { plan, current }); return plan;
    }
    if (url.pathname === '/api/agent-control/v1/run-start-approvals') {
      const current = session(['run:execute']), original = plans.get(body.planId); state.approvals++;
      if (!original || original.current.sessionId !== current.sessionId || original.plan.projectId !== body.projectId || original.plan.canvasId !== body.canvasId) throw Object.assign(Error('EXAMPLE scope'), { code: 'RUN_PLAN_NOT_FOUND', status: 404 });
      const plan = original.plan;
      const result = approvals.create({ action: 'run.start', operationId: body.operationId, sessionId: current.sessionId, actorId: current.actorId, clientName: current.clientName, projectId: plan.projectId, canvasId: plan.canvasId, payload: { plan }, approvalBinding: plan.approvalBinding, preview: { riskLevel: 'L2', projectId: plan.projectId, canvasId: plan.canvasId, currentRevision: plan.canvasRevision, run: { ...plan }, providerTransfer: { occursNow: false, scope: 'after-approval-only' } } });
      state.afterApproval?.(result); if (state.dropApproval) res.destroy(); return result;
    }
    if (url.pathname.startsWith('/api/agent-control/v1/run-start-approvals/by-operation/')) {
      const current = session(['run:execute']); return approvals.inspectOperation({ action: 'run.start', operationId: decodeURIComponent(url.pathname.split('/').at(-1)), sessionId: current.sessionId, projectId: url.searchParams.get('projectId'), canvasId: url.searchParams.get('canvasId') });
    }
    if (req.method === 'GET' && url.pathname === '/api/agent-control/v1/run-intents') {
      const current = session(['run:read']), items = [...intents.values()].filter(intent => intent.requestedBy === current.actorId && intent.projectId === url.searchParams.get('projectId') && intent.canvasId === url.searchParams.get('canvasId'));
      const result = state.listReply ?? { items }; state.afterRead?.(); return result;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/agent-control/v1/run-intents/')) {
      const current = session(['run:read']), reference = decodeURIComponent(url.pathname.split('/').at(-1)), intent = url.pathname.includes('/by-operation/') ? intents.get(reference) : [...intents.values()].find(item => item.id === reference);
      if (!intent || intent.requestedBy !== current.actorId || intent.projectId !== url.searchParams.get('projectId') || intent.canvasId !== url.searchParams.get('canvasId')) throw Object.assign(Error('EXAMPLE not found'), { code: 'RUN_INTENT_NOT_FOUND', status: 404 });
      const result = state.detailReply ?? { ...intent, completionVerified: false, artifactVerification: { verified: false, reasons: ['run_not_completed'], run: null, nodeRuns: [], assets: [] } }; state.afterRead?.(); return result;
    }
    if (/\/approvals\/[0-9a-f-]+\/complete$/.test(url.pathname)) {
      const current = session([]); state.completePosts++;
      const id = url.pathname.split('/')[5], completion = approvals.beginCompletion({ approvalRequestId: id, pollSecret: body.pollSecret, sessionId: current.sessionId });
      if (completion.status !== 'approved') return { approvalRequestId: id, status: completion.status };
      session(['run:execute']); const record = completion.record, plan = record.payload.plan;
      let intent = intents.get(record.operationId);
      if (!intent) { intent = { id: randomUUID(), operationId: record.operationId, projectId: plan.projectId, canvasId: plan.canvasId, canvasRevision: plan.canvasRevision, nodeIds: plan.requestedNodeIds, requestedBy: current.actorId, status: 'accepted', runId: null, queueRevision: 1 }; intents.set(record.operationId, intent); state.writes++; }
      approvals.finishCompletion(record, true);
      const result = { approvalRequestId: id, action: 'run.start', ...intent, operationId: state.mismatch ? 'EXAMPLE_OTHER_OPERATION' : intent.operationId };
      if (state.dropComplete) res.destroy(); return result;
    }
    return previous(req, body, auth, res);
  };
  const file = join(f.base, 'EXAMPLE_DSH/canvas-run.json'), runs = new CanvasRuns(file, f.config);
  return { ...f, runFile: file, runs, runState: state, intents,
    quote: () => runs.quote({ projectId: 'EXAMPLE_PROJECT', canvasId: 'EXAMPLE_CANVAS', canvasRevision: f.flowState.revision, nodeIds: ['EXAMPLE_IMAGE'] }),
    approveRun() { const pending = approvals.listPending()[0]; if (!pending) throw Error('Missing EXAMPLE approval'); return approvals.approve(pending.approvalRequestId); },
    denyRun() { const pending = approvals.listPending()[0]; return approvals.deny(pending.approvalRequestId); },
    async dispose() { runs.close(); await f.dispose(); },
  };
}
