import type {ZhenRemote} from 'dsh-zhen/remote';

type TargetApi=Pick<ZhenRemote,'canvasWorkspaces'|'canvasActiveTargets'|'canvasWorkflowModels'|'canvasWorkflowAssets'|'canvasWorkflowPreview'|'canvasRunNodes'|'canvasRunQuote'|'canvasTasksList'|'canvasTaskDetail'|'canvasTransferPreview'>;
function available(method:unknown):void{if(typeof method!=='function')throw Error('画布连接版本已变化。请刷新 DSH 界面后重新读取目标画布。');}
function directory(value:{canvases:Array<{connectionId?:string}>}):void{if(value.canvases.some(canvas=>!canvas.connectionId||!/^[a-f0-9]{64}$/.test(canvas.connectionId))||new Set(value.canvases.map(canvas=>canvas.connectionId)).size>1)throw Error('画布连接信息不完整。请刷新 DSH 界面后重新读取目标画布。');}
/** New directories carry a connection identity; old hosts keep their existing route. */
export function canvasTargetApi(api:ZhenRemote,connectionId?:string):TargetApi{
  return {
    canvasWorkspaces:async()=>{if(typeof api.canvasTargetWorkspaces!=='function')return api.canvasWorkspaces();const result=await api.canvasTargetWorkspaces();if(result.ok)directory(result.value);return result;},
    canvasActiveTargets:async()=>{if(typeof api.canvasTargetActive!=='function')return api.canvasActiveTargets();const result=await api.canvasTargetActive();if(result.ok)directory(result.value.workspaces);return result;},
    canvasWorkflowModels:input=>{if(connectionId!==undefined){available(api.canvasTargetModels);return api.canvasTargetModels(input,connectionId);}return api.canvasWorkflowModels(input);},
    canvasWorkflowAssets:input=>{if(connectionId!==undefined){available(api.canvasTargetAssets);return api.canvasTargetAssets(input,connectionId);}return api.canvasWorkflowAssets(input);},
    canvasWorkflowPreview:input=>{if(connectionId!==undefined){available(api.canvasTargetWorkflowPreview);return api.canvasTargetWorkflowPreview(input,connectionId);}return api.canvasWorkflowPreview(input);},
    canvasRunNodes:(projectId,canvasId,offset=0)=>{if(connectionId!==undefined){available(api.canvasTargetRunNodes);return api.canvasTargetRunNodes(projectId,canvasId,offset,connectionId);}return api.canvasRunNodes(projectId,canvasId,offset);},
    canvasRunQuote:selection=>{if(connectionId!==undefined){available(api.canvasTargetRunQuote);return api.canvasTargetRunQuote(selection,connectionId);}return api.canvasRunQuote(selection);},
    canvasTasksList:scope=>{if(connectionId!==undefined){available(api.canvasTargetTasksList);return api.canvasTargetTasksList(scope,connectionId);}return api.canvasTasksList(scope);},
    canvasTaskDetail:reference=>{if(connectionId!==undefined){available(api.canvasTargetTaskDetail);return api.canvasTargetTaskDetail(reference,connectionId);}return api.canvasTaskDetail(reference);},
    canvasTransferPreview:input=>{if(connectionId!==undefined){available(api.canvasTargetTransferPreview);return api.canvasTargetTransferPreview(input,connectionId);}return api.canvasTransferPreview(input);},
  };
}
