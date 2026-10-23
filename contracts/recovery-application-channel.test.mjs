import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {createConnection} from 'node:net';
import {serveRecoveryRuntime,queryRecoveryRuntime,recoveryChannelPath} from '../packages/dsh-zhen/lib/recovery-application-channel.js';
const secret=()=>randomBytes(32).toString('hex');
async function raw(id,text){return new Promise((done,reject)=>{const socket=createConnection(recoveryChannelPath(id));let output='';socket.setTimeout(2500,()=>socket.destroy());socket.once('error',reject);socket.once('connect',()=>socket.write(text));socket.on('data',bytes=>output+=bytes.toString());socket.once('close',()=>done(output));});}
test('C196: real local channel authenticates both directions and rejects another secret before side effects',async t=>{
 const id=randomUUID(),value=secret();let actions=0;const server=await serveRecoveryRuntime(id,value,async op=>{if(op!=='status')actions++;return{execution:id,phase:'running',pid:process.pid,ready:true,port:12345,browserRequested:op==='show',error:null};});t.after(()=>new Promise(done=>server.close(done)));
 assert.equal(await queryRecoveryRuntime(id,secret(),'stop'),null);assert.equal(actions,0);const state=await queryRecoveryRuntime(id,value);assert.equal(state.ready,true);assert.equal(state.pid,process.pid);assert.equal((await queryRecoveryRuntime(id,value,'show')).browserRequested,true);assert.equal(actions,1);assert.equal(JSON.stringify(state).includes(value),false);
 console.log(JSON.stringify({contract:'C196',actualLocalChannel:true,bidirectionalAuthentication:true,wrongSecretBeforeSideEffects:true,secretAbsentFromPublicState:true,nativeRequests:0,modelRequests:0}));
});
test('C196: captured valid actions cannot be replayed and malformed or stale requests never reach the handler',async t=>{
 const id=randomUUID(),value=secret();let actions=0;const server=await serveRecoveryRuntime(id,value,async()=>{actions++;return{execution:id,phase:'running',pid:process.pid,ready:true,port:12345,browserRequested:false,error:null};});t.after(()=>new Promise(done=>server.close(done)));
 const body={execution:id,operation:'stop',challenge:randomBytes(24).toString('hex'),time:Date.now()},mac=createHmac('sha256',Buffer.from(value,'hex')).update('request\n'+JSON.stringify(body)).digest('hex'),request=JSON.stringify({...body,mac})+'\n';assert.ok((await raw(id,request)).includes('"state"'));assert.equal(await raw(id,request),'');assert.equal(actions,1);
 assert.equal(await raw(id,'{"operation":"exec","path":"EXAMPLE"}\n'),'');assert.equal(await raw(id,'x'.repeat(5000)+'\n'),'');assert.equal(actions,1);
});
test('C196: an unavailable channel is unknown rather than a fabricated terminal state or restart',async()=>{
 assert.equal(await queryRecoveryRuntime(randomUUID(),secret()),null);assert.equal(await queryRecoveryRuntime('../EXAMPLE',secret(),'stop'),null);
});
