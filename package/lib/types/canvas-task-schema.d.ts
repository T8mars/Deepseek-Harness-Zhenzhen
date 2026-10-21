import { z } from 'zod';
export declare const canvasTaskScope: z.ZodObject<{
    projectId: z.ZodString;
    canvasId: z.ZodString;
}, z.core.$strict>;
export type CanvasTaskScope = z.infer<typeof canvasTaskScope>;
export declare const canvasTaskReference: z.ZodObject<{
    projectId: z.ZodString;
    canvasId: z.ZodString;
    id: z.ZodString;
}, z.core.$strict>;
export type CanvasTaskReference = z.infer<typeof canvasTaskReference>;
export declare const canvasTaskStatus: z.ZodEnum<{
    unknown: "unknown";
    pending: "pending";
    accepted: "accepted";
    dispatching: "dispatching";
    running: "running";
    completed: "completed";
    failed: "failed";
    cancelled: "cancelled";
}>;
export declare const canvasTaskSummary: z.ZodObject<{
    projectId: z.ZodString;
    canvasId: z.ZodString;
    id: z.ZodString;
    canvasRevision: z.ZodNumber;
    nodeCount: z.ZodNumber;
    provider: z.ZodNullable<z.ZodString>;
    model: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<{
        unknown: "unknown";
        pending: "pending";
        accepted: "accepted";
        dispatching: "dispatching";
        running: "running";
        completed: "completed";
        failed: "failed";
        cancelled: "cancelled";
    }>;
    runId: z.ZodNullable<z.ZodString>;
    queueRevision: z.ZodNumber;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
}, z.core.$strict>;
export type CanvasTaskSummary = z.infer<typeof canvasTaskSummary>;
export declare const canvasTaskListSchema: z.ZodObject<{
    projectId: z.ZodString;
    canvasId: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        projectId: z.ZodString;
        canvasId: z.ZodString;
        id: z.ZodString;
        canvasRevision: z.ZodNumber;
        nodeCount: z.ZodNumber;
        provider: z.ZodNullable<z.ZodString>;
        model: z.ZodNullable<z.ZodString>;
        status: z.ZodEnum<{
            unknown: "unknown";
            pending: "pending";
            accepted: "accepted";
            dispatching: "dispatching";
            running: "running";
            completed: "completed";
            failed: "failed";
            cancelled: "cancelled";
        }>;
        runId: z.ZodNullable<z.ZodString>;
        queueRevision: z.ZodNumber;
        createdAt: z.ZodNumber;
        updatedAt: z.ZodNumber;
    }, z.core.$strict>>;
    limit: z.ZodLiteral<100>;
    atLimit: z.ZodBoolean;
}, z.core.$strict>;
export type CanvasTaskList = z.infer<typeof canvasTaskListSchema>;
export declare const canvasEvidenceReason: z.ZodEnum<{
    "run-incomplete": "run-incomplete";
    "run-missing": "run-missing";
    "scope-mismatch": "scope-mismatch";
    "node-incomplete": "node-incomplete";
    "attempt-incomplete": "attempt-incomplete";
    "asset-missing": "asset-missing";
    "asset-unverified": "asset-unverified";
    "native-unverified": "native-unverified";
    "inconsistent-evidence": "inconsistent-evidence";
}>;
export declare const canvasTaskDetailSchema: z.ZodObject<{
    projectId: z.ZodString;
    canvasId: z.ZodString;
    id: z.ZodString;
    canvasRevision: z.ZodNumber;
    nodeCount: z.ZodNumber;
    provider: z.ZodNullable<z.ZodString>;
    model: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<{
        unknown: "unknown";
        pending: "pending";
        accepted: "accepted";
        dispatching: "dispatching";
        running: "running";
        completed: "completed";
        failed: "failed";
        cancelled: "cancelled";
    }>;
    runId: z.ZodNullable<z.ZodString>;
    queueRevision: z.ZodNumber;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
    evidence: z.ZodObject<{
        verdict: z.ZodEnum<{
            "not-completed": "not-completed";
            unverified: "unverified";
            verified: "verified";
        }>;
        runPresent: z.ZodBoolean;
        nodeRecords: z.ZodNumber;
        successfulNodes: z.ZodNumber;
        successfulAttempts: z.ZodNumber;
        assetRecords: z.ZodNumber;
        storedAssets: z.ZodNumber;
        hashVerifiedAssets: z.ZodNumber;
        magicVerifiedAssets: z.ZodNumber;
        associatedAssets: z.ZodNumber;
        reasons: z.ZodArray<z.ZodEnum<{
            "run-incomplete": "run-incomplete";
            "run-missing": "run-missing";
            "scope-mismatch": "scope-mismatch";
            "node-incomplete": "node-incomplete";
            "attempt-incomplete": "attempt-incomplete";
            "asset-missing": "asset-missing";
            "asset-unverified": "asset-unverified";
            "native-unverified": "native-unverified";
            "inconsistent-evidence": "inconsistent-evidence";
        }>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type CanvasTaskDetail = z.infer<typeof canvasTaskDetailSchema>;
