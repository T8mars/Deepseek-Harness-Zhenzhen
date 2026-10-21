import test from 'node:test';import assert from 'node:assert/strict';
import {CanvasBridge,inspectCanvasCli} from '../packages/dsh-zhen/lib/canvas.js';
import {canvasPairingFixture} from './fixtures/canvas-pairing.mjs';
import {writeFileSync} from 'node:fs';import {join} from 'node:path';import {createServer} from 'node:http';
// Exceed the real Node22 default five-second idle deadline plus its one-second buffer.
// An unrealistically short advertised deadline makes fetch disable pooling itself.
const pause=()=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,6200);

test('C74: pairing survives an idle socket deadline while the event loop is blocked, without replay',async()=>{
  const f=await canvasPairingFixture(),connections=[];f.server.keepAliveTimeout=5000;f.server.keepAliveTimeoutBuffer=1000;
  f.state.route=req=>{connections.push(req.headers.connection);};
  try{
    const bridge=new CanvasBridge(f.config());assert.equal((await bridge.status()).connected,true);
    assert.equal((await f.pairing.begin()).state,'pending');f.approve();pause();
    assert.equal((await f.pairing.complete()).state,'paired');assert.equal((await bridge.read('workspaces')).projects[0].id,'EXAMPLE_EMPTY_PROJECT');
    assert.ok(connections.length>=5&&connections.every(value=>value==='close'));
    assert.equal(f.state.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/pairings')).length,1);assert.equal(f.state.requests.filter(r=>r.path.endsWith('/poll')).length,1);
  }finally{await f.dispose();}
});
test('C74: an accepted pairing POST with a lost response remains single attempt',async()=>{
  const f=await canvasPairingFixture();try{
    f.state.dropCreate=true;await assert.rejects(f.pairing.begin());await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(f.state.created.length,1);assert.equal(f.state.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/pairings')).length,1);
  }finally{await f.dispose();}
});
test('C74: discovery hooks and control calls use fresh sockets even with a stale shared fetch pool',async()=>{
  const f=await canvasPairingFixture(),connections=[];f.server.keepAliveTimeout=5000;f.server.keepAliveTimeoutBuffer=1000;
  f.state.route=req=>{connections.push({header:req.headers.connection,socket:req.socket});};
  try{
    // Owned TEMP shim exercises the original native selectInstance's documented
    // discoveryOptions forwarding; no installed CLI or registry is modified.
    writeFileSync(join(f.root,'src/discovery.cjs'),`const descriptor=${JSON.stringify(f.state.descriptor)};exports.discoverInstances=async(options={})=>{const r=await(options.fetch||globalThis.fetch)(descriptor.origin+'/api/agent-control/v1/status',{method:'GET',redirect:'error'});await r.text();return r.ok?[descriptor]:[];};`);
    f.changeConfig(inspectCanvasCli(f.root));
    const warm=await fetch(f.state.descriptor.origin+'/api/agent-control/v1/status');await warm.text();pause();
    const bridge=new CanvasBridge(f.config());assert.equal((await bridge.status()).connected,true);await bridge.connectionCheck();
    const own=connections.slice(1);assert.ok(own.length>=3&&own.every(c=>c.header==='close'));assert.equal(new Set(own.map(c=>c.socket)).size,own.length);
  }finally{await f.dispose();}
});
test('C74: single-use transport keeps native redirect, response-size and abort barriers',async()=>{
  const f=await canvasPairingFixture(),seen=[];
  const server=createServer((req,res)=>{
    seen.push(req.url);
    if(req.url.endsWith('ECHO')){let text='';req.setEncoding('utf8');req.on('data',part=>text+=part);req.on('end',()=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({schema:'t8-agent-control-http-v1',ok:true,data:{text:JSON.parse(text).text,method:req.method,authorized:!!req.headers.authorization,encoding:req.headers['accept-encoding']}}));});return;}
    if(req.url.endsWith('REDIRECT')){res.writeHead(302,{location:'/EXAMPLE_MUST_NOT_FOLLOW'});res.end();return;}
    if(req.url.endsWith('LARGE')){res.writeHead(200,{'content-type':'application/json'});res.write('x'.repeat(256*1024));res.end('xx');return;}
    if(req.url.endsWith('BODY_ABORT')){res.writeHead(200,{'content-type':'application/json'});res.write('{');}
    const timer=setTimeout(()=>res.end('{}'),1000);res.once('close',()=>clearTimeout(timer));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const runtime=await new CanvasBridge(f.config()).pairingRuntime(),instance={...runtime.instance,origin:'http://127.0.0.1:'+server.address().port};
    assert.deepEqual((await runtime.client.requestAgentControl(instance,'/api/agent-control/v1/EXAMPLE_ECHO',{method:'POST',body:{text:'中文 🐧 EXAMPLE_ONLY'},accessToken:'EXAMPLE_NON_SECRET'})).data,{text:'中文 🐧 EXAMPLE_ONLY',method:'POST',authorized:true,encoding:'identity'});
    for(const [name,code]of [['REDIRECT','APP_CONNECTION_FAILED'],['LARGE','AGENT_CONTROL_RESPONSE_TOO_LARGE'],['WAIT_ABORT','AGENT_CONTROL_TIMEOUT'],['BODY_ABORT','AGENT_CONTROL_TIMEOUT']])await assert.rejects(runtime.client.requestAgentControl(instance,'/api/agent-control/v1/EXAMPLE_'+name,{timeoutMs:250}),e=>e.code===code);
    assert.equal(seen.length,5);assert.equal(seen.includes('/EXAMPLE_MUST_NOT_FOLLOW'),false);
  }finally{await new Promise(resolve=>server.close(resolve));await f.dispose();}
});
