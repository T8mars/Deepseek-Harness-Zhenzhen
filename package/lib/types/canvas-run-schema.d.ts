import { z } from 'zod';
export declare const canvasRunSelection: z.ZodObject<{
    projectId: z.ZodString;
    canvasId: z.ZodString;
    canvasRevision: z.ZodNumber;
    nodeIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type CanvasRunSelection = z.infer<typeof canvasRunSelection>;
export declare const canvasRunNodesSchema: z.ZodObject<{
    projectId: z.ZodString;
    canvasId: z.ZodString;
    revision: z.ZodNumber;
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
        label: z.ZodString;
        executable: z.ZodBoolean;
    }, z.core.$strict>>;
    nextOffset: z.ZodNumber;
    hasMore: z.ZodBoolean;
}, z.core.$strict>;
export type CanvasRunNodes = z.infer<typeof canvasRunNodesSchema>;
export declare const canvasRunDeclaration: z.ZodObject<{
    provider: z.ZodString;
    model: z.ZodString;
    nodeIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const canvasRunIntentSchema: z.ZodObject<{
    id: z.ZodString;
    operationId: z.ZodString;
    projectId: z.ZodString;
    canvasId: z.ZodString;
    canvasRevision: z.ZodNumber;
    nodeIds: z.ZodArray<z.ZodString>;
    requestedBy: z.ZodString;
    status: z.ZodString;
    runId: z.ZodNullable<z.ZodString>;
    queueRevision: z.ZodNumber;
}, z.core.$strict>;
export type CanvasRunIntent = z.infer<typeof canvasRunIntentSchema>;
export declare const canvasRunViewSchema: z.ZodObject<{
    quoteId: z.ZodUUID;
    planDigest: z.ZodString;
    projectId: z.ZodString;
    canvasId: z.ZodString;
    canvasRevision: z.ZodNumber;
    requestedNodeIds: z.ZodArray<z.ZodString>;
    authorizedNodeIds: z.ZodArray<z.ZodString>;
    declarations: z.ZodArray<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
        nodeIds: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    mode: z.ZodString;
    expiresAt: z.ZodISODateTime;
    priceKnown: z.ZodLiteral<false>;
    estimatedCost: z.ZodNull;
    phase: z.ZodEnum<{
        denied: "denied";
        unknown: "unknown";
        preview: "preview";
        requesting: "requesting";
        pending: "pending";
        expired: "expired";
        submitting: "submitting";
        tracking: "tracking";
    }>;
    submissionAttempted: z.ZodBoolean;
    approvalRequestId: z.ZodString;
    intent: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        operationId: z.ZodString;
        projectId: z.ZodString;
        canvasId: z.ZodString;
        canvasRevision: z.ZodNumber;
        nodeIds: z.ZodArray<z.ZodString>;
        requestedBy: z.ZodString;
        status: z.ZodString;
        runId: z.ZodNullable<z.ZodString>;
        queueRevision: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type CanvasRunView = z.infer<typeof canvasRunViewSchema>;
