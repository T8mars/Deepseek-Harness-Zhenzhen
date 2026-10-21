import { z } from 'zod';
export declare const capabilityFamilySchema: z.ZodEnum<{
    image: "image";
    video: "video";
    audio: "audio";
    decisions: "decisions";
    chat: "chat";
    enhance: "enhance";
    motion: "motion";
    suno: "suno";
    flowmusic: "flowmusic";
    midjourney: "midjourney";
    "minimax-v2": "minimax-v2";
    transcription: "transcription";
    "three-d": "three-d";
    upload: "upload";
    wallet: "wallet";
    registries: "registries";
    queries: "queries";
}>;
export declare const capabilityItemSchema: z.ZodObject<{
    key: z.ZodString;
    family: z.ZodEnum<{
        image: "image";
        video: "video";
        audio: "audio";
        decisions: "decisions";
        chat: "chat";
        enhance: "enhance";
        motion: "motion";
        suno: "suno";
        flowmusic: "flowmusic";
        midjourney: "midjourney";
        "minimax-v2": "minimax-v2";
        transcription: "transcription";
        "three-d": "three-d";
        upload: "upload";
        wallet: "wallet";
        registries: "registries";
        queries: "queries";
    }>;
    kind: z.ZodEnum<{
        operation: "operation";
        model: "model";
        action: "action";
    }>;
    model: z.ZodString;
    action: z.ZodString;
    title: z.ZodString;
    line: z.ZodNumber;
    section: z.ZodString;
    protocol: z.ZodEnum<{
        decisions: "decisions";
        "minimax-v2": "minimax-v2";
        transcription: "transcription";
        upload: "upload";
        wallet: "wallet";
        registries: "registries";
        "chat-completions": "chat-completions";
        "video-task": "video-task";
        "legacy-video-task": "legacy-video-task";
        "image-task": "image-task";
        "audio-task": "audio-task";
        "music-actions": "music-actions";
        "midjourney-actions": "midjourney-actions";
        "three-d-task": "three-d-task";
        "task-queries": "task-queries";
    }>;
    readiness: z.ZodEnum<{
        configured: "configured";
        observed: "observed";
        "fixture-tested": "fixture-tested";
        "real-read-tested": "real-read-tested";
    }>;
    required: z.ZodArray<z.ZodString>;
    versions: z.ZodArray<z.ZodString>;
    sync: z.ZodBoolean;
    billingSku: z.ZodOptional<z.ZodString>;
    upstreamModel: z.ZodOptional<z.ZodString>;
    referenceType: z.ZodOptional<z.ZodString>;
    requiresVersion: z.ZodOptional<z.ZodBoolean>;
    requiresIndex: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export declare const capabilityCatalogSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    observedAt: z.ZodISODateTime;
    scope: z.ZodLiteral<"documented-model-list-and-named-protocols-with-public-action-registries">;
    sources: z.ZodArray<z.ZodObject<{
        id: z.ZodEnum<{
            midjourney: "midjourney";
            docs: "docs";
            music: "music";
        }>;
        url: z.ZodEnum<{
            "https://api.seedance.nz/docs/llms.txt": "https://api.seedance.nz/docs/llms.txt";
            "https://api.seedance.nz/api/music/actions": "https://api.seedance.nz/api/music/actions";
            "https://api.seedance.nz/api/midjourney/actions": "https://api.seedance.nz/api/midjourney/actions";
        }>;
        sha256: z.ZodString;
    }, z.core.$strict>>;
    families: z.ZodArray<z.ZodObject<{
        id: z.ZodEnum<{
            image: "image";
            video: "video";
            audio: "audio";
            decisions: "decisions";
            chat: "chat";
            enhance: "enhance";
            motion: "motion";
            suno: "suno";
            flowmusic: "flowmusic";
            midjourney: "midjourney";
            "minimax-v2": "minimax-v2";
            transcription: "transcription";
            "three-d": "three-d";
            upload: "upload";
            wallet: "wallet";
            registries: "registries";
            queries: "queries";
        }>;
        title: z.ZodString;
        owner: z.ZodEnum<{
            dsh: "dsh";
            canvas: "canvas";
            host: "host";
        }>;
    }, z.core.$strict>>;
    items: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        family: z.ZodEnum<{
            image: "image";
            video: "video";
            audio: "audio";
            decisions: "decisions";
            chat: "chat";
            enhance: "enhance";
            motion: "motion";
            suno: "suno";
            flowmusic: "flowmusic";
            midjourney: "midjourney";
            "minimax-v2": "minimax-v2";
            transcription: "transcription";
            "three-d": "three-d";
            upload: "upload";
            wallet: "wallet";
            registries: "registries";
            queries: "queries";
        }>;
        kind: z.ZodEnum<{
            operation: "operation";
            model: "model";
            action: "action";
        }>;
        model: z.ZodString;
        action: z.ZodString;
        title: z.ZodString;
        line: z.ZodNumber;
        section: z.ZodString;
        protocol: z.ZodEnum<{
            decisions: "decisions";
            "minimax-v2": "minimax-v2";
            transcription: "transcription";
            upload: "upload";
            wallet: "wallet";
            registries: "registries";
            "chat-completions": "chat-completions";
            "video-task": "video-task";
            "legacy-video-task": "legacy-video-task";
            "image-task": "image-task";
            "audio-task": "audio-task";
            "music-actions": "music-actions";
            "midjourney-actions": "midjourney-actions";
            "three-d-task": "three-d-task";
            "task-queries": "task-queries";
        }>;
        readiness: z.ZodEnum<{
            configured: "configured";
            observed: "observed";
            "fixture-tested": "fixture-tested";
            "real-read-tested": "real-read-tested";
        }>;
        required: z.ZodArray<z.ZodString>;
        versions: z.ZodArray<z.ZodString>;
        sync: z.ZodBoolean;
        billingSku: z.ZodOptional<z.ZodString>;
        upstreamModel: z.ZodOptional<z.ZodString>;
        referenceType: z.ZodOptional<z.ZodString>;
        requiresVersion: z.ZodOptional<z.ZodBoolean>;
        requiresIndex: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const capabilityPageSchema: z.ZodObject<{
    revision: z.ZodString;
    total: z.ZodNumber;
    offset: z.ZodNumber;
    nextOffset: z.ZodNullable<z.ZodNumber>;
    items: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        family: z.ZodEnum<{
            image: "image";
            video: "video";
            audio: "audio";
            decisions: "decisions";
            chat: "chat";
            enhance: "enhance";
            motion: "motion";
            suno: "suno";
            flowmusic: "flowmusic";
            midjourney: "midjourney";
            "minimax-v2": "minimax-v2";
            transcription: "transcription";
            "three-d": "three-d";
            upload: "upload";
            wallet: "wallet";
            registries: "registries";
            queries: "queries";
        }>;
        kind: z.ZodEnum<{
            operation: "operation";
            model: "model";
            action: "action";
        }>;
        model: z.ZodString;
        action: z.ZodString;
        title: z.ZodString;
        line: z.ZodNumber;
        section: z.ZodString;
        protocol: z.ZodEnum<{
            decisions: "decisions";
            "minimax-v2": "minimax-v2";
            transcription: "transcription";
            upload: "upload";
            wallet: "wallet";
            registries: "registries";
            "chat-completions": "chat-completions";
            "video-task": "video-task";
            "legacy-video-task": "legacy-video-task";
            "image-task": "image-task";
            "audio-task": "audio-task";
            "music-actions": "music-actions";
            "midjourney-actions": "midjourney-actions";
            "three-d-task": "three-d-task";
            "task-queries": "task-queries";
        }>;
        readiness: z.ZodEnum<{
            configured: "configured";
            observed: "observed";
            "fixture-tested": "fixture-tested";
            "real-read-tested": "real-read-tested";
        }>;
        required: z.ZodArray<z.ZodString>;
        versions: z.ZodArray<z.ZodString>;
        sync: z.ZodBoolean;
        billingSku: z.ZodOptional<z.ZodString>;
        upstreamModel: z.ZodOptional<z.ZodString>;
        referenceType: z.ZodOptional<z.ZodString>;
        requiresVersion: z.ZodOptional<z.ZodBoolean>;
        requiresIndex: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type CapabilityCatalog = z.infer<typeof capabilityCatalogSchema>;
export type CapabilityItem = z.infer<typeof capabilityItemSchema>;
export type CapabilityPage = z.infer<typeof capabilityPageSchema>;
export declare const capabilityCheckSchema: z.ZodObject<{
    checkedAt: z.ZodString;
    automatic: z.ZodBoolean;
    sources: z.ZodArray<z.ZodObject<{
        id: z.ZodEnum<{
            midjourney: "midjourney";
            docs: "docs";
            music: "music";
        }>;
        sha256: z.ZodString;
        changed: z.ZodBoolean;
        state: z.ZodEnum<{
            checked: "checked";
            unavailable: "unavailable";
        }>;
        added: z.ZodArray<z.ZodString>;
        removed: z.ZodArray<z.ZodString>;
        modified: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type CapabilityCheck = z.infer<typeof capabilityCheckSchema>;
