import { z } from 'zod';
import { skillId, digestSchema } from './market-schema.ts';

export const LOCAL_SKILL_POLICY = 'local-directory-v1' as const;
export const localSkillMode = z.enum(['skill', 'library']);
export const localSkillEntrySchema = z.object({ directory: z.string().max(200), name: skillId, description: z.string().min(1).max(1024),
  digest: digestSchema, bytes: z.number().int().min(1).max(131072), modelInvocable: z.boolean(), userInvocable: z.boolean() }).strict();
export const localSkillDraftSchema = z.object({ root: z.string().min(1).max(4096), mode: localSkillMode, identity: z.string().max(100),
  digest: digestSchema, entries: z.array(localSkillEntrySchema).max(128), skipped: z.number().int().nonnegative(), problems: z.number().int().nonnegative() }).strict();
export const localSkillRecordSchema = z.object({ id: z.uuid(), root: z.string().min(1).max(4096), mode: localSkillMode,
  identity: z.string().min(1).max(100), enabled: z.boolean(), confirmedAt: z.iso.datetime(), policy: z.literal(LOCAL_SKILL_POLICY) }).strict();
export const localSkillViewSchema = z.object({ source: localSkillRecordSchema, state: z.enum(['ready', 'disabled', 'unavailable']),
  entries: z.array(localSkillEntrySchema.extend({ shadowed: z.boolean() }).strict()).max(128), problems: z.number().int().nonnegative(), skipped: z.number().int().nonnegative() }).strict();
export const localSkillBodySchema = z.object({ entry: localSkillEntrySchema, content: z.string().max(131072), resourceRoot: z.string().max(4096) }).strict();
export const localSkillStateSchema = z.object({ schemaVersion: z.literal(1), sources: z.array(localSkillRecordSchema).max(16) }).strict();
export type LocalSkillEntry = z.infer<typeof localSkillEntrySchema>;
export type LocalSkillDraft = z.infer<typeof localSkillDraftSchema>;
export type LocalSkillRecord = z.infer<typeof localSkillRecordSchema>;
export type LocalSkillView = z.infer<typeof localSkillViewSchema>;
export type LocalSkillBody = z.infer<typeof localSkillBodySchema>;
export type LocalSkillMode = z.infer<typeof localSkillMode>;
