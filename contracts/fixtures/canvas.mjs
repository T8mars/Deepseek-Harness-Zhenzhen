// Synthetic CLI transport around immutable public Canvas contract facts.
// No Canvas database, user data, real pairing, provider or paid call is used.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { inspectCanvasCli, CanvasBridge } from '../../packages/dsh-zhen/lib/canvas.js';
import { projectCanvasSurfaces } from '../../packages/dsh-zhen/lib/canvas-contract.js';
export const canvasFacts = JSON.parse(readFileSync(new URL('./canvas-surface-facts.json', import.meta.url)));
export const canvasCatalog = projectCanvasSurfaces(canvasFacts);
export async function canvasFixture() {
  const temp = realpathSync.native(tmpdir()), root = mkdtempSync(join(temp, 'dsh-zhen-canvas-contract-'));
  mkdirSync(join(root,'src')); mkdirSync(join(root,'generated'));
  writeFileSync(join(root,'manifest.json'),JSON.stringify({schema:'t8-zcanvas-manifest-v1',controlProtocol:'t8-agent-control-v1',nodeSchemaDigest:'a'.repeat(64)}));
  writeFileSync(join(root,'generated/creative-capability-surfaces.json'),JSON.stringify(canvasFacts));
  writeFileSync(join(root,'src/discovery.cjs'),"exports.discoverInstances=async()=>[{instanceId:'EXAMPLE_ONLY_INSTANCE',origin:'http://127.0.0.1:1'}];");
  writeFileSync(join(root,'src/secureStore.cjs'),"exports.loadSession=()=>({accessToken:'EXAMPLE_ONLY_TOKEN',expiresAt:require('./agentClient.cjs').state.expired?'EXAMPLE_INVALID_EXPIRY':'2099-01-01T00:00:00Z'});");
  writeFileSync(join(root,'src/agentClient.cjs'),`
const catalog=${JSON.stringify(canvasCatalog)};
exports.state={calls:[],handshakes:0,mode:'good',expired:false};
exports.selectInstance=async()=>{exports.state.handshakes++;return{instanceId:'EXAMPLE_ONLY_INSTANCE'};};
exports.requestAgentControl=async(instance,path,options={})=>{
  const state=exports.state;
  if(path==='/api/agent-control/v1/status')return{ok:true,data:{compat:{supported:true,fixture:'EXAMPLE_ONLY'}}};
  if(options.accessToken!=='EXAMPLE_ONLY_TOKEN')throw Error('EXAMPLE_ONLY_SECURE_STORE_MISSING');
  state.calls.push({path,method:options.method||'GET',body:options.body});
  if(path==='/api/agent-control/v1/capability-tools'){
    const copy=structuredClone(catalog);
    if(state.mode==='catalog-hash')copy.capabilityManifestDigest='0'.repeat(64);
    if(state.mode==='catalog-scope')copy.tools[0].operations[0].requiredScopes=['canvas:write'];
    return{ok:true,data:copy};
  }
  if(options.method!=='POST')throw Error('EXAMPLE_ONLY_METHOD_REFUSED');
  if(state.mode==='post-failure')throw Object.assign(Error('EXAMPLE_ONLY_TRANSPORT_DETAIL'),{code:'AGENT_CONTROL_TIMEOUT'});
  const request=options.body;
  if(path==='/api/agent-control/v1/tools'){
    return{ok:true,data:{schema:'t8-canvas-agent-tool-result-v1',tool:request.tool,requestId:request.requestId,projectId:request.projectId,canvasId:state.mode==='wrong-scope'?'EXAMPLE_OTHER_CANVAS':request.canvasId,canvasRevision:7,actorId:'EXAMPLE_ACTOR',role:'agent',authority:{readOnly:true},nodeSchemaDigest:'a'.repeat(64),readOnly:true,truncated:false,data:{items:[]},digest:'b'.repeat(64)}};
  }
  if(path!=='/api/agent-control/v1/capability-tools/invoke')throw Error('EXAMPLE_ONLY_ROUTE_REFUSED');
  const tool=catalog.tools.find(tool=>tool.name===request.tool),policy=tool.operations.find(operation=>operation.operation===request.operation);
  return{ok:true,data:{schema:'t8-versioned-creative-tool-result-v1',tool:{name:request.tool,version:request.version,capabilityId:tool.capabilityId,operation:request.operation,requestAction:tool.capabilityId},contract:{protocol:catalog.protocol,capabilityManifestDigest:catalog.capabilityManifestDigest,capabilityGraphDigest:catalog.capabilityGraphDigest,riskLevel:'L0',approvalRequired:false,requiredScopes:policy.requiredScopes},request:{clientRequestId:request.clientRequestId||null,projectId:request.projectId,canvasId:state.mode==='wrong-scope'?'EXAMPLE_OTHER_CANVAS':request.canvasId},readOnly:true,directInternalAccess:false,sideEffects:{canvasWrites:0,providerCalls:state.mode==='paid-result'?1:0,fileWrites:0},data:{planId:'EXAMPLE_ONLY_PLAN',ready:true,cost:{known:false},...(state.mode==='secret-data'?{accessToken:'EXAMPLE_ONLY_HIDDEN_TOKEN',url:'https://EXAMPLE_USER:EXAMPLE_PASSWORD@example.invalid/output#EXAMPLE_SECRET_FRAGMENT'}:{})}}};
};`);
  const config=inspectCanvasCli(root),bridge=new CanvasBridge(config);
  await bridge.status();
  const module=createRequire(import.meta.url)(join(root,'src/agentClient.cjs'));
  return {root,config,bridge,state:module.state,dispose(){const absolute=realpathSync.native(root),rel=relative(temp,absolute);if(!rel||isAbsolute(rel)||rel.startsWith('..')||rel.includes('/')||rel.includes('\\'))throw Error('Fixture cleanup refused.');rmSync(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:100});}};
}
