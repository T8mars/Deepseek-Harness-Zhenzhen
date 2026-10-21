import { z } from 'zod';
export declare const skillId: z.ZodString;
export declare const digestSchema: z.ZodString;
export declare const skillManifestSchema: z.ZodObject<{
    id: z.ZodString;
    version: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    category: z.ZodEnum<{
        writing: "writing";
        visual: "visual";
        workflow: "workflow";
        personal: "personal";
    }>;
    host: z.ZodString;
    license: z.ZodLiteral<"MIT">;
    source: z.ZodEnum<{
        personal: "personal";
        bundled: "bundled";
    }>;
    digest: z.ZodString;
    dependencies: z.ZodArray<z.ZodNever>;
    permissions: z.ZodArray<z.ZodNever>;
}, z.core.$strict>;
export declare const skillPackageSchema: z.ZodObject<{
    manifest: z.ZodObject<{
        id: z.ZodString;
        version: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        category: z.ZodEnum<{
            writing: "writing";
            visual: "visual";
            workflow: "workflow";
            personal: "personal";
        }>;
        host: z.ZodString;
        license: z.ZodLiteral<"MIT">;
        source: z.ZodEnum<{
            personal: "personal";
            bundled: "bundled";
        }>;
        digest: z.ZodString;
        dependencies: z.ZodArray<z.ZodNever>;
        permissions: z.ZodArray<z.ZodNever>;
    }, z.core.$strict>;
    content: z.ZodString;
}, z.core.$strict>;
export declare const marketItemSchema: z.ZodObject<{
    manifest: z.ZodObject<{
        id: z.ZodString;
        version: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        category: z.ZodEnum<{
            writing: "writing";
            visual: "visual";
            workflow: "workflow";
            personal: "personal";
        }>;
        host: z.ZodString;
        license: z.ZodLiteral<"MIT">;
        source: z.ZodEnum<{
            personal: "personal";
            bundled: "bundled";
        }>;
        digest: z.ZodString;
        dependencies: z.ZodArray<z.ZodNever>;
        permissions: z.ZodArray<z.ZodNever>;
    }, z.core.$strict>;
    installedVersion: z.ZodString;
    installedDigest: z.ZodString;
    enabled: z.ZodBoolean;
    pendingVersion: z.ZodString;
    pendingDigest: z.ZodString;
    pendingMode: z.ZodEnum<{
        "": "";
        automatic: "automatic";
        manual: "manual";
    }>;
    pendingRevision: z.ZodString;
    automaticPaused: z.ZodBoolean;
    automaticFollowing: z.ZodBoolean;
    updateAvailable: z.ZodBoolean;
}, z.core.$strict>;
export declare const skillAutoPolicySchema: z.ZodObject<{
    source: z.ZodLiteral<"https://github.com/T8mars/Deepseek-Harness-Zhenzhen">;
    enabled: z.ZodBoolean;
    pendingAutomatic: z.ZodNumber;
}, z.core.$strict>;
export type SkillAutoPolicy = z.infer<typeof skillAutoPolicySchema>;
export type SkillManifest = z.infer<typeof skillManifestSchema>;
export type SkillPackage = z.infer<typeof skillPackageSchema>;
export type MarketItem = z.infer<typeof marketItemSchema>;
export declare const skillFeedSnapshotSchema: z.ZodObject<{
    source: z.ZodLiteral<"https://github.com/T8mars/Deepseek-Harness-Zhenzhen">;
    automatic: z.ZodBoolean;
    checkedAt: z.ZodUnion<readonly [z.ZodLiteral<"">, z.ZodISODateTime]>;
    revision: z.ZodString;
    state: z.ZodEnum<{
        error: "error";
        checked: "checked";
        idle: "idle";
    }>;
    count: z.ZodNumber;
    message: z.ZodString;
}, z.core.$strict>;
export type SkillFeedSnapshot = z.infer<typeof skillFeedSnapshotSchema>;
