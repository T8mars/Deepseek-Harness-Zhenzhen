import { z } from 'zod';

export const GATEWAY_CHECK_POLICY = 'flash-32-v1' as const;
export const GATEWAY_CHECK_MODEL = 'deepseek/deepseek-v4.1-flash' as const;
export const GATEWAY_CHECK_PROMPT = 'DSH-zhen connectivity check. Reply only OK.' as const;
export const gatewayCheckCodeSchema = z.enum(['', 'AUTH', 'MISSING_CREDENTIAL', 'RATE_LIMIT', 'TIMEOUT', 'SERVER', 'PI_AI_ERROR', 'NO_ADAPTER', 'CANCELLED', 'INCOMPLETE', 'RESPONSE_LIMIT', 'UNAVAILABLE']);
export const gatewayCheckReceiptSchema = z.object({
  id: z.uuid(), policy: z.literal(GATEWAY_CHECK_POLICY), provider: z.literal('seedance'), model: z.literal(GATEWAY_CHECK_MODEL),
  maxTokens: z.literal(32), createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(), finishedAt: z.string(),
  state: z.enum(['preview', 'running', 'passed', 'incomplete', 'failed', 'cancelled', 'expired', 'untracked']),
  code: gatewayCheckCodeSchema, textDeltas: z.number().int().min(0).max(2048),
  inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable(),
}).strict();
export const gatewayCheckPreviewSchema = z.object({ receipt: gatewayCheckReceiptSchema, prompt: z.literal(GATEWAY_CHECK_PROMPT) }).strict();
export type GatewayCheckReceipt = z.infer<typeof gatewayCheckReceiptSchema>;
export type GatewayCheckPreview = z.infer<typeof gatewayCheckPreviewSchema>;
