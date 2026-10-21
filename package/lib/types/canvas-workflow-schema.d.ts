import { z } from 'zod';
export declare const canvasModelKind: z.ZodEnum<{
    image: "image";
    video: "video";
    audio: "audio";
    llm: "llm";
}>;
export type CanvasModelKind = z.infer<typeof canvasModelKind>;
export declare const canvasModelChoice: z.ZodObject<{
    provider: z.ZodString;
    model: z.ZodString;
}, z.core.$strict>;
export declare const canvasModelChoices: z.ZodObject<{
    llm: z.ZodOptional<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
    }, z.core.$strict>>;
    image: z.ZodOptional<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
    }, z.core.$strict>>;
    video: z.ZodOptional<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
    }, z.core.$strict>>;
    audio: z.ZodOptional<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type CanvasModelChoices = z.infer<typeof canvasModelChoices>;
export declare const canvasWorkflowInput: z.ZodObject<{
    projectId: z.ZodString;
    canvasId: z.ZodString;
    kind: z.ZodEnum<{
        image: "image";
        video: "video";
        audio: "audio";
        "edit-image": "edit-image";
        "edit-video": "edit-video";
        script: "script";
        story: "story";
    }>;
    prompt: z.ZodString;
    references: z.ZodOptional<z.ZodArray<z.ZodObject<{
        assetId: z.ZodString;
        contentRevision: z.ZodNumber;
        contentHash: z.ZodString;
    }, z.core.$strict>>>;
    modelChoices: z.ZodOptional<z.ZodObject<{
        llm: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
        }, z.core.$strict>>;
        image: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
        }, z.core.$strict>>;
        video: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
        }, z.core.$strict>>;
        audio: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    profile: z.ZodOptional<z.ZodEnum<{
        economy: "economy";
        balanced: "balanced";
        quality: "quality";
    }>>;
    candidates: z.ZodOptional<z.ZodNumber>;
    ratio: z.ZodOptional<z.ZodEnum<{
        "1:1": "1:1";
        "16:9": "16:9";
        "9:16": "9:16";
        "4:3": "4:3";
        "3:4": "3:4";
    }>>;
    duration: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type CanvasWorkflowInput = z.infer<typeof canvasWorkflowInput>;
export declare const canvasModelsQuery: z.ZodObject<{
    projectId: z.ZodString;
    canvasId: z.ZodString;
    kind: z.ZodEnum<{
        image: "image";
        video: "video";
        audio: "audio";
        llm: "llm";
    }>;
    query: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type CanvasModelsQuery = z.infer<typeof canvasModelsQuery>;
export declare const canvasModelsSchema: z.ZodObject<{
    projectId: z.ZodString;
    canvasId: z.ZodString;
    kind: z.ZodEnum<{
        image: "image";
        video: "video";
        audio: "audio";
        llm: "llm";
    }>;
    query: z.ZodString;
    total: z.ZodNumber;
    truncated: z.ZodBoolean;
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<{
            image: "image";
            video: "video";
            audio: "audio";
            llm: "llm";
        }>;
        provider: z.ZodString;
        model: z.ZodString;
        executable: z.ZodBoolean;
        credentialReady: z.ZodBoolean;
        requiresRuntimeCheck: z.ZodBoolean;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type CanvasModels = z.infer<typeof canvasModelsSchema>;
export declare const canvasWorkspacesSchema: z.ZodObject<{
    canvases: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        projectId: z.ZodString;
        name: z.ZodString;
        revision: z.ZodNumber;
    }, z.core.$strict>>;
    total: z.ZodOptional<z.ZodNumber>;
    truncated: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type CanvasWorkspaces = z.infer<typeof canvasWorkspacesSchema>;
export declare const canvasWorkflowSchema: z.ZodObject<{
    id: z.ZodUUID;
    projectId: z.ZodString;
    canvasId: z.ZodString;
    planId: z.ZodString;
    planDigest: z.ZodString;
    action: z.ZodString;
    goal: z.ZodString;
    canvasRevision: z.ZodNumber;
    ready: z.ZodBoolean;
    candidates: z.ZodNumber;
    operationCount: z.ZodNumber;
    models: z.ZodArray<z.ZodString>;
    questions: z.ZodArray<z.ZodString>;
    expiresAt: z.ZodISODateTime;
    phase: z.ZodEnum<{
        denied: "denied";
        unknown: "unknown";
        preview: "preview";
        requesting: "requesting";
        pending: "pending";
        applying: "applying";
        applied: "applied";
        expired: "expired";
    }>;
    approvalRequestId: z.ZodString;
    patchId: z.ZodString;
    revision: z.ZodNullable<z.ZodNumber>;
    output: z.ZodOptional<z.ZodObject<{
        profile: z.ZodString;
        ratio: z.ZodString;
        durationSeconds: z.ZodNumber;
    }, z.core.$strict>>;
    references: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        projectId: z.ZodString;
        name: z.ZodString;
        kind: z.ZodEnum<{
            image: "image";
            video: "video";
            audio: "audio";
        }>;
        contentRevision: z.ZodNumber;
        contentHash: z.ZodNullable<z.ZodString>;
        mimeType: z.ZodString;
        size: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        duration: z.ZodNumber;
        selectable: z.ZodBoolean;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type CanvasWorkflowView = z.infer<typeof canvasWorkflowSchema>;
