import { z } from 'zod';
export const canvasReadScopes = ['canvas:read', 'run:read', 'asset:read'] as const;
export const canvasHandoffScopes = ['asset:transfer', 'browser:handoff'] as const;
export const canvasPairingSchema = z.object({
  state: z.enum(['none', 'pending', 'paired', 'expired', 'denied']),
  userCode: z.string().regex(/^(?:|[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8})$/),
  expiresAt: z.string().max(64),
  scopes: z.array(z.enum(['canvas:read', 'run:read', 'asset:read', 'asset:transfer', 'browser:handoff', 'canvas:write', 'run:execute'])).max(7),
  message: z.string().max(300),
}).strict();
export type CanvasPairingView = z.infer<typeof canvasPairingSchema>;
