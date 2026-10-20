import { z } from 'zod';
export const capabilityFamilySchema = z.enum(['chat', 'video', 'image', 'enhance', 'motion', 'audio', 'suno', 'flowmusic', 'midjourney', 'minimax-v2', 'transcription', 'three-d', 'decisions', 'upload', 'wallet', 'registries', 'queries']);
export const capabilityItemSchema = z.object({
  key: z.string().max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]+$/), family: capabilityFamilySchema, kind: z.enum(['model', 'action', 'operation']),
  model: z.string().max(120), action: z.string().max(80), title: z.string().max(160), line: z.number().int().min(0), section: z.string().max(200),
  protocol: z.enum(['chat-completions', 'video-task', 'legacy-video-task', 'image-task', 'audio-task', 'minimax-v2', 'music-actions', 'midjourney-actions', 'transcription', 'three-d-task', 'decisions', 'upload', 'wallet', 'registries', 'task-queries']),
  readiness: z.enum(['configured', 'observed', 'fixture-tested', 'real-read-tested']), required: z.array(z.string().max(80)).max(50), versions: z.array(z.string().max(50)).max(40), sync: z.boolean(),
  billingSku: z.string().max(120).optional(), upstreamModel: z.string().max(80).optional(), referenceType: z.string().max(80).optional(), requiresVersion: z.boolean().optional(), requiresIndex: z.boolean().optional(),
}).strict();
export const capabilityCatalogSchema = z.object({
  schemaVersion: z.literal(1), observedAt: z.iso.datetime(), scope: z.literal('documented-model-list-and-named-protocols-with-public-action-registries'),
  sources: z.array(z.object({ id: z.enum(['docs', 'music', 'midjourney']), url: z.enum(['https://api.seedance.nz/docs/llms.txt', 'https://api.seedance.nz/api/music/actions', 'https://api.seedance.nz/api/midjourney/actions']), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).length(3),
  families: z.array(z.object({ id: capabilityFamilySchema, title: z.string().max(100), owner: z.enum(['dsh', 'canvas', 'host']) }).strict()).length(17),
  items: z.array(capabilityItemSchema).max(1000),
}).strict().superRefine((value, context) => {
  if (new Set(value.items.map(item => item.key)).size !== value.items.length || new Set(value.families.map(item => item.id)).size !== 17 || new Set(value.sources.map(item => item.id)).size !== 3) context.addIssue({ code: 'custom', message: 'Duplicate catalog identity.' });
  const urls = { docs: 'https://api.seedance.nz/docs/llms.txt', music: 'https://api.seedance.nz/api/music/actions', midjourney: 'https://api.seedance.nz/api/midjourney/actions' };
  if (value.sources.some(source => source.url !== urls[source.id])) context.addIssue({ code: 'custom', message: 'Source identity differs from its fixed URL.' });
});
export const capabilityPageSchema = z.object({ revision: z.string(), total: z.number().int(), offset: z.number().int(), nextOffset: z.number().int().nullable(), items: z.array(capabilityItemSchema).max(30) }).strict();
export type CapabilityCatalog = z.infer<typeof capabilityCatalogSchema>;
export type CapabilityItem = z.infer<typeof capabilityItemSchema>;
export type CapabilityPage = z.infer<typeof capabilityPageSchema>;
export const capabilityCheckSchema = z.object({ checkedAt: z.string().max(40), automatic: z.boolean(), sources: z.array(z.object({
  id: z.enum(['docs', 'music', 'midjourney']), sha256: z.string().max(64), changed: z.boolean(), state: z.enum(['checked', 'unavailable']),
  added: z.array(z.string().max(160)).max(200), removed: z.array(z.string().max(160)).max(200), modified: z.array(z.string().max(160)).max(200),
}).strict()).max(3) }).strict();
export type CapabilityCheck = z.infer<typeof capabilityCheckSchema>;
