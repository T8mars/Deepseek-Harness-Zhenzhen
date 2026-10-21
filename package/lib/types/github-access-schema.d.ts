import { z } from 'zod';
export declare const FIRST_PARTY_REPOSITORY: "T8mars/Deepseek-Harness-Zhenzhen";
export declare const githubCredentialValue: z.ZodString;
export declare const githubAccessSchema: z.ZodObject<{
    repository: z.ZodLiteral<"T8mars/Deepseek-Harness-Zhenzhen">;
    configured: z.ZodBoolean;
    writable: z.ZodBoolean;
}, z.core.$strict>;
export type GithubAccessInfo = z.infer<typeof githubAccessSchema>;
