import { z } from 'zod';
import { canvasEntity } from './canvas-contract.ts';
export const canvasModelKind = z.enum(['llm', 'image', 'video', 'audio']);
export type CanvasModelKind = z.infer<typeof canvasModelKind>;
export const canvasModelChoice = z.object({ provider: z.string().min(1).max(160), model: z.string().min(1).max(240) }).strict();
export const canvasModelChoices = z.object({ llm: canvasModelChoice.optional(), image: canvasModelChoice.optional(), video: canvasModelChoice.optional(), audio: canvasModelChoice.optional() }).strict();
export type CanvasModelChoices = z.infer<typeof canvasModelChoices>;
export const canvasWorkflowInput = z.object({ projectId: canvasEntity, canvasId: canvasEntity, kind: z.enum(['image', 'video', 'audio', 'script', 'story']), prompt: z.string().trim().min(1).max(12000),
  modelChoices: canvasModelChoices.optional(), profile: z.enum(['economy','balanced','quality']).optional(), candidates: z.number().int().min(1).max(8).optional(),
  ratio: z.enum(['1:1','16:9','9:16','4:3','3:4']).optional(), duration: z.number().int().min(1).max(86400).optional(),
}).strict().superRefine((value,ctx)=>{
  const supported=value.kind==='story'?['llm','image','video','audio']:[value.kind==='script'?'llm':value.kind];
  if(Object.entries(value.modelChoices??{}).some(([kind,choice])=>choice!==undefined&&!supported.includes(kind)))ctx.addIssue({code:'custom',message:'模型类型与本次创作不一致。'});
  if(value.ratio!==undefined&&!['image','video','story'].includes(value.kind)||value.duration!==undefined&&!['video','story'].includes(value.kind))ctx.addIssue({code:'custom',message:'输出参数与本次创作不一致。'});
});
export type CanvasWorkflowInput = z.infer<typeof canvasWorkflowInput>;
export const canvasModelsQuery = z.object({projectId:canvasEntity,canvasId:canvasEntity,kind:canvasModelKind,query:z.string().trim().max(200).optional()}).strict();
export type CanvasModelsQuery = z.infer<typeof canvasModelsQuery>;
export const canvasModelsSchema = z.object({projectId:canvasEntity,canvasId:canvasEntity,kind:canvasModelKind,query:z.string().max(200),total:z.number().int().min(0).max(100000),truncated:z.boolean(),items:z.array(z.object({id:z.string().min(1).max(512),kind:canvasModelKind,provider:z.string().min(1).max(160),model:z.string().min(1).max(240),executable:z.boolean(),credentialReady:z.boolean(),requiresRuntimeCheck:z.boolean()}).strict()).max(500)}).strict();
export type CanvasModels = z.infer<typeof canvasModelsSchema>;
export const canvasWorkspacesSchema = z.object({ canvases: z.array(z.object({ id: canvasEntity, projectId: canvasEntity, name: z.string().max(240), revision: z.number().int().positive() }).strict()).max(500) }).strict();
export type CanvasWorkspaces = z.infer<typeof canvasWorkspacesSchema>;
export const canvasWorkflowSchema = z.object({ id: z.uuid(), projectId: canvasEntity, canvasId: canvasEntity, planId: canvasEntity, planDigest: z.string().regex(/^[a-f0-9]{64}$/), action: z.string().max(100), goal: z.string().min(1).max(65536), canvasRevision: z.number().int().positive(), ready: z.boolean(), candidates: z.number().int().min(0).max(8), operationCount: z.number().int().min(0).max(10000), models: z.array(z.string().max(500)).max(16), questions: z.array(z.string().max(2000)).max(32), expiresAt: z.iso.datetime(), phase: z.enum(['preview', 'requesting', 'pending', 'applying', 'applied', 'denied', 'unknown', 'expired']), approvalRequestId: z.string().max(256), patchId: z.string().max(256), revision: z.number().int().positive().nullable(), output:z.object({profile:z.string().max(40),ratio:z.string().max(40),durationSeconds:z.number().int().min(0).max(86400)}).strict().optional() }).strict();
export type CanvasWorkflowView = z.infer<typeof canvasWorkflowSchema>;
