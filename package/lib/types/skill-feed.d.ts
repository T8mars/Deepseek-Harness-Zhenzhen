import { z } from 'zod';
import type { SkillFeedSnapshot } from './market-schema.ts';
import type { SkillMarket } from './market.ts';
import type { GithubAccess } from './github-access.ts';
export declare const skillFeedSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    publisher: z.ZodLiteral<"T8mars/Deepseek-Harness-Zhenzhen">;
    skills: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strict>>;
}, z.core.$strict>;
/** Fixed first-party instruction source. No arbitrary URLs,
 * program resources or dependency installation. Optional user-scoped scheduling
 * still waits for the next Host startup; this class never changes active bodies. */
export declare class SkillFeed {
    private readonly filename;
    private readonly market;
    private readonly fetcher;
    private readonly github?;
    private status;
    private catalog;
    private pending?;
    constructor(filename: string, market: SkillMarket, fetcher?: typeof fetch, github?: GithubAccess | undefined);
    snapshot(): SkillFeedSnapshot;
    private save;
    setAutomatic(enabled: boolean): void;
    setAutoUpdates(enabled: boolean): void;
    pauseAutoUpdate(id: string, paused: boolean): void;
    check(signal?: AbortSignal): Promise<SkillFeedSnapshot>;
    automaticCheck(signal?: AbortSignal): Promise<void>;
}
