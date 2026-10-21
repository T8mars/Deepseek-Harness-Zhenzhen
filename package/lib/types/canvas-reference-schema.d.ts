import { z } from 'zod';
export declare const canvasReferenceKind: z.ZodEnum<{
    image: "image";
    video: "video";
    audio: "audio";
}>;
export declare const canvasReferenceKey: z.ZodObject<{
    assetId: z.ZodString;
    contentRevision: z.ZodNumber;
    contentHash: z.ZodString;
}, z.core.$strict>;
export type CanvasReferenceKey = z.infer<typeof canvasReferenceKey>;
export declare const canvasReferenceKeys: z.ZodArray<z.ZodObject<{
    assetId: z.ZodString;
    contentRevision: z.ZodNumber;
    contentHash: z.ZodString;
}, z.core.$strict>>;
export declare const canvasAssetSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type CanvasAsset = z.infer<typeof canvasAssetSchema>;
export declare const canvasAssetsQuery: z.ZodObject<{
    projectId: z.ZodString;
    canvasId: z.ZodString;
    kind: z.ZodEnum<{
        image: "image";
        video: "video";
        audio: "audio";
    }>;
    query: z.ZodOptional<z.ZodString>;
    offset: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type CanvasAssetsQuery = z.infer<typeof canvasAssetsQuery>;
export declare const canvasAssetsSchema: z.ZodObject<{
    projectId: z.ZodString;
    canvasId: z.ZodString;
    canvasRevision: z.ZodNumber;
    catalogRevision: z.ZodNumber;
    kind: z.ZodEnum<{
        image: "image";
        video: "video";
        audio: "audio";
    }>;
    query: z.ZodString;
    offset: z.ZodNumber;
    limit: z.ZodLiteral<25>;
    total: z.ZodNumber;
    nextOffset: z.ZodNullable<z.ZodNumber>;
    items: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strict>>;
}, z.core.$strict>;
export type CanvasAssets = z.infer<typeof canvasAssetsSchema>;
