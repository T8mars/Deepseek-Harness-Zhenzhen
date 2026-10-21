import { z } from 'zod';
export declare const gatewayMediaTicketSchema: z.ZodObject<{
    id: z.ZodUUID;
    taskRecordId: z.ZodUUID;
    ordinal: z.ZodNumber;
    sourceHost: z.ZodString;
    expiresAt: z.ZodISODateTime;
}, z.core.$strict>;
export declare const gatewayMediaReceiptSchema: z.ZodObject<{
    id: z.ZodUUID;
    taskRecordId: z.ZodUUID;
    ordinal: z.ZodNumber;
    path: z.ZodString;
    bytes: z.ZodNumber;
    sha256: z.ZodString;
    mime: z.ZodString;
    savedAt: z.ZodISODateTime;
    recorded: z.ZodBoolean;
}, z.core.$strict>;
export type GatewayMediaTicket = z.infer<typeof gatewayMediaTicketSchema>;
export type GatewayMediaReceipt = z.infer<typeof gatewayMediaReceiptSchema>;
