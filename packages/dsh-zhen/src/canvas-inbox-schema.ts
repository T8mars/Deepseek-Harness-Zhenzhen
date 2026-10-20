import { z } from 'zod';
import { canvasWorkflowSchema } from './canvas-workflow-schema.ts';
export const canvasCandidateSchema = z.object({ id: z.uuid(), sourceSessionId: z.string().min(1).max(256), sourceCallId: z.string().min(1).max(256), receivedAt: z.iso.datetime(), tool: z.string().max(128), preview: canvasWorkflowSchema }).strict();
export const canvasCandidatesSchema = z.array(canvasCandidateSchema).max(16);
export type CanvasCandidateView = z.infer<typeof canvasCandidateSchema>;
