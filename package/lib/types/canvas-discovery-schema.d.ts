import { z } from 'zod';
export declare const canvasInstallCandidateSchema: z.ZodObject<{
    root: z.ZodString;
    digest: z.ZodString;
    cliVersion: z.ZodString;
    skillVersion: z.ZodString;
    nodeSchemaDigest: z.ZodString;
    providerCatalogDigest: z.ZodString;
}, z.core.$strict>;
export declare const canvasDiscoverySchema: z.ZodObject<{
    candidates: z.ZodArray<z.ZodObject<{
        root: z.ZodString;
        digest: z.ZodString;
        cliVersion: z.ZodString;
        skillVersion: z.ZodString;
        nodeSchemaDigest: z.ZodString;
        providerCatalogDigest: z.ZodString;
    }, z.core.$strict>>;
    issues: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type CanvasInstallCandidate = z.infer<typeof canvasInstallCandidateSchema>;
export type CanvasDiscovery = z.infer<typeof canvasDiscoverySchema>;
