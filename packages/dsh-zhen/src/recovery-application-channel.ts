import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {createServer,createConnection} from 'node:net';
import type {Server} from 'node:net';
import {chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {z} from 'zod';
import {recoveryApplicationPhase} from './recovery-application-schema.ts';

export const recoveryRuntimePhase=recoveryApplicationPhase;
export const recoveryRuntimeState=z.object({execution:z.uuid(),phase:recoveryRuntimePhase,pid:z.number().int().positive(),ready:z.boolean(),port:z.number().int().min(1).max(65535).nullable(),browserRequested:z.boolean(),error:z.string().regex(/^BACKUP_[A-Z_]+$/).nullable()}).strict();
export type RecoveryRuntimeState=z.infer<typeof recoveryRuntimeState>;
export type RecoveryRuntimeOperation='status'|'show'|'stop';
export const recoveryRuntimeInput=z.object({schema:z.literal('dsh-zhen-recovery-runtime-v1'),execution:z.uuid(),secret:z.string().regex(/^[a-f0-9]{64}$/),root:z.string().min(1).max(4096),home:z.string().min(1).max(4096),agentsHome:z.string().min(1).max(4096),cwd:z.string().min(1).max(4096),installAnchor:z.string().min(1).max(4096),profile:z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),bundleDirectory:z.string().min(1).max(4096),bundleDigest:z.string().regex(/^[a-f0-9]{64}$/),requiresZhen:z.boolean(),openBrowser:z.boolean()}).strict();
export type RecoveryRuntimeInput=z.infer<typeof recoveryRuntimeInput>;
export const recoveryRuntimeConfig=recoveryRuntimeInput.omit({secret:true});
const requestBody=z.object({execution:z.uuid(),operation:z.enum(['status','show','stop']),challenge:z.string().regex(/^[a-f0-9]{48}$/),time:z.number().int().nonnegative()}).strict();
const requestSchema=requestBody.extend({mac:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const responseBody=z.object({challenge:z.string().regex(/^[a-f0-9]{48}$/),state:recoveryRuntimeState}).strict();
const responseSchema=responseBody.extend({mac:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const secretSchema=z.string().regex(/^[a-f0-9]{64}$/);
function sign(secret:string,prefix:string,value:unknown):string{return createHmac('sha256',Buffer.from(secretSchema.parse(secret),'hex')).update(prefix+'\n'+JSON.stringify(value)).digest('hex');}
function matches(expected:string,actual:string):boolean{return timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(actual,'hex'));}
export function recoveryChannelPath(execution:string):string{z.uuid().parse(execution);return process.platform==='win32'?'\\\\.\\pipe\\dsh-zhen-recovery-'+execution:join(tmpdir(),'dshz-r-'+execution.replaceAll('-','').slice(0,20)+'.sock');}
/** Own application control only. No upstream Desktop or Native IPC is changed.
 * The secret is never sent on this socket: both directions authenticate fresh
 * challenges, and side-effecting requests cannot be replayed. */
export async function serveRecoveryRuntime(execution:string,secret:string,action:(operation:RecoveryRuntimeOperation)=>Promise<RecoveryRuntimeState>):Promise<Server>{
 secretSchema.parse(secret);const endpoint=recoveryChannelPath(execution),seen=new Map<string,number>();let connections=0;
 const server=createServer(socket=>{
  if(++connections>8){socket.destroy();connections--;return;}socket.once('close',()=>{connections--;});socket.setTimeout(2000,()=>socket.destroy());let buffer=Buffer.alloc(0),used=false;
  socket.on('error',()=>{});socket.on('data',chunk=>{if(used)return;buffer=Buffer.concat([buffer,chunk]);if(buffer.length>4096){used=true;socket.destroy();return;}const end=buffer.indexOf(10);if(end<0)return;used=true;
   void (async()=>{try{
    const parsed=requestSchema.parse(JSON.parse(buffer.subarray(0,end).toString('utf8'))),{mac,...body}=parsed;
    const now=Date.now();for(const [challenge,time]of seen)if(now-time>30000)seen.delete(challenge);
    if(body.execution!==execution||Math.abs(now-body.time)>30000||seen.has(body.challenge)||seen.size>=256||!matches(sign(secret,'request',body),mac)){socket.destroy();return;}
    seen.set(body.challenge,now);
    const state=recoveryRuntimeState.parse(await action(body.operation));if(state.execution!==execution)throw Error('INVALID_RUNTIME_ID');const reply={challenge:body.challenge,state};socket.end(JSON.stringify({...reply,mac:sign(secret,'response',reply)})+'\n');
   }catch{socket.destroy();}})();
  });
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(endpoint,()=>{server.off('error',reject);resolve();});});
 server.on('error',()=>{});try{if(process.platform!=='win32')await chmod(endpoint,0o600);return server;}catch(error){await new Promise<void>(done=>server.close(()=>done()));throw error;}
}
/** One authenticated request; failures are unknown state, never a restart. */
export async function queryRecoveryRuntime(execution:string,secret:string,operation:RecoveryRuntimeOperation='status'):Promise<RecoveryRuntimeState|null>{
 try{
  const body=requestBody.parse({execution,operation,challenge:randomBytes(24).toString('hex'),time:Date.now()}),request={...body,mac:sign(secret,'request',body)};
  return await new Promise<RecoveryRuntimeState|null>(resolve=>{
   const socket=createConnection(recoveryChannelPath(execution));let buffer=Buffer.alloc(0),settled=false;const finish=(result:RecoveryRuntimeState|null)=>{if(settled)return;settled=true;socket.destroy();resolve(result);};socket.setTimeout(2500,()=>finish(null));socket.once('error',()=>finish(null));socket.once('close',()=>finish(null));
   socket.once('connect',()=>socket.write(JSON.stringify(request)+'\n'));socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length>4096){finish(null);return;}const end=buffer.indexOf(10);if(end<0)return;try{const parsed=responseSchema.parse(JSON.parse(buffer.subarray(0,end).toString('utf8'))),{mac,...reply}=parsed;if(reply.challenge!==body.challenge||reply.state.execution!==execution||!matches(sign(secret,'response',reply),mac)){finish(null);return;}finish(reply.state);}catch{finish(null);}});
  });
 }catch{return null;}
}
