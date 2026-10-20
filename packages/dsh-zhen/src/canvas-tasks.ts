import { z } from 'zod';
import { CanvasBridge, CanvasError, inspectCanvasCli } from './canvas.ts';
import type { CanvasConfig, CanvasWorkflowRuntime } from './canvas.ts';
import { canvasEntity } from './canvas-contract.ts';
import { canvasTaskScope, canvasTaskReference, canvasTaskSummary, canvasTaskStatus, canvasTaskListSchema, canvasTaskDetailSchema } from './canvas-task-schema.ts';
import type { CanvasTaskScope, CanvasTaskReference, CanvasTaskList, CanvasTaskDetail } from './canvas-task-schema.ts';
const timestamp = z.number().int().nonnegative().max(8640000000000000);
const wireIntent = z.object({ id: canvasEntity, projectId: canvasEntity, canvasId: canvasEntity, canvasRevision: z.number().int().positive(), nodeIds: z.array(canvasEntity).min(1).max(500).refine(ids => new Set(ids).size === ids.length), requestedBy: z.string().min(1).max(256), provider: z.string().max(240).nullable().default(null), model: z.string().max(240).nullable().default(null), status: z.string().min(1).max(80), runId: canvasEntity.nullable().default(null), queueRevision: z.number().int().positive(), createdAt: timestamp.default(0), updatedAt: timestamp.default(0) });
type WireIntent = z.infer<typeof wireIntent>;
const wireEvidence = z.object({ verified: z.boolean(), reasons: z.array(z.string().max(4096)).max(5000), run: z.object({ runId: canvasEntity, status: z.string().max(80), canvasRevision: z.number().int().positive().nullable() }).nullable(), nodeRuns: z.array(z.object({ nodeRunId: canvasEntity, nodeId: canvasEntity, status: z.string().max(80), latestAttemptId: canvasEntity.nullable(), latestAttemptStatus: z.string().max(80).nullable(), outputAssetIds: z.array(canvasEntity).max(5000) })).max(500), assets: z.array(z.object({ assetId: canvasEntity, nodeRunId: canvasEntity, stored: z.boolean(), hashVerified: z.boolean(), magicVerified: z.boolean(), associationVerified: z.boolean() })).max(5000) }).refine(evidence => evidence.nodeRuns.reduce((total, node) => total + node.outputAssetIds.length, 0) <= 5000, 'Native evidence exceeds the bounded output reference limit');
type EvidenceReason = CanvasTaskDetail['evidence']['reasons'][number];
const label = (value: string | null): string | null => value && /^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,239}$/.test(value) && !/https?:\/\/|data:|\bsk-[A-Za-z0-9]{8,}/i.test(value) ? value : null;
function reason(raw: string): EvidenceReason {
  const code = raw.split(':', 1)[0];
  if (code === 'run_not_completed') return 'run-incomplete';
  if (['run_id_missing', 'run_evidence_missing'].includes(code)) return 'run-missing';
  if (/mismatch|association/.test(code)) return 'scope-mismatch';
  if (/node_run/.test(code)) return 'node-incomplete';
  if (/attempt/.test(code)) return 'attempt-incomplete';
  if (code === 'output_asset_missing') return 'asset-missing';
  if (/asset|artifact|blob|hash|magic|decode/.test(code)) return 'asset-unverified';
  return 'native-unverified';
}
/** Read the existing native ledger only. No local task ledger, Provider request,
 * submission, retry, cancellation, approval or polling side effect. */
export class CanvasTasks {
  private closed = false;
  constructor(private readonly configured: () => CanvasConfig | undefined) {}
  close(): void { this.closed = true; }
  private current(config: CanvasConfig, runtime?: CanvasWorkflowRuntime): void {
    const next = this.configured();
    if (this.closed || !next || next.root !== config.root || next.digest !== config.digest || next.instance !== config.instance) throw new CanvasError('TASK_CONNECTION_CHANGED', '画布连接已变化，请重新读取任务。');
    if (inspectCanvasCli(config.root, config.instance).digest !== config.digest) throw new CanvasError('CLI_CHANGED', '画布工具已变化，请重新审阅连接。');
    if (runtime) { const session = runtime.store.loadSession(runtime.instance.instanceId); if (!session || session.sessionId !== runtime.sessionId || session.origin !== runtime.instance.origin || session.accessToken !== runtime.accessToken || Date.parse(session.expiresAt) <= Date.now()) throw new CanvasError('TASK_CONNECTION_CHANGED', '画布配对已变化，请重新读取任务。'); }
  }
  private async read(scope: CanvasTaskScope, id?: string): Promise<{ data: Record<string, unknown>; runtime: CanvasWorkflowRuntime }> {
    const config = this.configured(); if (!config) throw new CanvasError('CANVAS_NOT_CONFIGURED', '请先在连接页连接画布。'); this.current(config);
    const runtime = await new CanvasBridge(config).workflowRuntime(); this.current(config, runtime);
    if (!runtime.scopes.includes('run:read')) throw new CanvasError('TASK_SCOPE_REQUIRED', '当前配对没有任务读取权限。');
    const path = '/api/agent-control/v1/run-intents' + (id ? '/' + encodeURIComponent(id) : '') + `?projectId=${encodeURIComponent(scope.projectId)}&canvasId=${encodeURIComponent(scope.canvasId)}`;
    const data = (await runtime.client.requestAgentControl(runtime.instance, path, { accessToken: runtime.accessToken })).data; this.current(config, runtime); return { data, runtime };
  }
  private checked(value: unknown, scope: CanvasTaskScope, runtime: CanvasWorkflowRuntime): WireIntent {
    const intent = wireIntent.parse(value);
    if (intent.projectId !== scope.projectId || intent.canvasId !== scope.canvasId || intent.requestedBy !== runtime.actorId) throw new CanvasError('TASK_RESULT_MISMATCH', '原生任务不属于当前配对或所选画布，未显示。');
    return intent;
  }
  private summary(intent: WireIntent) { return canvasTaskSummary.parse({ id: intent.id, projectId: intent.projectId, canvasId: intent.canvasId, canvasRevision: intent.canvasRevision, nodeCount: intent.nodeIds.length, provider: label(intent.provider), model: label(intent.model), status: canvasTaskStatus.safeParse(intent.status).success ? intent.status : 'unknown', runId: intent.runId, queueRevision: intent.queueRevision, createdAt: intent.createdAt, updatedAt: intent.updatedAt }); }
  async list(input: CanvasTaskScope): Promise<CanvasTaskList> {
    const scope = canvasTaskScope.parse(input), { data, runtime } = await this.read(scope);
    const parsed = z.object({ items: z.array(z.unknown()).max(100) }).parse(data);
    const items = parsed.items.map(value => this.summary(this.checked(value, scope, runtime)));
    if (new Set(items.map(item => item.id)).size !== items.length) throw new CanvasError('TASK_RESULT_MISMATCH', '原生任务列表包含重复引用，请在画布检查。');
    return canvasTaskListSchema.parse({ ...scope, items, limit: 100, atLimit: items.length === 100 });
  }
  async detail(input: CanvasTaskReference): Promise<CanvasTaskDetail> {
    const reference = canvasTaskReference.parse(input), { data, runtime } = await this.read(reference, reference.id), intent = this.checked(data, reference, runtime);
    if (intent.id !== reference.id) throw new CanvasError('TASK_RESULT_MISMATCH', '返回了其他运行引用，未显示。');
    const evidence = wireEvidence.parse(data.artifactVerification), completed = intent.status === 'completed';
    const successfulNodes = evidence.nodeRuns.filter(node => node.status === 'succeeded').length, successfulAttempts = evidence.nodeRuns.filter(node => !!node.latestAttemptId && node.latestAttemptStatus === 'succeeded').length;
    const count = (field: 'stored' | 'hashVerified' | 'magicVerified' | 'associationVerified') => evidence.assets.filter(asset => asset[field]).length;
    const runMatches = !!intent.runId && evidence.run?.runId === intent.runId && evidence.run.canvasRevision === intent.canvasRevision && ['completed', 'succeeded'].includes(evidence.run.status);
    const pair = (node: string, asset: string) => JSON.stringify([node, asset]);
    const outputs = new Set(evidence.nodeRuns.flatMap(node => node.outputAssetIds.map(id => pair(node.nodeRunId, id))));
    const assets = new Set(evidence.assets.map(asset => pair(asset.nodeRunId, asset.assetId))), nodeIds = new Set(evidence.nodeRuns.map(node => node.nodeId));
    const nodesMatch = evidence.nodeRuns.length > 0 && successfulNodes === evidence.nodeRuns.length && successfulAttempts === evidence.nodeRuns.length && new Set(evidence.nodeRuns.map(node => node.nodeRunId)).size === evidence.nodeRuns.length && intent.nodeIds.every(id => nodeIds.has(id)) && evidence.nodeRuns.every(node => node.outputAssetIds.length > 0 && new Set(node.outputAssetIds).size === node.outputAssetIds.length && node.outputAssetIds.every(id => assets.has(pair(node.nodeRunId, id))));
    const assetsMatch = evidence.assets.length > 0 && assets.size === evidence.assets.length && evidence.assets.every(asset => asset.stored && asset.hashVerified && asset.magicVerified && asset.associationVerified && outputs.has(pair(asset.nodeRunId, asset.assetId)));
    const verified = completed && data.completionVerified === true && evidence.verified && evidence.reasons.length === 0 && runMatches && nodesMatch && assetsMatch;
    const reasons = new Set<EvidenceReason>(evidence.reasons.map(reason));
    if (completed && !verified) reasons.add(data.completionVerified === true || evidence.verified ? 'inconsistent-evidence' : 'native-unverified');
    if (!completed) reasons.add('run-incomplete');
    return canvasTaskDetailSchema.parse({ ...this.summary(intent), evidence: { verdict: !completed ? 'not-completed' : verified ? 'verified' : 'unverified', runPresent: !!evidence.run, nodeRecords: evidence.nodeRuns.length, successfulNodes, successfulAttempts, assetRecords: evidence.assets.length, storedAssets: count('stored'), hashVerifiedAssets: count('hashVerified'), magicVerifiedAssets: count('magicVerified'), associatedAssets: count('associationVerified'), reasons: [...reasons] } });
  }
}
