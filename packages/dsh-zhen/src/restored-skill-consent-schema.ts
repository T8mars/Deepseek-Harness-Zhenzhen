import {z} from 'zod';

export const RESTORED_SKILL_CONSENT_POLICY='dsh-zhen-restored-filesystem-skills-v1';
const digest=z.string().regex(/^[a-f0-9]{64}$/),name=z.string().min(1).max(255),path=z.string().min(1).max(4096);
export const restoredSkillConsentRequestSchema=z.object({snapshot:digest,action:z.enum(['approve','revoke']),confirmation:z.literal(RESTORED_SKILL_CONSENT_POLICY)}).strict();
export type RestoredSkillConsentRequest=z.infer<typeof restoredSkillConsentRequestSchema>;
export const restoredSkillConsentViewSchema=z.object({
  available:z.boolean(),profile:name.nullable(),snapshot:digest.nullable(),approved:z.boolean(),
  providers:z.array(z.object({id:name,name,enabled:z.boolean(),roots:z.array(path).max(132)}).strict()).max(20),
  projects:z.array(z.object({originalDirectory:path,directory:path}).strict()).max(20),
  totalProviders:z.number().int().min(0).max(2048),enabledProviders:z.number().int().min(0).max(2048),totalProjects:z.number().int().min(0).max(128),
  page:z.number().int().min(0).max(102),nextPage:z.number().int().min(0).max(102).nullable(),
  reason:z.enum(['not-restored','profile-unavailable','ready']),
  managedSkillsPaused:z.literal(true),applicationActivated:z.literal(false),
}).strict().refine(value=>value.enabledProviders<=value.totalProviders&&value.providers.length<=value.totalProviders&&value.projects.length<=value.totalProjects&&(value.nextPage===null||value.nextPage===value.page+1)&&(value.available?value.profile!==null&&value.snapshot!==null&&value.reason==='ready':value.snapshot===null&&!value.approved&&!value.providers.length&&!value.projects.length&&!value.totalProviders&&!value.totalProjects&&value.nextPage===null&&value.reason!=='ready'));
export type RestoredSkillConsentView=z.infer<typeof restoredSkillConsentViewSchema>;
