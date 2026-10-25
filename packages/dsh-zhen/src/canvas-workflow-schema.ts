import { z } from 'zod';
import { canvasEntity } from './canvas-contract.ts';
import {canvasReferenceKeys,canvasAssetSchema} from './canvas-reference-schema.ts';
export const canvasModelKind = z.enum(['llm', 'image', 'video', 'audio']);
export type CanvasModelKind = z.infer<typeof canvasModelKind>;
export const canvasModelChoice = z.object({ provider: z.string().min(1).max(160), model: z.string().min(1).max(240) }).strict();
export const canvasModelChoices = z.object({ llm: canvasModelChoice.optional(), image: canvasModelChoice.optional(), video: canvasModelChoice.optional(), audio: canvasModelChoice.optional() }).strict();
export type CanvasModelChoices = z.infer<typeof canvasModelChoices>;
export const canvasWorkflowInput = z.object({ projectId: canvasEntity, canvasId: canvasEntity, kind: z.enum(['image', 'edit-image', 'video', 'edit-video', 'audio', 'script', 'story']), prompt: z.string().trim().min(1).max(12000),
  references:canvasReferenceKeys.optional(), modelChoices: canvasModelChoices.optional(), profile: z.enum(['economy','balanced','quality']).optional(), candidates: z.number().int().min(1).max(8).optional(),
  ratio: z.enum(['1:1','16:9','9:16','4:3','3:4']).optional(), duration: z.number().int().min(1).max(86400).optional(),
}).strict().superRefine((value,ctx)=>{
  if(['edit-image','edit-video'].includes(value.kind)&&!value.references?.length)ctx.addIssue({code:'custom',message:'编辑方案需要明确选择参考素材。'});
  if(value.references?.length&&!['image','edit-image','edit-video','audio'].includes(value.kind))ctx.addIssue({code:'custom',message:'此创作入口尚未绑定参考素材；视频参考请使用视频编辑/参考。'});
  const primary=value.kind==='script'?'llm':value.kind==='edit-image'?'image':value.kind==='edit-video'?'video':value.kind;
  const supported=value.kind==='story'?['llm','image','video','audio']:primary==='llm'?['llm']:['llm',primary];
  if(Object.entries(value.modelChoices??{}).some(([kind,choice])=>choice!==undefined&&!supported.includes(kind)))ctx.addIssue({code:'custom',message:'模型类型与本次创作不一致。'});
  if(value.ratio!==undefined&&!['image','edit-image','video','edit-video','story'].includes(value.kind)||value.duration!==undefined&&!['video','edit-video','story'].includes(value.kind))ctx.addIssue({code:'custom',message:'输出参数与本次创作不一致。'});
});
export type CanvasWorkflowInput = z.infer<typeof canvasWorkflowInput>;
export const canvasModelsQuery = z.object({projectId:canvasEntity,canvasId:canvasEntity,kind:canvasModelKind,query:z.string().trim().max(200).optional()}).strict();
export type CanvasModelsQuery = z.infer<typeof canvasModelsQuery>;
export const canvasModelsSchema = z.object({projectId:canvasEntity,canvasId:canvasEntity,kind:canvasModelKind,query:z.string().max(200),total:z.number().int().min(0).max(100000),truncated:z.boolean(),items:z.array(z.object({id:z.string().min(1).max(512),kind:canvasModelKind,provider:z.string().min(1).max(160),model:z.string().min(1).max(240),executable:z.boolean(),credentialReady:z.boolean(),requiresRuntimeCheck:z.boolean()}).strict()).max(500)}).strict();
export type CanvasModels = z.infer<typeof canvasModelsSchema>;
export const canvasWorkspacesSchema = z.object({ canvases: z.array(z.object({ id: canvasEntity, projectId: canvasEntity, name: z.string().max(240), revision: z.number().int().positive(), connectionId:z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict()).max(500), total:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(), truncated:z.boolean().optional() }).strict().superRefine((value,context)=>{
  const keys=value.canvases.map(item=>JSON.stringify([item.projectId,item.id]));
  if(new Set(keys).size!==keys.length||value.total!==undefined&&value.total<value.canvases.length)context.addIssue({code:'custom',message:'Canvas workspace identities or count are inconsistent.'});
});
export type CanvasWorkspaces = z.infer<typeof canvasWorkspacesSchema>;
/** Scoped directory methods must carry one consistent identity; legacy methods omit it. */
export const canvasTargetWorkspacesSchema=canvasWorkspacesSchema.refine(value=>value.canvases.every(canvas=>canvas.connectionId!==undefined)&&new Set(value.canvases.map(canvas=>canvas.connectionId)).size<=1,'Target directory connection identity is missing or inconsistent.');
export const canvasWorkflowSchema = z.object({ id: z.uuid(), projectId: canvasEntity, canvasId: canvasEntity, planId: canvasEntity, planDigest: z.string().regex(/^[a-f0-9]{64}$/), action: z.string().max(100), goal: z.string().min(1).max(65536), requestedGoal: z.string().min(1).max(12000).optional(), canvasRevision: z.number().int().positive(), ready: z.boolean(), candidates: z.number().int().min(0).max(8), operationCount: z.number().int().min(0).max(10000), models: z.array(z.string().max(500)).max(16), questions: z.array(z.string().max(2000)).max(32), expiresAt: z.iso.datetime(), phase: z.enum(['preview', 'requesting', 'pending', 'applying', 'applied', 'denied', 'unknown', 'expired']), approvalRequestId: z.string().max(256), patchId: z.string().max(256), revision: z.number().int().positive().nullable(), output:z.object({profile:z.string().max(40),ratio:z.string().max(40),durationSeconds:z.number().int().min(0).max(86400)}).strict().optional(),references:z.array(canvasAssetSchema).max(16).optional() }).strict();
export type CanvasWorkflowView = z.infer<typeof canvasWorkflowSchema>;
