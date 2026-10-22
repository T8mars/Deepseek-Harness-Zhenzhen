import { z } from 'zod';

export const gatewayTaskProtocolSchema = z.enum(['video', 'legacy-video', 'image', 'audio', 'three-d', 'music', 'midjourney', 'minimax-v2']);
export const gatewayTaskIdSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).refine(value => !/^sk[-_]/i.test(value), '请输入任务编号，不要输入 API 令牌。');
export const gatewayTaskSpecSchema = z.object({ protocol: gatewayTaskProtocolSchema, taskId: gatewayTaskIdSchema }).strict();
export const gatewayTaskCodeSchema = z.enum(['', 'AUTH', 'NOT_FOUND', 'MISSING_CREDENTIAL', 'RATE_LIMIT', 'SERVER', 'NETWORK', 'RESPONSE', 'CANCELLED', 'CONFIG_CHANGED', 'UNAVAILABLE', 'UNRECOGNIZED_STATUS', 'BUSY']);
// Wallets may use a custom display unit, including a one-character label.
// This is a plain display label, never an ISO conversion or executable string.
export const gatewayCurrencySchema = z.string().min(1).max(32).regex(/^[\p{L}\p{N} €$£¥￥₩₽₹₿]+$/u).refine(value => value.trim() === value);
export const gatewayTaskObservationSchema = z.object({
  status: z.enum(['unknown', 'queued', 'running', 'succeeded', 'failed', 'cancelled']),
  progress: z.number().finite().min(0).max(100).nullable(), resultCount: z.number().int().min(0).max(100),
  usage: z.object({ amount: z.number().finite().nonnegative(), currency: gatewayCurrencySchema }).strict().nullable(),
}).strict();
export const gatewayTaskRecordSchema = gatewayTaskObservationSchema.extend({
  id: z.uuid(), protocol: gatewayTaskProtocolSchema, taskId: gatewayTaskIdSchema,
  createdAt: z.iso.datetime(), checkedAt: z.string().max(40), nextCheckAt: z.string().max(40),
  tracking: z.boolean(), querying: z.boolean(), code: gatewayTaskCodeSchema, failures: z.number().int().min(0).max(10),
}).strict();
export type GatewayTaskProtocol = z.infer<typeof gatewayTaskProtocolSchema>;
export type GatewayTaskSpec = z.infer<typeof gatewayTaskSpecSchema>;
export type GatewayTaskCode = z.infer<typeof gatewayTaskCodeSchema>;
export type GatewayTaskObservation = z.infer<typeof gatewayTaskObservationSchema>;
export type GatewayTaskRecord = z.infer<typeof gatewayTaskRecordSchema>;
