import {z} from 'zod';
import {canvasInstance} from './canvas-contract.ts';
import {canvasWorkspacesSchema,canvasTargetWorkspacesSchema} from './canvas-workflow-schema.ts';

export const ACTIVE_CONTEXT_MAX_AGE_MS = 30000;
export const ACTIVE_CONTEXT_FUTURE_SKEW_MS = 5000;
export function activeContextFresh(observedAt:string,now=Date.now()):boolean {
  const time=Date.parse(observedAt);
  return Number.isFinite(time)&&time<=now+ACTIVE_CONTEXT_FUTURE_SKEW_MS&&time>=now-ACTIVE_CONTEXT_MAX_AGE_MS;
}
const windowId=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
// Native window metadata permits opaque ids; planning still uses its own advertised schema.
const entityId=z.string().min(1).max(160).regex(/^[^\s\u0000-\u001f\u007f/\\]+$/u);
const reason=z.enum(['ready','window-unavailable','window-reloading','canvas-not-ready','invalid-metadata','window-not-ready','renderer-timeout','unknown']).catch('unknown');
export const canvasActiveContextSchema=z.object({
  schema:z.literal('t8-agent-active-context-v1'),instanceId:canvasInstance,
  status:z.enum(['resolved','ambiguous','not-ready','unavailable']),
  resolution:z.enum(['focused-window','single-window']).nullable(),activeWindowId:windowId.nullable(),
  observedAt:z.iso.datetime(),truncated:z.boolean(),
  candidates:z.array(z.object({windowId,windowReady:z.boolean(),rendererReady:z.boolean(),focused:z.boolean(),
    projectId:entityId.nullable(),canvasId:entityId.nullable(),revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    reason,observedAt:z.iso.datetime(),
  })).max(8),
}).superRefine((value,ctx)=>{
  const invalid=()=>ctx.addIssue({code:'custom',message:'Active Canvas identity or readiness is inconsistent.'});
  if(new Set(value.candidates.map(c=>c.windowId)).size!==value.candidates.length)invalid();
  for(const candidate of value.candidates){
    const metadata=candidate.projectId!==null&&candidate.canvasId!==null&&candidate.revision!==null;
    if(candidate.rendererReady?(!candidate.windowReady||!metadata||candidate.reason!=='ready'):(candidate.projectId!==null||candidate.canvasId!==null||candidate.revision!==null||candidate.reason==='ready'))invalid();
  }
  if(value.truncated&&value.status!=='ambiguous')invalid();
  if(value.status==='resolved'){
    const selected=value.candidates.find(c=>c.windowId===value.activeWindowId);
    if(value.truncated||!value.resolution||!selected?.windowReady||!selected.rendererReady)invalid();
    if(value.resolution==='single-window'&&value.candidates.length!==1)invalid();
    if(value.resolution==='focused-window'&&(!selected?.focused||value.candidates.filter(c=>c.focused).length!==1))invalid();
  }else if(value.resolution!==null||value.activeWindowId!==null)invalid();
});
export type CanvasActiveContext=z.infer<typeof canvasActiveContextSchema>;
export const canvasActiveTargetsSchema=z.object({context:canvasActiveContextSchema,workspaces:canvasWorkspacesSchema}).strict();
export type CanvasActiveTargets=z.infer<typeof canvasActiveTargetsSchema>;
export const canvasTargetActiveSchema=z.object({context:canvasActiveContextSchema,workspaces:canvasTargetWorkspacesSchema}).strict();
