import {z} from 'zod';
export const RESTORED_MANAGED_RUNTIME_POLICY='dsh-zhen-managed-runtime-v1' as const;
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const restoredManagedRuntimeRequest=z.object({snapshot:digest,action:z.enum(['enable','pause']),confirmation:z.literal(RESTORED_MANAGED_RUNTIME_POLICY)}).strict();
export const restoredManagedRuntimeView=z.object({
  available:z.boolean(),reason:z.enum(['ready','not-restored','profile-unavailable']),profile:z.string().min(1).max(255).nullable(),snapshot:digest.nullable(),
  active:z.boolean(),paused:z.boolean(),repairRequired:z.boolean(),total:z.number().int().min(0).max(40032),page:z.number().int().min(0).max(2002),nextPage:z.number().int().min(0).max(2002).nullable(),
  pending:z.number().int().min(0).max(40032),originalAutomatic:z.boolean(),
  items:z.array(z.object({kind:z.enum(['market','local','github']),id:z.string().min(1).max(255),key:digest,name:z.string().max(4096),version:z.string().max(128),location:z.string().max(4096).nullable(),enabled:z.boolean(),eligible:z.boolean()}).strict()).max(20),applicationActivated:z.literal(false),
}).strict().refine(row=>row.available?row.reason==='ready'&&row.profile!==null&&row.snapshot!==null&&(!(row.paused||row.repairRequired)||row.active):row.reason!=='ready'&&row.snapshot===null&&row.total===0&&row.items.length===0&&!row.active&&!row.paused&&!row.repairRequired);
export type RestoredManagedRuntimeRequest=z.infer<typeof restoredManagedRuntimeRequest>;
export type RestoredManagedRuntimeView=z.infer<typeof restoredManagedRuntimeView>;
