import { z } from 'zod';
export declare const canvasEntity: z.ZodString;
export declare const canvasInstance: z.ZodString;
export declare const canvasDirectOperation: z.ZodEnum<{
    plan: "plan";
    preview: "preview";
    inspect: "inspect";
    verify: "verify";
}>;
export declare const canvasPreviewScopes: z.ZodArray<z.ZodString>;
/** Bound JSON before crossing into the installed CLI; no executable carrier. */
export declare function boundedCanvasInput(value: unknown, highLevel?: boolean): boolean;
export declare const canvasPlanRequest: z.ZodObject<{
    tool: z.ZodString;
    version: z.ZodString;
    operation: z.ZodEnum<{
        plan: "plan";
        preview: "preview";
        inspect: "inspect";
        verify: "verify";
    }>;
    projectId: z.ZodString;
    canvasId: z.ZodString;
    clientRequestId: z.ZodOptional<z.ZodString>;
    input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strict>;
export type CanvasPlanRequest = z.infer<typeof canvasPlanRequest>;
export declare const canvasInspectionRequest: z.ZodObject<{
    tool: z.ZodEnum<{
        inspectCanvas: "inspectCanvas";
        inspectNodeSchema: "inspectNodeSchema";
        inspectRun: "inspectRun";
        searchAssets: "searchAssets";
        searchSubflows: "searchSubflows";
        validateCanvas: "validateCanvas";
        simulateExecutionPlan: "simulateExecutionPlan";
        estimateRun: "estimateRun";
    }>;
    projectId: z.ZodString;
    canvasId: z.ZodString;
    requestId: z.ZodOptional<z.ZodString>;
    input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strict>;
export type CanvasInspectionRequest = z.infer<typeof canvasInspectionRequest>;
export declare const canvasInspectionResultSchema: z.ZodObject<{
    schema: z.ZodLiteral<"t8-canvas-agent-tool-result-v1">;
    tool: z.ZodEnum<{
        inspectCanvas: "inspectCanvas";
        inspectNodeSchema: "inspectNodeSchema";
        inspectRun: "inspectRun";
        searchAssets: "searchAssets";
        searchSubflows: "searchSubflows";
        validateCanvas: "validateCanvas";
        simulateExecutionPlan: "simulateExecutionPlan";
        estimateRun: "estimateRun";
    }>;
    requestId: z.ZodString;
    projectId: z.ZodString;
    canvasId: z.ZodString;
    canvasRevision: z.ZodNumber;
    actorId: z.ZodString;
    role: z.ZodString;
    authority: z.ZodUnknown;
    nodeSchemaDigest: z.ZodString;
    readOnly: z.ZodLiteral<true>;
    truncated: z.ZodBoolean;
    data: z.ZodUnknown;
    digest: z.ZodString;
}, z.core.$strip>;
export declare const canvasToolCatalogSchema: z.ZodObject<{
    schema: z.ZodLiteral<"t8-versioned-creative-tool-catalog-v1">;
    protocol: z.ZodLiteral<"t8-versioned-creative-tool-v1">;
    capabilityManifestVersion: z.ZodString;
    capabilityManifestDigest: z.ZodString;
    capabilityGraphDigest: z.ZodString;
    tools: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
        capabilityId: z.ZodString;
        creatorLabel: z.ZodString;
        category: z.ZodString;
        requestSchema: z.ZodLiteral<"t8-versioned-creative-tool-request-v1">;
        resultSchema: z.ZodLiteral<"t8-versioned-creative-tool-result-v1">;
        defaultOperation: z.ZodEnum<{
            plan: "plan";
            preview: "preview";
            inspect: "inspect";
            verify: "verify";
        }>;
        directOperations: z.ZodArray<z.ZodEnum<{
            plan: "plan";
            preview: "preview";
            inspect: "inspect";
            verify: "verify";
        }>>;
        operations: z.ZodArray<z.ZodObject<{
            operation: z.ZodString;
            riskLevel: z.ZodEnum<{
                L0: "L0";
                L1: "L1";
                L2: "L2";
                L3: "L3";
            }>;
            approvalRequired: z.ZodBoolean;
            boundary: z.ZodString;
            requiredScopes: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type CanvasToolCatalog = z.infer<typeof canvasToolCatalogSchema>;
/** Projection only; internal handler/service bindings never leave the CLI. */
export declare function projectCanvasSurfaces(raw: unknown): CanvasToolCatalog;
export declare function sameCanvasCatalog(left: CanvasToolCatalog, right: CanvasToolCatalog): boolean;
export declare const canvasPlanResultSchema: z.ZodObject<{
    schema: z.ZodLiteral<"t8-versioned-creative-tool-result-v1">;
    tool: z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
        capabilityId: z.ZodString;
        operation: z.ZodEnum<{
            plan: "plan";
            preview: "preview";
            inspect: "inspect";
            verify: "verify";
        }>;
        requestAction: z.ZodString;
    }, z.core.$strip>;
    contract: z.ZodObject<{
        protocol: z.ZodLiteral<"t8-versioned-creative-tool-v1">;
        capabilityManifestDigest: z.ZodString;
        capabilityGraphDigest: z.ZodString;
        riskLevel: z.ZodLiteral<"L0">;
        approvalRequired: z.ZodLiteral<false>;
        requiredScopes: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    request: z.ZodObject<{
        clientRequestId: z.ZodNullable<z.ZodString>;
        projectId: z.ZodString;
        canvasId: z.ZodString;
    }, z.core.$strip>;
    readOnly: z.ZodLiteral<true>;
    directInternalAccess: z.ZodLiteral<false>;
    sideEffects: z.ZodObject<{
        canvasWrites: z.ZodLiteral<0>;
        providerCalls: z.ZodLiteral<0>;
        fileWrites: z.ZodLiteral<0>;
    }, z.core.$strip>;
    data: z.ZodUnknown;
}, z.core.$strip>;
