export const activeCanvasExample=(instanceId='EXAMPLE_INSTANCE',options={})=>{
 const observedAt=new Date().toISOString();
 return{schema:'t8-agent-active-context-v1',instanceId,status:'resolved',resolution:'single-window',activeWindowId:'1',observedAt,truncated:false,
  candidates:[{windowId:'1',windowReady:true,rendererReady:true,focused:false,projectId:'EXAMPLE_PROJECT',canvasId:'EXAMPLE_CANVAS',revision:7,reason:'ready',observedAt}],...options};
};
