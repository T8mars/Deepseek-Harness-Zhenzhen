import { z } from 'zod';
export declare const canvasSetupDiscoverySchema: z.ZodObject<{
    candidates: z.ZodArray<z.ZodObject<{
        root: z.ZodString;
        digest: z.ZodString;
        cliVersion: z.ZodString;
        skillVersion: z.ZodString;
        nodeSchemaDigest: z.ZodString;
        providerCatalogDigest: z.ZodString;
        source: z.ZodEnum<{
            "running-desktop": "running-desktop";
            managed: "managed";
        }>;
    }, z.core.$strict>>;
    issues: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const canvasConnectionCheckSchema: z.ZodObject<{
    binding: z.ZodNullable<z.ZodObject<{
        root: z.ZodString;
        digest: z.ZodString;
        instance: z.ZodString;
    }, z.core.$strict>>;
    state: z.ZodEnum<{
        error: "error";
        "not-configured": "not-configured";
        "not-running": "not-running";
        "choose-instance": "choose-instance";
        "needs-review": "needs-review";
        incompatible: "incompatible";
        ready: "ready";
    }>;
    code: z.ZodString;
    message: z.ZodString;
    instances: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        version: z.ZodString;
        port: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type CanvasSetupDiscovery = z.infer<typeof canvasSetupDiscoverySchema>;
export type CanvasConnectionCheck = z.infer<typeof canvasConnectionCheckSchema>;
