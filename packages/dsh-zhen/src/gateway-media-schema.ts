import { z } from 'zod';
export const gatewayMediaTicketSchema = z.object({ id: z.uuid(), taskRecordId: z.uuid(), ordinal: z.number().int().min(1).max(100), sourceHost: z.string().min(1).max(253), expiresAt: z.iso.datetime() }).strict();
export const gatewayMediaReceiptSchema = z.object({ id: z.uuid(), taskRecordId: z.uuid(), ordinal: z.number().int().min(1).max(100), path: z.string().min(1).max(4096), bytes: z.number().int().min(1).max(2 * 1024 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/), mime: z.string().max(100), savedAt: z.iso.datetime(), recorded: z.boolean() }).strict();
export type GatewayMediaTicket = z.infer<typeof gatewayMediaTicketSchema>;
export type GatewayMediaReceipt = z.infer<typeof gatewayMediaReceiptSchema>;
