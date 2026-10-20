import { z } from 'zod';
export const FIRST_PARTY_REPOSITORY = 'T8mars/Deepseek-Harness-Zhenzhen' as const;
export const githubCredentialValue = z.string().min(8).max(4096).regex(/^[^\s\x00-\x1f\x7f]+$/);
export const githubAccessSchema = z.object({ repository: z.literal(FIRST_PARTY_REPOSITORY), configured: z.boolean(), writable: z.boolean() }).strict();
export type GithubAccessInfo = z.infer<typeof githubAccessSchema>;
