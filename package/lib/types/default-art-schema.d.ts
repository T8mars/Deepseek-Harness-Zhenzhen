import { z } from 'zod';
export declare const DEFAULT_ART_CHUNK_BYTES: number;
export declare const defaultArtDigest: z.ZodString;
export declare const defaultArtSlot: z.ZodEnum<{
    "hero-mark": "hero-mark";
    portrait: "portrait";
    "portrait-dark": "portrait-dark";
    mark: "mark";
    "mark-dark": "mark-dark";
    "hero-mark-dark": "hero-mark-dark";
}>;
export declare const defaultArtAsset: z.ZodObject<{
    slot: z.ZodEnum<{
        "hero-mark": "hero-mark";
        portrait: "portrait";
        "portrait-dark": "portrait-dark";
        mark: "mark";
        "mark-dark": "mark-dark";
        "hero-mark-dark": "hero-mark-dark";
    }>;
    sha256: z.ZodString;
    name: z.ZodString;
    size: z.ZodNumber;
    type: z.ZodEnum<{
        "image/png": "image/png";
        "image/jpeg": "image/jpeg";
        "image/webp": "image/webp";
    }>;
    width: z.ZodNumber;
    height: z.ZodNumber;
}, z.core.$strict>;
export declare const defaultArtInfoSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    state: z.ZodLiteral<"ready">;
    code: z.ZodLiteral<"OK">;
    pack: z.ZodObject<{
        protocol: z.ZodLiteral<"dsh-zhen-default-art-v1">;
        chunkBytes: z.ZodNumber;
        id: z.ZodString;
        name: z.ZodString;
        digest: z.ZodString;
        focus: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            scale: z.ZodNumber;
        }, z.core.$strict>;
        credit: z.ZodObject<{
            artist: z.ZodString;
            source: z.ZodString;
            url: z.ZodString;
            license: z.ZodString;
            notice: z.ZodString;
        }, z.core.$strict>;
        assets: z.ZodArray<z.ZodObject<{
            slot: z.ZodEnum<{
                "hero-mark": "hero-mark";
                portrait: "portrait";
                "portrait-dark": "portrait-dark";
                mark: "mark";
                "mark-dark": "mark-dark";
                "hero-mark-dark": "hero-mark-dark";
            }>;
            sha256: z.ZodString;
            name: z.ZodString;
            size: z.ZodNumber;
            type: z.ZodEnum<{
                "image/png": "image/png";
                "image/jpeg": "image/jpeg";
                "image/webp": "image/webp";
            }>;
            width: z.ZodNumber;
            height: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"none">;
    code: z.ZodLiteral<"ART_NOT_CONFIGURED">;
    pack: z.ZodNull;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"unavailable">;
    code: z.ZodLiteral<"ART_SOURCE_UNAVAILABLE">;
    pack: z.ZodNull;
}, z.core.$strict>], "state">;
export type DefaultArtInfo = z.infer<typeof defaultArtInfoSchema>;
export type DefaultArtAsset = z.infer<typeof defaultArtAsset>;
export declare const defaultArtChunkRequest: z.ZodObject<{
    digest: z.ZodString;
    sha256: z.ZodString;
    offset: z.ZodNumber;
}, z.core.$strict>;
export type DefaultArtChunkRequest = z.infer<typeof defaultArtChunkRequest>;
export declare const defaultArtChunkSchema: z.ZodObject<{
    digest: z.ZodString;
    sha256: z.ZodString;
    offset: z.ZodNumber;
    nextOffset: z.ZodNumber;
    size: z.ZodNumber;
    base64: z.ZodString;
    eof: z.ZodBoolean;
}, z.core.$strict>;
export type DefaultArtChunk = z.infer<typeof defaultArtChunkSchema>;
