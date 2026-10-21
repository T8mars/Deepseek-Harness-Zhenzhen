import {createHash} from 'node:crypto';
import {CanvasError} from './canvas.ts';
import type {CanvasConfig,CanvasWorkflowRuntime} from './canvas.ts';

/** Comparison identity only. It is neither a credential nor an approval. */
export function canvasTargetConnection(config:CanvasConfig,runtime:Pick<CanvasWorkflowRuntime,'instance'|'sessionId'|'actorId'|'scopes'>):string{
  return createHash('sha256').update('dsh-zhen-target-connection-v1\0').update(JSON.stringify([config.root,config.digest,config.instance,runtime.instance.instanceId,runtime.instance.origin,runtime.sessionId,runtime.actorId,[...runtime.scopes].sort()])).digest('hex');
}
export function assertCanvasTargetConnection(expected:string|undefined,config:CanvasConfig,runtime:CanvasWorkflowRuntime):void{
  // Older clients have no selection identity; new target directories always supply it.
  if(expected===undefined)return;
  const current=runtime.store.loadSession(runtime.instance.instanceId);
  if(!/^[a-f0-9]{64}$/.test(expected)||canvasTargetConnection(config,runtime)!==expected||!current||current.sessionId!==runtime.sessionId||current.origin!==runtime.instance.origin||current.accessToken!==runtime.accessToken||!Number.isFinite(Date.parse(current.expiresAt))||Date.parse(current.expiresAt)<=Date.now())throw new CanvasError('TARGET_CONNECTION_CHANGED','画布实例或配对已变化。请重新读取目标画布，再核对方案；本次操作未继续，也不会自动重试。');
}
/** Keep the original CLI request/auth behavior and check identity around each await. */
export function canvasTargetRuntime(config:CanvasConfig,runtime:CanvasWorkflowRuntime,expected:string|undefined):CanvasWorkflowRuntime{
  if(expected===undefined)return runtime;
  assertCanvasTargetConnection(expected,config,runtime);
  const request=runtime.client.requestAgentControl.bind(runtime.client),client:CanvasWorkflowRuntime['client']={...runtime.client,requestAgentControl:async(...args)=>{assertCanvasTargetConnection(expected,config,runtime);const value=await request(...args);assertCanvasTargetConnection(expected,config,runtime);return value;}};
  return {...runtime,client};
}
