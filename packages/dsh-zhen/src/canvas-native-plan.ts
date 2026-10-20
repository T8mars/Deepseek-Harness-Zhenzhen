import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { canvasEntity } from './canvas-contract.ts';
import { canvasWorkflowSchema } from './canvas-workflow-schema.ts';
import type { CanvasWorkflowView } from './canvas-workflow-schema.ts';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
/** Native public creative-plan projection, including non-generation L1 actions. */
export const nativeCreativePlanSchema = z.object({ schema: z.literal('t8-creative-plan-v1'), planId: canvasEntity, planDigest: digest, projectId: canvasEntity, canvasId: canvasEntity, canvasRevision: z.number().int().positive(), action: z.string().min(1).max(100), kind: z.string().max(100), brief: z.object({ goal: z.string().max(65536).optional().default(''),profile:z.string().max(40).optional() }), ready: z.boolean(), candidateCount: z.number().int().min(0).max(8), questions: z.array(z.object({ question: z.string().max(2000) })).max(32), impact: z.object({ patchOperationCount: z.number().int().min(0).max(10000) }), visibleAssumptions: z.object({ models: z.record(z.string(), z.object({ provider: z.string().max(240), model: z.string().max(240) })),ratio:z.string().max(40).optional(),durationSec:z.number().int().min(0).max(86400).optional() }), patchId: canvasEntity.nullable(), expiresAt: z.iso.datetime() });
export type NativeCreativePlan = z.infer<typeof nativeCreativePlanSchema>;
export const nativePlanBindingSchema = z.object({ action: z.literal('creative.apply'), sessionId: z.uuid(), projectId: canvasEntity, canvasId: canvasEntity, planDigest: digest });
export type NativePlanBinding = z.infer<typeof nativePlanBindingSchema>;
export function nativePlanView(plan: NativeCreativePlan, id = randomUUID()): CanvasWorkflowView {
  return canvasWorkflowSchema.parse({ id, projectId: plan.projectId, canvasId: plan.canvasId, planId: plan.planId, planDigest: plan.planDigest, action: plan.action, goal: plan.brief.goal || `画布操作：${plan.action}`, canvasRevision: plan.canvasRevision, ready: plan.ready, candidates: plan.candidateCount, operationCount: plan.impact.patchOperationCount, models: Object.values(plan.visibleAssumptions.models).filter(item => item.model).map(item => `${item.provider} / ${item.model}`), questions: plan.questions.map(item => item.question), expiresAt: plan.expiresAt, phase: 'preview', approvalRequestId: '', patchId: plan.patchId ?? '', revision: null,...(plan.brief.profile!==undefined||plan.visibleAssumptions.ratio!==undefined||plan.visibleAssumptions.durationSec!==undefined?{output:{profile:plan.brief.profile??'',ratio:plan.visibleAssumptions.ratio??'',durationSeconds:plan.visibleAssumptions.durationSec??0}}:{}) });
}
