import {z} from 'zod';
export const RESTORED_MANAGED_SKILL_POLICY='dsh-zhen-restored-managed-invocation-v1';
const hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().max(4096);
export const restoredManagedSkillRequest=z.object({snapshot:hash,key:hash,action:z.enum(['approve','revoke']),confirmation:z.literal(RESTORED_MANAGED_SKILL_POLICY)}).strict();
export const restoredManagedSkillRow=z.object({kind:z.enum(['market','local','github']),id:text,key:hash,name:text,version:z.string().max(255),location:text.nullable(),enabled:z.boolean(),eligible:z.boolean(),approved:z.boolean()}).strict();
export const restoredManagedSkillView=z.object({available:z.boolean(),reason:z.enum(['not-restored','profile-unavailable','ready']),profile:z.string().min(1).max(255).nullable(),snapshot:hash.nullable(),items:z.array(restoredManagedSkillRow).max(20),total:z.number().int().min(0).max(40032),page:z.number().int().min(0).max(2002),nextPage:z.number().int().min(0).max(2002).nullable(),updatesPaused:z.literal(true),applicationActivated:z.literal(false)}).strict().refine(row=>row.available?row.reason==='ready'&&row.snapshot!==null&&row.profile!==null:row.reason!=='ready'&&row.snapshot===null&&row.items.length===0&&row.total===0);
export type RestoredManagedSkillRequest=z.infer<typeof restoredManagedSkillRequest>;
export type RestoredManagedSkillView=z.infer<typeof restoredManagedSkillView>;
