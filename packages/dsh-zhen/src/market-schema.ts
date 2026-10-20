import { z } from 'zod';
import { INSTRUCTION_HOSTS } from './compatibility.ts';

export const skillId = z.string().max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const skillManifestSchema = z.object({
  id: skillId, version: z.string().max(40).regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/),
  title: z.string().min(1).max(100), description: z.string().min(1).max(500),
  category: z.enum(['writing', 'visual', 'workflow', 'personal']),
  host: z.string().max(60).refine(value => INSTRUCTION_HOSTS.includes(value), 'Unsupported instruction Host.'), license: z.literal('MIT'),
  source: z.enum(['bundled', 'personal']), digest: digestSchema,
  // This release deliberately accepts standalone instruction documents only.
  // Empty declarations are package capabilities, not model execution permissions.
  dependencies: z.array(z.never()).max(0), permissions: z.array(z.never()).max(0),
}).strict();
export const skillPackageSchema = z.object({ manifest: skillManifestSchema, content: z.string().min(20).max(65536) }).strict();
export const marketItemSchema = z.object({ manifest: skillManifestSchema, installedVersion: z.string(),
  installedDigest: z.string(), enabled: z.boolean(), pendingVersion: z.string(),
  pendingDigest: z.string(), pendingMode: z.enum(['', 'manual', 'automatic']), pendingRevision: z.string().regex(/^(?:[a-f0-9]{40})?$/),
  automaticPaused: z.boolean(), automaticFollowing: z.boolean(), updateAvailable: z.boolean() }).strict();
export const skillAutoPolicySchema = z.object({ source: z.literal('https://github.com/T8mars/Deepseek-Harness-Zhenzhen'), enabled: z.boolean(), pendingAutomatic: z.number().int().min(0).max(10000) }).strict();
export type SkillAutoPolicy = z.infer<typeof skillAutoPolicySchema>;
export type SkillManifest = z.infer<typeof skillManifestSchema>;
export type SkillPackage = z.infer<typeof skillPackageSchema>;
export type MarketItem = z.infer<typeof marketItemSchema>;

export const skillFeedSnapshotSchema = z.object({
  source: z.literal('https://github.com/T8mars/Deepseek-Harness-Zhenzhen'),
  automatic: z.boolean(), checkedAt: z.union([z.literal(''), z.iso.datetime()]), revision: z.string().regex(/^(?:[a-f0-9]{40})?$/),
  state: z.enum(['idle', 'checked', 'error']), count: z.number().int().min(0).max(100), message: z.string().max(300),
}).strict();
export type SkillFeedSnapshot = z.infer<typeof skillFeedSnapshotSchema>;
