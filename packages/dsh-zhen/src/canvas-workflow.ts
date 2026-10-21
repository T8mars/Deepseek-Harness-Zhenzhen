import { mkdirSync, lstatSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CanvasBridge, CanvasError, inspectCanvasCli } from './canvas.ts';
import type { CanvasConfig, CanvasWorkflowRuntime } from './canvas.ts';
import { canvasEntity, canvasInstance } from './canvas-contract.ts';
import { canvasWorkflowInput, canvasWorkflowSchema, canvasWorkspacesSchema, canvasModelsQuery } from './canvas-workflow-schema.ts';
import type { CanvasWorkflowInput, CanvasWorkflowView, CanvasWorkspaces, CanvasModels, CanvasModelsQuery, CanvasModelKind } from './canvas-workflow-schema.ts';
import {canvasModelsView} from './canvas-models.ts';
import {canvasAssetsQuery,canvasReferenceKeys} from './canvas-reference-schema.ts';
import type {CanvasAsset,CanvasAssets,CanvasAssetsQuery,CanvasReferenceKey} from './canvas-reference-schema.ts';
import {canvasAssetView,canvasAssetsView,canvasAssetKey,nativeAttachmentDigest} from './canvas-assets.ts';
import { nativeCreativePlanSchema, nativePlanView } from './canvas-native-plan.ts';
import type { NativeCreativePlan } from './canvas-native-plan.ts';
import type { CanvasInboxEntry } from './canvas-inbox.ts';
import {canvasActiveTargetsSchema} from './canvas-active-schema.ts';
import type {CanvasActiveTargets} from './canvas-active-schema.ts';
import {readCanvasActiveContext,parseCanvasActiveContext} from './canvas-active-context.ts';

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
  private currentSession(config:CanvasConfig,runtime:CanvasWorkflowRuntime):void {
    this.current(config);const session=runtime.store.loadSession(runtime.instance.instanceId);
    if(!session||session.sessionId!==runtime.sessionId||session.origin!==runtime.instance.origin||session.accessToken!==runtime.accessToken||Date.parse(session.expiresAt)<=Date.now())throw new CanvasError('WORKFLOW_CONNECTION_CHANGED','配对已变化或过期，请重新检查。');
  }
  private async readModels(input:CanvasModelsQuery,config:CanvasConfig,runtime:CanvasWorkflowRuntime):Promise<CanvasModels> {
    this.currentSession(config,runtime);const query=new URLSearchParams({projectId:input.projectId,canvasId:input.canvasId,kind:input.kind,query:input.query??''});
    const data=(await runtime.client.requestAgentControl(runtime.instance,'/api/agent-control/v1/models?'+query.toString(),{accessToken:runtime.accessToken})).data;
    this.currentSession(config,runtime);return canvasModelsView(input,data);
  }
  models(input:CanvasModelsQuery):Promise<CanvasModels>{return this.serial(async()=>{const request=canvasModelsQuery.parse(input),{config,runtime}=await this.binding();return this.readModels(request,config,runtime);});}
  private referenceScope(runtime:CanvasWorkflowRuntime):void{if(!runtime.scopes.includes('asset:read'))throw new CanvasError('WORKFLOW_ASSET_SCOPE_REQUIRED','请选择读取素材权限，并在画布窗口批准配对。');}
  private async readAssets(input:CanvasAssetsQuery,config:CanvasConfig,runtime:CanvasWorkflowRuntime):Promise<CanvasAssets>{
    this.referenceScope(runtime);this.currentSession(config,runtime);const params=new URLSearchParams({projectId:input.projectId,canvasId:input.canvasId,kind:input.kind,query:input.query??'',offset:String(input.offset??0),limit:'25'});
    const data=(await runtime.client.requestAgentControl(runtime.instance,'/api/agent-control/v1/assets?'+params.toString(),{accessToken:runtime.accessToken})).data;this.currentSession(config,runtime);return canvasAssetsView(input,data);
  }
  assets(input:CanvasAssetsQuery):Promise<CanvasAssets>{return this.serial(async()=>{const request=canvasAssetsQuery.parse(input),{config,runtime}=await this.binding();return this.readAssets(request,config,runtime);});}
  private async readReferences(projectId:string,keys:CanvasReferenceKey[],config:CanvasConfig,runtime:CanvasWorkflowRuntime):Promise<CanvasAsset[]>{
    canvasReferenceKeys.parse(keys);this.referenceScope(runtime);const refs:CanvasAsset[]=[];
    for(const key of keys){this.currentSession(config,runtime);const data=(await runtime.client.requestAgentControl(runtime.instance,'/api/agent-control/v1/assets/'+encodeURIComponent(key.assetId)+'?'+new URLSearchParams({projectId}).toString(),{accessToken:runtime.accessToken})).data;this.currentSession(config,runtime);const asset=canvasAssetView(projectId,data),current=canvasAssetKey(asset);if(current.assetId!==key.assetId||current.contentHash!==key.contentHash||current.contentRevision!==key.contentRevision)throw new CanvasError('WORKFLOW_REFERENCE_CHANGED','参考素材内容或修订号已变化，请重新选择并预览。');refs.push(asset);}
    return refs;
  }
  private async referencesCurrent(record:Stored,config:CanvasConfig,runtime:CanvasWorkflowRuntime):Promise<void>{
    const refs=record.view.references;if(!refs?.length)return;const current=await this.readReferences(record.view.projectId,refs.map(canvasAssetKey),config,runtime);if(nativeAttachmentDigest(refs)!==nativeAttachmentDigest(current))throw new CanvasError('WORKFLOW_REFERENCE_CHANGED','参考素材的类型、大小或媒体信息已变化，请重新预览。');this.matches(record,config,runtime);
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
  private stage(plan: NativeCreativePlan, config: CanvasConfig, runtime: CanvasWorkflowRuntime,references?:CanvasAsset[]): CanvasWorkflowView {
    const view = nativePlanView(plan);if(references?.length)view.references=references;
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
  private async readWorkspaces(config:CanvasConfig,runtime:CanvasWorkflowRuntime):Promise<CanvasWorkspaces>{
    this.currentSession(config,runtime);
    const data = (await runtime.client.requestAgentControl(runtime.instance, '/api/agent-control/v1/workspaces', { accessToken: runtime.accessToken })).data;
    this.currentSession(config,runtime);
    const parsed = z.object({ canvases: z.array(z.object({ id: canvasEntity, projectId: canvasEntity, name: z.string().max(240), revision: z.number().int().positive() })).max(500),total:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),truncated:z.boolean().optional() }).parse(data);
    return canvasWorkspacesSchema.parse(parsed);
  }
  workspaces(): Promise<CanvasWorkspaces> { return this.serial(async () => {const {config,runtime}=await this.binding();return this.readWorkspaces(config,runtime);}); }
  activeTargets():Promise<CanvasActiveTargets>{return this.serial(async()=>{
    const {config,runtime}=await this.binding();this.currentSession(config,runtime);
    const context=await readCanvasActiveContext(runtime);this.currentSession(config,runtime);
    const workspaces=await this.readWorkspaces(config,runtime);this.currentSession(config,runtime);
    // Directory reads cannot turn an old window reply into current metadata.
    return canvasActiveTargetsSchema.parse({context:parseCanvasActiveContext(context,runtime.instance.instanceId),workspaces});
  });}
  preview(input: CanvasWorkflowInput): Promise<CanvasWorkflowView> { return this.serial(async () => {
    const request = canvasWorkflowInput.parse(input); this.available();
    const { config, runtime } = await this.binding();
    const keys=request.references??[];
    if(keys.length)await this.readAssets({projectId:request.projectId,canvasId:request.canvasId,kind:request.kind==='audio'?'audio':'image'},config,runtime);
    const references=keys.length?await this.readReferences(request.projectId,keys,config,runtime):[];
    if(references.some(ref=>['image','edit-image'].includes(request.kind)?ref.kind!=='image':request.kind==='audio'?ref.kind!=='audio':false))throw new CanvasError('WORKFLOW_REFERENCE_KIND_INVALID','参考素材类型与创作入口不一致，请重新选择。');
    const choices=Object.entries(request.modelChoices??{}).filter(([,choice])=>choice!==undefined) as [CanvasModelKind,{provider:string;model:string}][];
    for(const [kind,choice]of choices){const page=await this.readModels({projectId:request.projectId,canvasId:request.canvasId,kind,query:choice.model.slice(0,200)},config,runtime);if(!page.items.some(item=>item.provider===choice.provider&&item.model===choice.model&&item.executable))throw new CanvasError('WORKFLOW_MODEL_UNAVAILABLE','所选模型尚未在画布核验为可执行，请检查画布配置后重新选取。');}
    const modelFields=Object.fromEntries(choices.flatMap(([kind,choice])=>[[kind+'Provider',choice.provider],[kind+'Model',choice.model]]));
    const plan = nativeCreativePlanSchema.parse((await runtime.client.requestAgentControl(runtime.instance, '/api/agent-control/v1/creative-plans', { accessToken: runtime.accessToken, method: 'POST', body: { projectId: request.projectId, canvasId: request.canvasId, input: { kind: request.kind, prompt: request.prompt, candidates: request.candidates??1, profile: request.profile??'economy',...(request.ratio===undefined?{}:{ratio:request.ratio}),...(request.duration===undefined?{}:{duration:request.duration}),...(keys.length?{assetIds:keys.map(key=>key.assetId)}:{}),...modelFields } } })).data);
    this.currentSession(config,runtime);
    if (plan.projectId !== request.projectId || plan.canvasId !== request.canvasId || plan.kind !== request.kind || plan.brief.goal !== request.prompt || plan.action !== `create.${request.kind}` || Date.parse(plan.expiresAt) <= Date.now() || Date.parse(plan.expiresAt) > Date.now() + 31 * 60 * 1000) throw new CanvasError('WORKFLOW_PLAN_MISMATCH', '画布返回的计划与本次目标不一致。');
    if(choices.some(([kind,choice])=>plan.visibleAssumptions.models[kind]?.provider!==choice.provider||plan.visibleAssumptions.models[kind]?.model!==choice.model)||request.candidates!==undefined&&plan.candidateCount!==request.candidates||request.ratio!==undefined&&plan.visibleAssumptions.ratio!==request.ratio||request.duration!==undefined&&plan.visibleAssumptions.durationSec!==request.duration||request.profile!==undefined&&plan.brief.profile!==request.profile)throw new CanvasError('WORKFLOW_MODEL_MISMATCH','画布返回的模型或输出参数与选择不一致，请重新核对；本方案未进入审批。');
    if(references.length){const receipt=plan.modelDecisionReceipt;if(!receipt||receipt.schema!=='t8-model-decision-receipt-v1'||receipt.providerCalls!==0||receipt.canvasWrites!==0||receipt.attachmentEvidenceDigest!==nativeAttachmentDigest(references)||JSON.stringify(plan.brief.reuseAssetIds)!==JSON.stringify(keys.map(key=>key.assetId)))throw new CanvasError('WORKFLOW_REFERENCE_MISMATCH','画布返回的素材证据或顺序与选择不一致，本方案未进入审批。');if(!receipt.decisions?.length||receipt.decisions.some(item=>item.required&&item.status!=='ready'))throw new CanvasError('WORKFLOW_MODEL_UNAVAILABLE','参考理解或生成模型尚未在画布就绪，请选择模型或配置画布后重新预览。');const current=await this.readReferences(request.projectId,keys,config,runtime);if(nativeAttachmentDigest(current)!==nativeAttachmentDigest(references))throw new CanvasError('WORKFLOW_REFERENCE_CHANGED','素材在规划时发生变化，请重新预览。');}
    return this.stage(plan, config, runtime,references);
  }); }
  approve(id: string, confirmation: boolean): Promise<CanvasWorkflowView> { return this.serial(async () => {
    const record = this.required(id);
    if (!confirmation || record.view.phase !== 'preview' || !record.view.ready) throw new CanvasError('WORKFLOW_REVIEW_REQUIRED', '请先核对方案并明确确认，再送往画布审批。');
    const { config, runtime } = await this.binding(); this.matches(record, config, runtime);
    await this.referencesCurrent(record,config,runtime);
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
    await this.referencesCurrent(record,config,runtime);
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
