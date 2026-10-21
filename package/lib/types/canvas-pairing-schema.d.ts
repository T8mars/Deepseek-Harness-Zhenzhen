import { z } from 'zod';
export declare const canvasReadScopes: readonly ["canvas:read", "run:read", "asset:read"];
export declare const canvasHandoffScopes: readonly ["asset:transfer", "browser:handoff"];
export declare const canvasPairingSchema: z.ZodObject<{
    state: z.ZodEnum<{
        denied: "denied";
        paired: "paired";
        pending: "pending";
        expired: "expired";
        none: "none";
    }>;
    userCode: z.ZodString;
    expiresAt: z.ZodString;
    scopes: z.ZodArray<z.ZodEnum<{
        "canvas:read": "canvas:read";
        "asset:read": "asset:read";
        "asset:transfer": "asset:transfer";
        "run:read": "run:read";
        "browser:handoff": "browser:handoff";
        "canvas:write": "canvas:write";
        "run:execute": "run:execute";
    }>>;
    message: z.ZodString;
}, z.core.$strict>;
export type CanvasPairingView = z.infer<typeof canvasPairingSchema>;
