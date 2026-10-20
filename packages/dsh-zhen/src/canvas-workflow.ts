import { mkdirSync, lstatSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CanvasBridge, CanvasError, inspectCanvasCli } from './canvas.ts';
import type { CanvasConfig, CanvasWorkflowRuntime } from './canvas.ts';
import { canvasEntity, canvasInstance } from './canvas-contract.ts';
import { canvasWorkflowInput, canvasWorkflowSchema, canvasWorkspacesSchema } from './canvas-workflow-schema.ts';
import type { CanvasWorkflowInput, CanvasWorkflowView, CanvasWorkspaces } from './canvas-workflow-schema.ts';
import { nativeCreativePlanSchema, nativePlanView } from './canvas-native-plan.ts';
import type { NativeCreativePlan } from './canvas-native-plan.ts';
import type { CanvasInboxEntry } from './canvas-inbox.ts';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const storedSchema = z.object({ schemaVersion: z.literal(1), config: z.object({ root: z.string().max(4096), digest, instance: z.string().max(128) }).strict(), instanceId: canvasInstance, origin: z.string().max(200), sessionId: z.uuid(), operationId: z.uuid(), view: canvasWorkflowSchema }).strict();
type Stored = z.infer<typeof storedSchema>;

/** UI-only two-step application of native creative plans. No Agent tool, model
 * submission, private patch executor or automatic approval is registered. */
export class CanvasWorkflow {
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  constructor(private readonly file: string, private readonly configured: () => CanvasConfig | undefined) {}
  close(): void { this.closed = true; }
  private serial<T>(work: () => Promise<T>): Promise<T> { const task = this.queue.catch(() => {}).then(work); this.queue = task; return task; }
  private current(config: CanvasConfig): void {
    const now = this.configured();
    if (this.closed || !now || JSON.stringify(now) !== JSON.stringify(config)) throw new CanvasError('WORKFLOW_CONNECTION_CHANGED', '画布连接已变化，请重新检查方案。');
    if (inspectCanvasCli(now.root, now.instance).digest !== now.digest) throw new CanvasError('CLI_CHANGED', '画布工具已变化，请重新审阅连接。');
  }
  private read(): Stored | undefined {
    let bytes: string;
    try { const stat = lstatSync(this.file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) throw Error('shape'); bytes = readFileSync(this.file, 'utf8'); if (Buffer.byteLength(bytes, 'utf8') > 256 * 1024) throw Error('limit'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw new CanvasError('WORKFLOW_RECORD_INVALID', '本地方案进度不可读，请先保留并检查该文件。'); }
    try { return storedSchema.parse(JSON.parse(bytes)); } catch { throw new CanvasError('WORKFLOW_RECORD_INVALID', '本地方案进度格式异常，未发送任何操作。'); }
  }
  private save(record: Stored): void {
    storedSchema.parse(record); const bytes = JSON.stringify(record) + '\n';
    if (Buffer.byteLength(bytes, 'utf8') > 256 * 1024) throw new CanvasError('WORKFLOW_RECORD_LIMIT', '方案预览超过本地支持范围，请缩小本次变更。');
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    try { writeFileSync(temporary, bytes, { mode: 0o600, flag: 'wx' }); renameSync(temporary, this.file); }
    finally { try { unlinkSync(temporary); } catch {} }
  }
  private async binding() {
    const config = this.configured(); if (!config) throw new CanvasError('CANVAS_NOT_CONFIGURED', '请先连接并配对画布。');
    this.current(config); const runtime = await new CanvasBridge(config).workflowRuntime(); this.current(config);
    return { config, runtime };
  }
  private matches(record: Stored, config: CanvasConfig, runtime: CanvasWorkflowRuntime): void {
    this.current(config);
    if (JSON.stringify(record.config) !== JSON.stringify(config) || record.instanceId !== runtime.instance.instanceId || record.origin !== runtime.instance.origin || record.sessionId !== runtime.sessionId) throw new CanvasError('WORKFLOW_CONNECTION_CHANGED', '方案属于另一个画布连接或配对，请核对原画布。');
    const session = runtime.store.loadSession(record.instanceId);
    if (!session || session.sessionId !== record.sessionId || session.origin !== record.origin || session.accessToken !== runtime.accessToken || Date.parse(session.expiresAt) <= Date.now()) throw new CanvasError('WORKFLOW_CONNECTION_CHANGED', '配对已变化或过期，请重新检查。');
  }
  private required(id: string): Stored {
    const record = this.read(); if (!record || record.view.id !== id) throw new CanvasError('WORKFLOW_CHANGED', '方案进度已变化，请刷新后再操作。');
    if (Date.parse(record.view.expiresAt) <= Date.now()) throw new CanvasError('WORKFLOW_EXPIRED', '方案或窗口审批已过期，请重新规划。');
    return record;
  }
  snapshot(): CanvasWorkflowView | null {
    const record = this.read(); if (!record) return null;
    // A restart during either POST must not expose a resend button.
    if (['requesting', 'applying'].includes(record.view.phase)) return { ...record.view, phase: 'unknown' };
    return Date.parse(record.view.expiresAt) <= Date.now() && !['applied', 'denied', 'unknown'].includes(record.view.phase) ? { ...record.view, phase: 'expired' } : record.view;
  }
  private available(): void {
    const previous = this.read();
    if (previous && !['preview', 'applied', 'denied', 'expired'].includes(previous.view.phase) && Date.parse(previous.view.expiresAt) > Date.now()) throw new CanvasError('WORKFLOW_PENDING', '请先处理当前画布审批；结果不明时先在画布检查。');
  }
  private stage(plan: NativeCreativePlan, config: CanvasConfig, runtime: CanvasWorkflowRuntime): CanvasWorkflowView {
    const view = nativePlanView(plan);
    const record: Stored = { schemaVersion: 1, config, instanceId: runtime.instance.instanceId, origin: runtime.instance.origin, sessionId: runtime.sessionId, operationId: randomUUID(), view };
    this.matches(record, config, runtime); this.save(record); return view;
  }
  adopt(entry: CanvasInboxEntry): Promise<CanvasWorkflowView> { return this.serial(async () => {
    this.available(); const { config, runtime } = await this.binding();
    if (entry.config.root !== config.root || entry.config.digest !== config.digest || entry.config.instance !== config.instance || entry.binding.sessionId !== runtime.sessionId) throw new CanvasError('WORKFLOW_CONNECTION_CHANGED', '聊天方案属于另一个画布连接或配对，请重新规划。');
    const plan = nativeCreativePlanSchema.parse(entry.plan);
    if (Date.parse(plan.expiresAt) <= Date.now() || entry.binding.planDigest !== plan.planDigest || entry.binding.projectId !== plan.projectId || entry.binding.canvasId !== plan.canvasId) throw new CanvasError('WORKFLOW_EXPIRED', '聊天方案已过期或引用变化，请重新规划。');
    // Adopt the exact native plan; do not issue another planning POST.
    return this.stage(plan, config, runtime);
  }); }
  workspaces(): Promise<CanvasWorkspaces> { return this.serial(async () => {
    const { config, runtime } = await this.binding();
    const data = (await runtime.client.requestAgentControl(runtime.instance, '/api/agent-control/v1/workspaces', { accessToken: runtime.accessToken })).data;
    this.current(config);
    const parsed = z.object({ canvases: z.array(z.object({ id: canvasEntity, projectId: canvasEntity, name: z.string().max(240), revision: z.number().int().positive() })).max(500) }).parse(data);
    return canvasWorkspacesSchema.parse(parsed);
  }); }
  preview(input: CanvasWorkflowInput): Promise<CanvasWorkflowView> { return this.serial(async () => {
    const request = canvasWorkflowInput.parse(input); this.available();
    const { config, runtime } = await this.binding();
    const plan = nativeCreativePlanSchema.parse((await runtime.client.requestAgentControl(runtime.instance, '/api/agent-control/v1/creative-plans', { accessToken: runtime.accessToken, method: 'POST', body: { projectId: request.projectId, canvasId: request.canvasId, input: { kind: request.kind, prompt: request.prompt, candidates: 1, profile: 'economy' } } })).data);
    this.current(config);
    if (plan.projectId !== request.projectId || plan.canvasId !== request.canvasId || plan.kind !== request.kind || plan.brief.goal !== request.prompt || plan.action !== `create.${request.kind}` || Date.parse(plan.expiresAt) <= Date.now() || Date.parse(plan.expiresAt) > Date.now() + 31 * 60 * 1000) throw new CanvasError('WORKFLOW_PLAN_MISMATCH', '画布返回的计划与本次目标不一致。');
    return this.stage(plan, config, runtime);
  }); }
  approve(id: string, confirmation: boolean): Promise<CanvasWorkflowView> { return this.serial(async () => {
    const record = this.required(id);
    if (!confirmation || record.view.phase !== 'preview' || !record.view.ready) throw new CanvasError('WORKFLOW_REVIEW_REQUIRED', '请先核对方案并明确确认，再送往画布审批。');
    const { config, runtime } = await this.binding(); this.matches(record, config, runtime);
    if (!runtime.scopes.includes('canvas:write')) throw new CanvasError('WORKFLOW_WRITE_SCOPE_REQUIRED', '请在上方重新配对，勾选修改画布权限，并在画布窗口批准。');
    record.view.phase = 'requesting'; this.save(record);
    try {
      const data = (await runtime.client.requestAgentControl(runtime.instance, '/api/agent-control/v1/creative-approvals', { accessToken: runtime.accessToken, method: 'POST', body: { projectId: record.view.projectId, canvasId: record.view.canvasId, planId: record.view.planId, operationId: record.operationId } })).data;
      this.matches(record, config, runtime);
      const approval = z.object({ approvalRequestId: z.uuid(), pollSecret: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/), action: z.literal('creative.apply'), operationId: z.string(), projectId: canvasEntity, canvasId: canvasEntity, patchId: canvasEntity, status: z.enum(['pending', 'approved']), expiresAt: z.iso.datetime(), preview: z.object({ providerTransfer: z.object({ occursNow: z.literal(false), scope: z.literal('canvas-structure-only') }) }), approvalBinding: z.object({ sessionId: z.uuid(), projectId: canvasEntity, canvasId: canvasEntity, planDigest: digest, action: z.literal('creative.apply') }) }).parse(data);
      if (approval.operationId !== record.operationId || approval.projectId !== record.view.projectId || approval.canvasId !== record.view.canvasId || approval.patchId !== record.view.patchId || approval.approvalBinding.sessionId !== record.sessionId || approval.approvalBinding.projectId !== record.view.projectId || approval.approvalBinding.canvasId !== record.view.canvasId || approval.approvalBinding.planDigest !== record.view.planDigest || Date.parse(approval.expiresAt) <= Date.now() || Date.parse(approval.expiresAt) > Date.now() + 11 * 60 * 1000) throw new CanvasError('WORKFLOW_APPROVAL_MISMATCH', '画布审批与已核对的方案不一致，未应用。');
      runtime.store.storeApproval(runtime.instance, { ...data, ...approval }); this.matches(record, config, runtime);
      record.view = { ...record.view, phase: 'pending', approvalRequestId: approval.approvalRequestId, expiresAt: approval.expiresAt }; this.save(record); return record.view;
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? error.code : '';
      record.view.phase = ['CREATIVE_CANVAS_STALE', 'CREATIVE_PLAN_NOT_FOUND', 'CREATIVE_PLAN_NEEDS_INPUT'].includes(String(code)) ? 'expired' : 'unknown';
      this.save(record); throw error;
    }
  }); }
  complete(id: string): Promise<CanvasWorkflowView> { return this.serial(async () => {
    const record = this.required(id);
    if (record.view.phase !== 'pending') throw new CanvasError('WORKFLOW_NOT_PENDING', '当前没有可检查的窗口审批；结果不明时请直接检查画布。');
    const { config, runtime } = await this.binding(); this.matches(record, config, runtime);
    const approval = runtime.store.loadApproval(record.instanceId, record.view.approvalRequestId);
    if (!approval || approval.origin !== record.origin || approval.action !== 'creative.apply' || approval.operationId !== record.operationId || approval.projectId !== record.view.projectId || approval.canvasId !== record.view.canvasId || approval.patchId !== record.view.patchId || !/^[A-Za-z0-9_-]{43,128}$/.test(String(approval.pollSecret))) throw new CanvasError('WORKFLOW_APPROVAL_CHANGED', '原生审批记录已变化，未领取其他操作。');
    this.matches(record, config, runtime); record.view.phase = 'applying'; this.save(record);
    try {
      const result = (await runtime.client.requestAgentControl(runtime.instance, `/api/agent-control/v1/approvals/${encodeURIComponent(record.view.approvalRequestId)}/complete`, { accessToken: runtime.accessToken, method: 'POST', body: { pollSecret: approval.pollSecret } })).data;
      this.matches(record, config, runtime);
      if (result.approvalRequestId !== record.view.approvalRequestId) throw new CanvasError('WORKFLOW_APPROVAL_MISMATCH', '画布返回的审批身份不一致。');
      if (result.status === 'pending' || result.status === 'denied') record.view.phase = result.status;
      else {
        const completed = z.object({ action: z.literal('creative.apply'), operationId: z.string(), patchId: canvasEntity, revision: z.number().int().positive() }).parse(result);
        if (completed.operationId !== record.operationId || completed.patchId !== record.view.patchId || completed.revision <= record.view.canvasRevision) throw new CanvasError('WORKFLOW_RESULT_MISMATCH', '应用结果无法与当前方案核对，请在画布检查。');
        record.view.phase = 'applied'; record.view.revision = completed.revision;
      }
      // Save the known result before best-effort removal of this exact native record.
      this.save(record);
      if (record.view.phase !== 'pending') try { runtime.store.deleteApproval(record.instanceId, record.view.approvalRequestId); } catch {}
      return record.view;
    } catch (error) { record.view.phase = 'unknown'; this.save(record); throw error; }
  }); }
}
