import {CanvasError} from './canvas.ts';
import type {CanvasWorkflowRuntime} from './canvas.ts';
import {canvasActiveContextSchema,activeContextFresh} from './canvas-active-schema.ts';
import type {CanvasActiveContext} from './canvas-active-schema.ts';

/** Project the documented metadata only, never a renderer body or error detail. */
export function parseCanvasActiveContext(value:unknown,instanceId:string,now=Date.now()):CanvasActiveContext{
  const parsed=canvasActiveContextSchema.safeParse(value);
  if(!parsed.success)throw new CanvasError('ACTIVE_CONTEXT_INVALID','画布返回的活动信息不完整，请重新读取；仍有问题可在画布连接页检查版本。');
  const context=parsed.data;
  if(context.instanceId!==instanceId)throw new CanvasError('ACTIVE_CONTEXT_INSTANCE_MISMATCH','活动信息来自另一个画布实例，请重新检测连接。');
  if(!activeContextFresh(context.observedAt,now)||context.candidates.some(candidate=>!activeContextFresh(candidate.observedAt,now)))throw new CanvasError('ACTIVE_CONTEXT_EXPIRED','活动画布信息已过期，请重新读取当前画布。');
  return context;
}
export async function readCanvasActiveContext(runtime:Pick<CanvasWorkflowRuntime,'client'|'instance'|'accessToken'>):Promise<CanvasActiveContext>{
  let data:unknown;
  try{data=(await runtime.client.requestAgentControl(runtime.instance,'/api/agent-control/v1/active-context',{accessToken:runtime.accessToken})).data;}
  catch(error){if(error&&typeof error==='object'&&'status'in error&&error.status===404)throw new CanvasError('ACTIVE_CONTEXT_UNSUPPORTED','此画布版本暂不支持桌面定位。请按名称选择目标画布，或通过画布自身升级后重新检测。');throw error;}
  return parseCanvasActiveContext(data,runtime.instance.instanceId);
}
