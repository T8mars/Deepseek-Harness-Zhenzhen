import { z } from 'zod';
export declare const gatewayTaskProtocolSchema: z.ZodEnum<{
    image: "image";
    video: "video";
    audio: "audio";
    midjourney: "midjourney";
    "minimax-v2": "minimax-v2";
    "three-d": "three-d";
    music: "music";
    "legacy-video": "legacy-video";
}>;
export declare const gatewayTaskIdSchema: z.ZodString;
export declare const gatewayTaskSpecSchema: z.ZodObject<{
    protocol: z.ZodEnum<{
        image: "image";
        video: "video";
        audio: "audio";
        midjourney: "midjourney";
        "minimax-v2": "minimax-v2";
        "three-d": "three-d";
        music: "music";
        "legacy-video": "legacy-video";
    }>;
    taskId: z.ZodString;
}, z.core.$strict>;
export declare const gatewayTaskCodeSchema: z.ZodEnum<{
    "": "";
    AUTH: "AUTH";
    NOT_FOUND: "NOT_FOUND";
    RATE_LIMIT: "RATE_LIMIT";
    UNAVAILABLE: "UNAVAILABLE";
    RESPONSE: "RESPONSE";
    MISSING_CREDENTIAL: "MISSING_CREDENTIAL";
    SERVER: "SERVER";
    CANCELLED: "CANCELLED";
    NETWORK: "NETWORK";
    BUSY: "BUSY";
    CONFIG_CHANGED: "CONFIG_CHANGED";
    UNRECOGNIZED_STATUS: "UNRECOGNIZED_STATUS";
}>;
export declare const gatewayTaskObservationSchema: z.ZodObject<{
    status: z.ZodEnum<{
        unknown: "unknown";
        running: "running";
        failed: "failed";
        cancelled: "cancelled";
        succeeded: "succeeded";
        queued: "queued";
    }>;
    progress: z.ZodNullable<z.ZodNumber>;
    resultCount: z.ZodNumber;
    usage: z.ZodNullable<z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const gatewayTaskRecordSchema: z.ZodObject<{
    status: z.ZodEnum<{
        unknown: "unknown";
        running: "running";
        failed: "failed";
        cancelled: "cancelled";
        succeeded: "succeeded";
        queued: "queued";
    }>;
    progress: z.ZodNullable<z.ZodNumber>;
    resultCount: z.ZodNumber;
    usage: z.ZodNullable<z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodString;
    }, z.core.$strict>>;
    id: z.ZodUUID;
    protocol: z.ZodEnum<{
        image: "image";
        video: "video";
        audio: "audio";
        midjourney: "midjourney";
        "minimax-v2": "minimax-v2";
        "three-d": "three-d";
        music: "music";
        "legacy-video": "legacy-video";
    }>;
    taskId: z.ZodString;
    createdAt: z.ZodISODateTime;
    checkedAt: z.ZodString;
    nextCheckAt: z.ZodString;
    tracking: z.ZodBoolean;
    querying: z.ZodBoolean;
    code: z.ZodEnum<{
        "": "";
        AUTH: "AUTH";
        NOT_FOUND: "NOT_FOUND";
        RATE_LIMIT: "RATE_LIMIT";
        UNAVAILABLE: "UNAVAILABLE";
        RESPONSE: "RESPONSE";
        MISSING_CREDENTIAL: "MISSING_CREDENTIAL";
        SERVER: "SERVER";
        CANCELLED: "CANCELLED";
        NETWORK: "NETWORK";
        BUSY: "BUSY";
        CONFIG_CHANGED: "CONFIG_CHANGED";
        UNRECOGNIZED_STATUS: "UNRECOGNIZED_STATUS";
    }>;
    failures: z.ZodNumber;
}, z.core.$strict>;
export type GatewayTaskProtocol = z.infer<typeof gatewayTaskProtocolSchema>;
export type GatewayTaskSpec = z.infer<typeof gatewayTaskSpecSchema>;
export type GatewayTaskCode = z.infer<typeof gatewayTaskCodeSchema>;
export type GatewayTaskObservation = z.infer<typeof gatewayTaskObservationSchema>;
export type GatewayTaskRecord = z.infer<typeof gatewayTaskRecordSchema>;
