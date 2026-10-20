import { z } from 'zod';
import { digestSchema } from './market-schema.ts';
import { localSkillMode, localSkillEntrySchema } from './local-skills-schema.ts';

export const GITHUB_SKILL_POLICY = 'github-resources-v1' as const;
export const githubSkillSpecSchema = z.object({ repository: z.string().max(250), reference: z.string().max(200), path: z.string().max(512), mode: localSkillMode }).strict();
export const githubSkillFileSchema = z.object({ location: z.enum(['package', 'origin']), path: z.string().min(1).max(512), gitSha: z.string().regex(/^[a-f0-9]{40}$/), sha256: digestSchema,
  bytes: z.number().int().min(0).max(8 * 1024 * 1024), mode: z.enum(['100644', '100755']) }).strict();
export const githubSkillReleaseSchema = z.object({ schemaVersion: z.literal(1), spec: githubSkillSpecSchema, sourceId: digestSchema,
  revision: z.string().regex(/^[a-f0-9]{40}$/), tree: z.string().regex(/^[a-f0-9]{40}$/), license: z.string().max(100),
  files: z.array(githubSkillFileSchema).min(1).max(516), entries: z.array(localSkillEntrySchema).min(1).max(128), problems: z.number().int().nonnegative(), digest: digestSchema }).strict();
export const githubSkillSourceSchema = z.object({ id: digestSchema, spec: githubSkillSpecSchema, enabled: z.boolean(), automatic: z.boolean(),
  active: z.string().regex(/^(?:[a-f0-9]{64})?$/), pending: z.string().regex(/^(?:[a-f0-9]{64})?$/), latest: z.string().regex(/^(?:[a-f0-9]{64})?$/),
  checkedAt: z.union([z.literal(''), z.iso.datetime()]), state: z.enum(['idle', 'checked', 'unavailable']), policy: z.literal(GITHUB_SKILL_POLICY) }).strict();
export const githubSkillStateSchema = z.object({ schemaVersion: z.literal(1), sources: z.array(githubSkillSourceSchema).max(16) }).strict();
export const githubSkillSourceViewSchema = githubSkillSourceSchema.extend({ running: z.string().regex(/^(?:[a-f0-9]{64})?$/), skills: z.array(localSkillEntrySchema).max(128) }).strict();
export const githubSkillSummarySchema = githubSkillReleaseSchema.omit({ files: true, entries: true, problems: true }).extend({ bytes: z.number().int().nonnegative(), fileCount: z.number().int().nonnegative(), skillCount: z.number().int().nonnegative() }).strict();
export const githubSkillPreviewSchema = z.object({ release: githubSkillReleaseSchema, source: githubSkillSourceViewSchema.nullable(),
  comparisonAvailable: z.boolean(),
  added: z.array(z.string()).max(516), removed: z.array(z.string()).max(516), changed: z.array(z.string()).max(516) }).strict();
export const githubSkillFilePreviewSchema = z.object({ path: z.string().max(512), location: z.enum(['package', 'origin']), sha256: digestSchema,
  bytes: z.number().int().nonnegative(), encoding: z.enum(['text', 'opaque']), content: z.string().max(131072) }).strict();
export type GithubSkillSpec = z.infer<typeof githubSkillSpecSchema>;
export type GithubSkillFile = z.infer<typeof githubSkillFileSchema>;
export type GithubSkillRelease = z.infer<typeof githubSkillReleaseSchema>;
export type GithubSkillSource = z.infer<typeof githubSkillSourceSchema>;
export type GithubSkillSourceView = z.infer<typeof githubSkillSourceViewSchema>;
export type GithubSkillSummary = z.infer<typeof githubSkillSummarySchema>;
export type GithubSkillPreview = z.infer<typeof githubSkillPreviewSchema>;
export type GithubSkillFilePreview = z.infer<typeof githubSkillFilePreviewSchema>;
