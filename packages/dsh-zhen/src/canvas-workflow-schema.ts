import { z } from 'zod';
import { canvasEntity } from './canvas-contract.ts';
export const canvasWorkflowInput = z.object({ projectId: canvasEntity, canvasId: canvasEntity, kind: z.enum(['image', 'video', 'script', 'story']), prompt: z.string().trim().min(1).max(12000) }).strict();
export type CanvasWorkflowInput = z.infer<typeof canvasWorkflowInput>;
export const canvasWorkspacesSchema = z.object({ canvases: z.array(z.object({ id: canvasEntity, projectId: canvasEntity, name: z.string().max(240), revision: z.number().int().positive() }).strict()).max(500) }).strict();
export type CanvasWorkspaces = z.infer<typeof canvasWorkspacesSchema>;
export const canvasWorkflowSchema = z.object({ id: z.uuid(), projectId: canvasEntity, canvasId: canvasEntity, planId: canvasEntity, planDigest: z.string().regex(/^[a-f0-9]{64}$/), action: z.string().max(100), goal: z.string().min(1).max(65536), canvasRevision: z.number().int().positive(), ready: z.boolean(), candidates: z.number().int().min(0).max(8), operationCount: z.number().int().min(0).max(10000), models: z.array(z.string().max(500)).max(16), questions: z.array(z.string().max(2000)).max(32), expiresAt: z.iso.datetime(), phase: z.enum(['preview', 'requesting', 'pending', 'applying', 'applied', 'denied', 'unknown', 'expired']), approvalRequestId: z.string().max(256), patchId: z.string().max(256), revision: z.number().int().positive().nullable() }).strict();
export type CanvasWorkflowView = z.infer<typeof canvasWorkflowSchema>;
