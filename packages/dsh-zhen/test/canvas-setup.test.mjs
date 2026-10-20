import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {exampleCanvasInstall} from '../../../contracts/fixtures/canvas-install.mjs';
import {discoverCanvasSetup} from '../lib/canvas-desktop-discovery.js';
import {CanvasBridge,inspectCanvasCli,safeCanvasError} from '../lib/canvas.js';
function fixture(t){const base=realpathSync.native(mkdtempSync(join(tmpdir(),'dsh-setup-EXAMPLE-')));t.after(()=>{const rel=relative(realpathSync.native(tmpdir()),base);assert.ok(rel&&!isAbsolute(rel)&&!rel.startsWith('..'));rmSync(base,{recursive:true,force:true});});return{base,...exampleCanvasInstall(base)};}
test('setup prefers bundled tools from the running desktop in a Chinese custom path without executing either CLI',async t=>{
 const f=fixture(t),app=join(f.base,'EXAMPLE 安装 空格'),root=join(app,'resources','tools','zcanvas-cli');mkdirSync(join(root,'src'),{recursive:true});
 for(const file of ['manifest.json','src/agentClient.cjs','src/discovery.cjs','src/secureStore.cjs'])copyFileSync(join(f.root,file),join(root,file));
 const desktopPaths=async()=>[join(app,'T8-PenguinCanvas.exe'),join(app,'T8-PenguinCanvas.exe'),'EXAMPLE_INVALID',join(app,'EXAMPLE_OTHER.exe')];
 const found=await discoverCanvasSetup({desktopPaths,managed:f.options});assert.equal(found.candidates.length,2);assert.equal(found.candidates[0].source,'running-desktop');assert.equal(found.candidates[0].root,realpathSync.native(root));assert.equal(found.candidates[1].source,'managed');assert.deepEqual(found.issues,[]);
});
test('OS discovery failure and missing desktop resources preserve managed fallback with fixed private-free explanations',async t=>{
 const f=fixture(t);for(const desktopPaths of [async()=>{throw Error('EXAMPLE_PRIVATE_SECRET');},async()=>[join(f.base,'EXAMPLE_MISSING','T8-PenguinCanvas.exe')]]){
  const result=await discoverCanvasSetup({desktopPaths,managed:f.options});assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].source,'managed');assert.equal(result.issues.length,1);assert.equal(JSON.stringify(result).includes('EXAMPLE_PRIVATE_SECRET'),false);
 }
});
const one={instanceId:'EXAMPLE_ONE',origin:'http://127.0.0.1:12345',appVersion:'3.3.7'},two={...one,instanceId:'EXAMPLE_TWO',origin:'http://127.0.0.1:12346'};
for(const scenario of [
 {name:'ready',live:[one],state:'ready',code:'COMPATIBLE'},
 {name:'closed',live:[],state:'not-running',code:'APP_NOT_RUNNING'},
 {name:'multiple',live:[one,two],state:'choose-instance',code:'APP_INSTANCE_AMBIGUOUS'},
 {name:'restarted',live:[one],selected:'EXAMPLE_OLD',state:'choose-instance',code:'INSTANCE_CHANGED'},
 {name:'selected current',live:[one,two],selected:'EXAMPLE_ONE',state:'ready',code:'COMPATIBLE'},
 {name:'graph mismatch',live:[one],error:'CREATIVE_CAPABILITY_GRAPH_DIGEST_MISMATCH',state:'incompatible',code:'CREATIVE_CAPABILITY_GRAPH_DIGEST_MISMATCH'},
 {name:'timeout',live:[one],error:'AGENT_CONTROL_TIMEOUT',state:'error',code:'AGENT_CONTROL_TIMEOUT'},
])test('connection guide '+scenario.name+' uses native handshake without reading pairing credentials',async t=>{
 const f=fixture(t);writeFileSync(join(f.root,'src/discovery.cjs'),`exports.discoverInstances=async()=>${JSON.stringify(scenario.live)};`);
 writeFileSync(join(f.root,'src/secureStore.cjs'),"exports.loadSession=()=>{throw Error('EXAMPLE_MUST_NOT_READ_SESSION');};");
 writeFileSync(join(f.root,'src/agentClient.cjs'),`exports.selectInstance=async()=>{${scenario.error?`const error=new Error('EXAMPLE_PRIVATE_TRANSPORT');error.code=${JSON.stringify(scenario.error)};throw error;`:`return ${JSON.stringify(one)};`}};exports.requestAgentControl=async()=>({ok:true,data:{pairingRequired:true,EXAMPLE_RAW:true}});`);
 const bridge=new CanvasBridge(inspectCanvasCli(f.root,scenario.selected??'')),result=await bridge.connectionCheck();assert.equal(result.state,scenario.state);assert.equal(result.code,scenario.code);assert.equal(JSON.stringify(result).includes('EXAMPLE_PRIVATE_TRANSPORT'),false);
 if(scenario.error){const status=await bridge.status();assert.equal(status.connected,true);assert.deepEqual(status.compat,{pairingRequired:true,EXAMPLE_RAW:true});}
 if(scenario.state==='choose-instance')assert.equal(result.instances.length,scenario.live.length);
});
test('reviewed CLI changes refuse before loading new code and every native digest mismatch gets an actionable safe message',async t=>{
 const f=fixture(t),config=inspectCanvasCli(f.root);writeFileSync(join(f.root,'src/agentClient.cjs'),"throw Error('EXAMPLE_UNREVIEWED_MUST_NOT_EXECUTE');");
 assert.equal((await new CanvasBridge(config).connectionCheck()).state,'needs-review');
 for(const code of ['AGENT_SKILL_VERSION_MISMATCH','AGENT_CLI_VERSION_MISMATCH','CANVAS_PATCH_PROTOCOL_MISMATCH','NODE_SCHEMA_DIGEST_MISMATCH','PROVIDER_CATALOG_DIGEST_MISMATCH','CREATIVE_CAPABILITY_MANIFEST_DIGEST_MISMATCH','CREATIVE_CAPABILITY_GRAPH_DIGEST_MISMATCH','AGENT_MANIFEST_DIGEST_MISMATCH']){
  const error=safeCanvasError(Object.assign(new Error('EXAMPLE_PRIVATE_TRANSPORT'),{code}));assert.equal(error.code,code);assert.match(error.message,/重新检测/);assert.equal(error.message.includes('EXAMPLE_PRIVATE'),false);
 }
});
