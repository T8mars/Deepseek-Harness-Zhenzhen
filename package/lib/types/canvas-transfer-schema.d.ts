import { z } from 'zod';
export declare const canvasTransferInput: z.ZodObject<{
    receiptId: z.ZodUUID;
    projectId: z.ZodString;
    canvasId: z.ZodString;
}, z.core.$strict>;
export type CanvasTransferInput = z.infer<typeof canvasTransferInput>;
export declare const transferFileSchema: z.ZodObject<{
    name: z.ZodString;
    size: z.ZodNumber;
    sha256: z.ZodString;
    mime: z.ZodString;
}, z.core.$strict>;
export declare const transferAssetSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    contentHash: z.ZodString;
    kind: z.ZodEnum<{
        image: "image";
        video: "video";
        audio: "audio";
        text: "text";
        model3d: "model3d";
    }>;
    mime: z.ZodString;
    size: z.ZodNumber;
}, z.core.$strict>;
export declare const transferPlacementSchema: z.ZodObject<{
    nodeId: z.ZodString;
    patchId: z.ZodString;
    previewDigest: z.ZodString;
    baseRevision: z.ZodNumber;
    position: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>;
export declare const canvasTransferViewSchema: z.ZodObject<{
    receiptId: z.ZodUUID;
    projectId: z.ZodString;
    canvasId: z.ZodString;
    id: z.ZodUUID;
    canvasRevision: z.ZodNumber;
    file: z.ZodObject<{
        name: z.ZodString;
        size: z.ZodNumber;
        sha256: z.ZodString;
        mime: z.ZodString;
    }, z.core.$strict>;
    maxImportBytes: z.ZodNumber;
    stage: z.ZodEnum<{
        import: "import";
        place: "place";
    }>;
    phase: z.ZodEnum<{
        denied: "denied";
        unknown: "unknown";
        preview: "preview";
        available: "available";
        requesting: "requesting";
        pending: "pending";
        applied: "applied";
        expired: "expired";
        submitting: "submitting";
        reverted: "reverted";
    }>;
    asset: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        projectId: z.ZodString;
        contentHash: z.ZodString;
        kind: z.ZodEnum<{
            image: "image";
            video: "video";
            audio: "audio";
            text: "text";
            model3d: "model3d";
        }>;
        mime: z.ZodString;
        size: z.ZodNumber;
    }, z.core.$strict>>;
    assetSource: z.ZodEnum<{
        none: "none";
        "import-response": "import-response";
        "catalog-match": "catalog-match";
    }>;
    placement: z.ZodNullable<z.ZodObject<{
        nodeId: z.ZodString;
        patchId: z.ZodString;
        previewDigest: z.ZodString;
        baseRevision: z.ZodNumber;
        position: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>>;
    approvalRequestId: z.ZodString;
    expiresAt: z.ZodISODateTime;
    submissionAttempted: z.ZodBoolean;
    appliedRevision: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export type CanvasTransferView = z.infer<typeof canvasTransferViewSchema>;
