import {z} from 'zod';
import {CanvasError} from './canvas.ts';
import {canvasModelsSchema} from './canvas-workflow-schema.ts';
import type {CanvasModels,CanvasModelsQuery} from './canvas-workflow-schema.ts';

/** Project the public native catalog only. Arbitrary parameters, credentials,
 * settings, blocker messages and other upstream fields never enter this DTO. */
export function canvasModelsView(input:CanvasModelsQuery,data:unknown):CanvasModels {
  const row=z.object({id:z.string().min(1).max(512),kind:z.enum(['llm','image','video','audio']),provider:z.string().min(1).max(160),model:z.string().min(1).max(240),readiness:z.object({known:z.boolean(),installed:z.boolean().nullable(),credentialReady:z.boolean().nullable(),regionReady:z.boolean().nullable().optional(),available:z.boolean(),executable:z.boolean(),requiresRuntimeCheck:z.boolean(),blockers:z.array(z.unknown()).max(100)}).optional()});
  const parsed=z.object({total:z.number().int().min(0).max(100000),items:z.array(row).max(500)}).safeParse(data);
  if(!parsed.success||parsed.data.total<parsed.data.items.length||new Set(parsed.data.items.map(item=>item.id)).size!==parsed.data.items.length||parsed.data.items.some(item=>item.kind!==input.kind))throw new CanvasError('WORKFLOW_MODELS_INVALID','画布模型目录无法校验，请重新读取。');
  return canvasModelsSchema.parse({...input,query:input.query??'',total:parsed.data.total,truncated:parsed.data.total>parsed.data.items.length,items:parsed.data.items.map(item=>({id:item.id,kind:item.kind,provider:item.provider,model:item.model,credentialReady:item.readiness?.credentialReady===true,requiresRuntimeCheck:item.readiness?.requiresRuntimeCheck!==false,executable:!!item.readiness&&item.readiness.known&&item.readiness.installed===true&&item.readiness.credentialReady===true&&item.readiness.regionReady===true&&item.readiness.available&&item.readiness.executable&&item.readiness.blockers.length===0}))});
}
