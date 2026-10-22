import {z} from 'zod';
import {backupRestoreSchema} from './backup-center-schema.ts';

const path=z.string().min(1).max(4096),projectId=z.string().regex(/^[a-f0-9]{64}$/),count=z.number().int().nonnegative().max(10000);
export const recoveryProjectCursorSchema=z.string().max(5).regex(/^(?:|[1-9]\d{0,4})$/).refine(value=>value===''||Number(value)<=10000&&Number(value)%20===0);
export const recoveryProjectSelectionSchema=z.object({candidateId:z.uuid(),directories:z.array(z.object({projectId,directory:path}).strict()).min(1).max(10000)}).strict().refine(value=>new Set(value.directories.map(row=>row.projectId)).size===value.directories.length);
export type RecoveryProjectSelection=z.infer<typeof recoveryProjectSelectionSchema>;
export const projectAwareRestoreSchema=backupRestoreSchema.extend({projects:recoveryProjectSelectionSchema.optional()}).refine(value=>value.projects?.candidateId!==value.id);
export type ProjectAwareRestore=z.infer<typeof projectAwareRestoreSchema>;
export const recoveryProjectsSchema=z.object({root:path,status:z.enum(['available','unselected','legacy']),totalProjects:count,totalSessions:count,items:z.array(z.object({id:projectId,originalDirectory:path.nullable(),sessions:count.min(1)}).strict()).max(20),nextCursor:recoveryProjectCursorSchema.nullable(),activated:z.literal(false)}).strict().refine(value=>new Set(value.items.map(row=>row.id)).size===value.items.length&&value.items.length<=value.totalProjects&&(value.status==='available'||value.totalProjects===0&&value.totalSessions===0&&value.items.length===0&&value.nextCursor===null));
export type RecoveryProjects=z.infer<typeof recoveryProjectsSchema>;
