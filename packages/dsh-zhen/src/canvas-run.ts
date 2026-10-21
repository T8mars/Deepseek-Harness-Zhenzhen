import { mkdirSync, lstatSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {assertCanvasTargetConnection,canvasTargetConnection,canvasTargetRuntime} from './canvas-target-binding.ts';
import { CanvasBridge, CanvasError, inspectCanvasCli } from './canvas.ts';
import type { CanvasConfig, CanvasWorkflowRuntime } from './canvas.ts';
import { canvasEntity, canvasInstance } from './canvas-contract.ts';
import { canvasRunSelection, canvasRunViewSchema, canvasRunIntentSchema, canvasRunNodesSchema, canvasRunDeclaration } from './canvas-run-schema.ts';
import type { CanvasRunSelection, CanvasRunView, CanvasRunIntent, CanvasRunNodes } from './canvas-run-schema.ts';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const bindingSchema = z.object({ action: z.literal('run.start'), sessionId: z.uuid(), projectId: canvasEntity, canvasId: canvasEntity, planDigest: digest });
const planSchema = z.object({ schema: z.literal('t8-agent-run-plan-v1'), planId: z.uuid(), planDigest: digest, projectId: canvasEntity, canvasId: canvasEntity, canvasRevision: z.number().int().positive(), requestedNodeIds: z.array(canvasEntity).min(1).max(500), authorizedNodeIds: z.array(canvasEntity).min(1).max(500), declarations: z.array(canvasRunDeclaration).min(1).max(500), mode: z.string().max(80), canStart: z.literal(true), expiresAt: z.iso.datetime(), approvalBinding: bindingSchema });
const stateSchema = z.object({ schemaVersion: z.literal(1), config: z.object({ root: z.string().max(4096), digest, instance: z.string().max(128) }).strict(), instanceId: canvasInstance, origin: z.string().max(200), sessionId: z.uuid(), actorId: z.string().min(1).max(256), view: canvasRunViewSchema }).strict();
type State = z.infer<typeof stateSchema>;
const sameIds = (left: string[], right: string[]) => left.length === new Set(left).size && right.length === new Set(right).size && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
const sameDeclarations = (left: CanvasRunView['declarations'], right: CanvasRunView['declarations']) => JSON.stringify(left.map(entry => ({ ...entry, nodeIds: [...entry.nodeIds].sort() })).sort((a, b) => `${a.provider}:${a.model}`.localeCompare(`${b.provider}:${b.model}`))) === JSON.stringify(right.map(entry => ({ ...entry, nodeIds: [...entry.nodeIds].sort() })).sort((a, b) => `${a.provider}:${a.model}`.localeCompare(`${b.provider}:${b.model}`)));
const operation = (state: State) => `dsh-zhen-run-${state.view.quoteId}`;
const query = (state: State) => `?projectId=${encodeURIComponent(state.view.projectId)}&canvasId=${encodeURIComponent(state.view.canvasId)}`;
const codeOf = (error: unknown) => error && typeof error === 'object' && 'code' in error ? String(error.code) : '';

/** UI-only native quote/approval/intent references. The native run_intents,
 * Run/NodeRun/Attempt ledger owns all reservation and Provider execution. */
export class CanvasRuns {
  private queue: Promise<unknown> = Promise.resolve(); private closed = false;
  constructor(private readonly file: string, private readonly configured: () => CanvasConfig | undefined) {}
  close(): void { this.closed = true; }
  private serial<T>(run: () => Promise<T>): Promise<T> { const task = this.queue.catch(() => {}).then(run); this.queue = task; return task; }
  private current(config: CanvasConfig): void {
    const next = this.configured();
    if (this.closed || !next || next.root !== config.root || next.digest !== config.digest || next.instance !== config.instance) throw new CanvasError('RUN_CONNECTION_CHANGED', '画布连接已变化，请在原画布查询已有运行。');
    if (inspectCanvasCli(config.root, config.instance).digest !== config.digest) throw new CanvasError('CLI_CHANGED', '画布工具已变化，请重新审阅连接。');
  }
  private read(): State | undefined {
    try { const stat = lstatSync(this.file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) throw Error('shape'); const bytes = readFileSync(this.file, 'utf8'); if (Buffer.byteLength(bytes) > 256 * 1024) throw Error('limit'); return stateSchema.parse(JSON.parse(bytes)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw new CanvasError('RUN_RECORD_INVALID', '本地运行引用不可读，未发送任何生成请求。请保留文件并在画布查询。'); }
  }
  private save(state: State): void {
    const bytes = JSON.stringify(stateSchema.parse(state)) + '\n'; if (Buffer.byteLength(bytes) > 256 * 1024) throw new CanvasError('RUN_RECORD_LIMIT', '运行范围过大，请缩小本次节点选择。');
    mkdirSync(dirname(this.file), { recursive: true }); const temporary = this.file + '.' + randomUUID() + '.tmp';
    try { writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 }); renameSync(temporary, this.file); } finally { try { unlinkSync(temporary); } catch {} }
  }
  snapshot(): CanvasRunView | null {
    const state = this.read(); if (!state) return null;
    if (['requesting', 'submitting'].includes(state.view.phase)) return { ...state.view, phase: 'unknown' };
    if (['preview', 'pending'].includes(state.view.phase) && Date.parse(state.view.expiresAt) <= Date.now()) return { ...state.view, phase: 'expired' };
    return state.view;
  }
  private async runtime(expectedConnection?:string) {
    const config = this.configured(); if (!config) throw new CanvasError('CANVAS_NOT_CONFIGURED', '请先连接画布。'); this.current(config);
    const runtime = canvasTargetRuntime(config,await new CanvasBridge(config).workflowRuntime(),expectedConnection);assertCanvasTargetConnection(expectedConnection,config,runtime); this.current(config);
    const status = (await runtime.client.requestAgentControl(runtime.instance, '/api/agent-control/v1/status')).data;
    this.current(config);
    if (!z.object({ schema: z.literal('t8-agent-run-control-v1'), singleUsePlan: z.literal(true), operationLookup: z.literal(true), approvalLookup: z.literal(true) }).safeParse(status.runControl).success) throw new CanvasError('RUN_CONTROL_UPDATE_REQUIRED', '当前画布尚未提供运行计划单次提交与查询恢复，请更新画布控制面后使用生成审批。');
    return { config, runtime };
  }
  private matches(state: State, config: CanvasConfig, runtime: CanvasWorkflowRuntime): void {
    this.current(config);
    const saved = runtime.store.loadSession(runtime.instance.instanceId);
    if (state.config.root !== config.root || state.config.digest !== config.digest || state.config.instance !== config.instance || state.instanceId !== runtime.instance.instanceId || state.origin !== runtime.instance.origin || state.sessionId !== runtime.sessionId || state.actorId !== runtime.actorId || saved?.sessionId !== state.sessionId || saved.origin !== state.origin || saved.accessToken !== runtime.accessToken || Date.parse(saved.expiresAt) <= Date.now()) throw new CanvasError('RUN_CONNECTION_CHANGED', '运行引用属于原配对，请在原画布查询；不会重新提交。');
  }
  private require(quoteId: string): State { const state = this.read(); if (!state || state.view.quoteId !== quoteId) throw new CanvasError('RUN_QUOTE_CHANGED', '运行计划已变化，请刷新当前引用。'); return state; }
  nodes(projectId: string, canvasId: string, offset = 0,expectedConnection?:string): Promise<CanvasRunNodes> { return this.serial(async () => {
    canvasEntity.max(160).parse(projectId); canvasEntity.max(160).parse(canvasId); z.number().int().min(0).max(100000).parse(offset);
    const { config,runtime } = await this.runtime(expectedConnection), bridge = new CanvasBridge(config),connectionId=canvasTargetConnection(config,runtime);
    const inspected = await bridge.inspect({ tool: 'inspectCanvas', projectId, canvasId, input: { nodeOffset: offset, nodeLimit: 100, edgeLimit: 1 } },connectionId);
    const schemas = await bridge.inspect({ tool: 'inspectNodeSchema', projectId, canvasId, input: { offset: 0, limit: 100, includeHidden: false } },connectionId); this.current(config);
    const page = z.object({ canvasId: canvasEntity, revision: z.number().int().positive(), nodes: z.array(z.object({ id: canvasEntity, type: canvasEntity })).max(100), page: z.object({ hasMoreNodes: z.boolean() }) }).parse(inspected.data);
    const catalog = z.object({ items: z.array(z.object({ type: canvasEntity, label: z.string().max(240), executable: z.boolean() })).max(100), page: z.object({ hasMore: z.literal(false) }) }).parse(schemas.data);
    if (page.canvasId !== canvasId || inspected.canvasRevision !== schemas.canvasRevision || inspected.canvasRevision !== page.revision) throw new CanvasError('RUN_CANVAS_CHANGED', '读取节点期间画布已变化，请重新读取。');
    return canvasRunNodesSchema.parse({ projectId, canvasId, connectionId, revision: page.revision, nodes: page.nodes.map(node => { const type = catalog.items.find(item => item.type === node.type); return { ...node, label: type?.label || node.type, executable: type?.executable === true }; }), nextOffset: offset + page.nodes.length, hasMore: page.page.hasMoreNodes });
  }); }
  quote(input: CanvasRunSelection,expectedConnection?:string): Promise<CanvasRunView> { return this.serial(async () => {
    const selected = canvasRunSelection.parse(input), previous = this.read();
    if (previous && !['preview', 'denied', 'expired', 'tracking'].includes(previous.view.phase) && !(Date.parse(previous.view.expiresAt) <= Date.now() && !previous.view.submissionAttempted)) throw new CanvasError('RUN_PENDING', '请先处理当前审批；结果不明时只查询原运行。');
    const { config, runtime } = await this.runtime(expectedConnection);
    const plan = planSchema.parse((await runtime.client.requestAgentControl(runtime.instance, '/api/agent-control/v1/run-plans', { accessToken: runtime.accessToken, method: 'POST', body: { ...selected, mode: 'missing-failed-unlocked' } })).data); this.current(config);
    if (plan.projectId !== selected.projectId || plan.canvasId !== selected.canvasId || plan.canvasRevision !== selected.canvasRevision || !sameIds(plan.requestedNodeIds, selected.nodeIds) || !sameIds(plan.authorizedNodeIds, plan.declarations.flatMap(item => item.nodeIds)) || plan.requestedNodeIds.some(id => !plan.authorizedNodeIds.includes(id)) || plan.approvalBinding.sessionId !== runtime.sessionId || plan.approvalBinding.projectId !== selected.projectId || plan.approvalBinding.canvasId !== selected.canvasId || plan.approvalBinding.planDigest !== plan.planDigest || Date.parse(plan.expiresAt) <= Date.now() || Date.parse(plan.expiresAt) > Date.now() + 31 * 60_000) throw new CanvasError('RUN_PLAN_MISMATCH', '原生运行计划与节点、模型或配对不一致，未请求审批。');
    const view = canvasRunViewSchema.parse({ quoteId: plan.planId, planDigest: plan.planDigest, projectId: plan.projectId, canvasId: plan.canvasId, canvasRevision: plan.canvasRevision, requestedNodeIds: plan.requestedNodeIds, authorizedNodeIds: plan.authorizedNodeIds, declarations: plan.declarations, mode: plan.mode, expiresAt: plan.expiresAt, priceKnown: false, estimatedCost: null, phase: 'preview', submissionAttempted: false, approvalRequestId: '', intent: null });
    const state: State = { schemaVersion: 1, config, instanceId: runtime.instance.instanceId, origin: runtime.instance.origin, sessionId: runtime.sessionId, actorId: runtime.actorId, view }; this.matches(state, config, runtime); this.save(state); return view;
  }); }
  private approval(state: State, data: Record<string, unknown>, runtime: CanvasWorkflowRuntime, config: CanvasConfig): CanvasRunView {
    const record = z.object({ approvalRequestId: z.uuid(), pollSecret: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/), action: z.literal('run.start'), operationId: z.string(), projectId: canvasEntity, canvasId: canvasEntity, expiresAt: z.iso.datetime(), status: z.enum(['pending', 'approved', 'denied']), approvalBinding: bindingSchema, preview: z.object({ riskLevel: z.literal('L2'), projectId: canvasEntity, canvasId: canvasEntity, currentRevision: z.number().int().positive(), run: z.object({ planId: z.uuid(), planDigest: digest, requestedNodeIds: z.array(canvasEntity), authorizedNodeIds: z.array(canvasEntity), declarations: z.array(canvasRunDeclaration) }), providerTransfer: z.object({ occursNow: z.literal(false), scope: z.literal('after-approval-only') }) }) }).parse(data);
    if (record.operationId !== operation(state) || record.projectId !== state.view.projectId || record.canvasId !== state.view.canvasId || record.approvalBinding.sessionId !== state.sessionId || record.approvalBinding.planDigest !== state.view.planDigest || record.approvalBinding.projectId !== state.view.projectId || record.approvalBinding.canvasId !== state.view.canvasId || record.preview.projectId !== state.view.projectId || record.preview.canvasId !== state.view.canvasId || record.preview.currentRevision !== state.view.canvasRevision || record.preview.run.planId !== state.view.quoteId || record.preview.run.planDigest !== state.view.planDigest || !sameIds(record.preview.run.requestedNodeIds, state.view.requestedNodeIds) || !sameIds(record.preview.run.authorizedNodeIds, state.view.authorizedNodeIds) || !sameDeclarations(record.preview.run.declarations, state.view.declarations) || Date.parse(record.expiresAt) <= Date.now() || Date.parse(record.expiresAt) > Date.now() + 11 * 60_000) throw new CanvasError('RUN_APPROVAL_MISMATCH', '原生窗口审批不属于已核对的运行计划，未提交。');
    this.matches(state, config, runtime); runtime.store.storeApproval(runtime.instance, data); this.matches(state, config, runtime);
    state.view.approvalRequestId = record.approvalRequestId; state.view.expiresAt = new Date(Math.min(Date.parse(state.view.expiresAt), Date.parse(record.expiresAt))).toISOString(); state.view.phase = record.status === 'denied' ? 'denied' : Date.parse(state.view.expiresAt) <= Date.now() ? 'expired' : 'pending'; this.save(state); return state.view;
  }
  approve(quoteId: string, confirmed: boolean, unknownPriceAccepted: boolean): Promise<CanvasRunView> { return this.serial(async () => {
    const state = this.require(quoteId);
    if (!confirmed || !unknownPriceAccepted || state.view.phase !== 'preview' || state.view.submissionAttempted || Date.parse(state.view.expiresAt) <= Date.now()) throw new CanvasError('RUN_REVIEW_REQUIRED', '请核对全部执行节点与模型，并明确接受费用未知后再请求画布审批。');
    const { config, runtime } = await this.runtime(); this.matches(state, config, runtime);
    if (!runtime.scopes.includes('run:execute')) throw new CanvasError('RUN_SCOPE_REQUIRED', '请先在配对中单独申请执行生成权限，并由画布窗口批准。');
    state.view.phase = 'requesting'; this.save(state);
    try { const data = (await runtime.client.requestAgentControl(runtime.instance, '/api/agent-control/v1/run-start-approvals', { accessToken: runtime.accessToken, method: 'POST', body: { projectId: state.view.projectId, canvasId: state.view.canvasId, planId: state.view.quoteId, operationId: operation(state) } })).data; return this.approval(state, data, runtime, config); }
    catch (error) { state.view.phase = ['RUN_CANVAS_STALE', 'RUN_PLAN_NOT_FOUND', 'RUN_PLAN_EXPIRED'].includes(codeOf(error)) ? 'expired' : 'unknown'; this.save(state); throw error; }
  }); }
  private intent(state: State, data: Record<string, unknown>): CanvasRunIntent {
    const parsed = canvasRunIntentSchema.parse(Object.fromEntries(Object.keys(canvasRunIntentSchema.shape).map(key => [key, data[key] ?? (key === 'runId' ? null : undefined)])));
    if (parsed.operationId !== operation(state) || parsed.projectId !== state.view.projectId || parsed.canvasId !== state.view.canvasId || parsed.canvasRevision !== state.view.canvasRevision || parsed.requestedBy !== state.actorId || !sameIds(parsed.nodeIds, state.view.requestedNodeIds) || state.view.intent && parsed.id !== state.view.intent.id) throw new CanvasError('RUN_RESULT_MISMATCH', '运行引用与原计划不一致，请在画布检查；不会重新提交。');
    return parsed;
  }
  submit(quoteId: string): Promise<CanvasRunView> { return this.serial(async () => {
    const state = this.require(quoteId);
    if (state.view.phase !== 'pending' || state.view.submissionAttempted || Date.parse(state.view.expiresAt) <= Date.now()) throw new CanvasError('RUN_QUERY_ONLY', '该运行不允许再次提交；请查询原任务。');
    const { config, runtime } = await this.runtime(); this.matches(state, config, runtime);
    const record = runtime.store.loadApproval(state.instanceId, state.view.approvalRequestId);
    if (!record || record.action !== 'run.start' || record.origin !== state.origin || record.operationId !== operation(state) || record.projectId !== state.view.projectId || record.canvasId !== state.view.canvasId || !/^[A-Za-z0-9_-]{43,128}$/.test(String(record.pollSecret))) throw new CanvasError('RUN_APPROVAL_CHANGED', '原生审批记录已变化，请仅查询原运行或窗口审批。');
    state.view.phase = 'submitting'; state.view.submissionAttempted = true; this.save(state);
    try {
      const data = (await runtime.client.requestAgentControl(runtime.instance, `/api/agent-control/v1/approvals/${encodeURIComponent(state.view.approvalRequestId)}/complete`, { accessToken: runtime.accessToken, method: 'POST', body: { pollSecret: record.pollSecret } })).data; this.matches(state, config, runtime);
      if (data.approvalRequestId !== state.view.approvalRequestId) throw new CanvasError('RUN_RESULT_MISMATCH', '返回了其他窗口审批，未确认运行结果。');
      if (data.status === 'pending' || data.status === 'denied') { state.view.phase = data.status; state.view.submissionAttempted = false; }
      else { if (data.action !== 'run.start') throw new CanvasError('RUN_RESULT_MISMATCH', '运行响应动作不一致。'); state.view.intent = this.intent(state, data); state.view.phase = 'tracking'; }
      this.save(state); if (state.view.phase !== 'pending') try { runtime.store.deleteApproval(state.instanceId, state.view.approvalRequestId); } catch {}
      return state.view;
    } catch (error) { state.view.phase = 'unknown'; this.save(state); throw error; }
  }); }
  refresh(quoteId: string): Promise<CanvasRunView> { return this.serial(async () => {
    const state = this.require(quoteId), { config, runtime } = await this.runtime(); this.matches(state, config, runtime);
    try {
      const data = (await runtime.client.requestAgentControl(runtime.instance, `/api/agent-control/v1/run-intents/by-operation/${encodeURIComponent(operation(state))}${query(state)}`, { accessToken: runtime.accessToken })).data; this.matches(state, config, runtime);
      state.view.intent = this.intent(state, data); state.view.phase = 'tracking'; state.view.submissionAttempted = true; this.save(state); return state.view;
    } catch (error) {
      if (codeOf(error) !== 'RUN_INTENT_NOT_FOUND') throw error;
      this.matches(state, config, runtime);
      if (state.view.submissionAttempted) { state.view.phase = 'unknown'; this.save(state); return state.view; }
      if (!['pending', 'unknown', 'requesting'].includes(state.view.phase)) return state.view;
      try { const data = (await runtime.client.requestAgentControl(runtime.instance, `/api/agent-control/v1/run-start-approvals/by-operation/${encodeURIComponent(operation(state))}${query(state)}`, { accessToken: runtime.accessToken })).data; return this.approval(state, data, runtime, config); }
      catch (approvalError) { if (codeOf(approvalError) !== 'APPROVAL_NOT_FOUND') throw approvalError; state.view.phase = Date.parse(state.view.expiresAt) <= Date.now() ? 'expired' : 'unknown'; this.save(state); return state.view; }
    }
  }); }
}
