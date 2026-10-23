import {readFile,realpath,lstat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Context} from '@deepseek-ai/cordis';
import type {Server} from 'node:net';
import {serveRecoveryRuntime,recoveryRuntimeConfig} from './recovery-application-channel.ts';
import type {RecoveryRuntimeState} from './recovery-application-channel.ts';
import {SUPPORTED_DSH} from './compatibility.ts';

export const name='dsh-zhen-recovery-runtime';
export const inject=['loader','profileContext','appReady'];
const inside=(root:string,path:string)=>{const part=relative(root,path);return isAbsolute(path)&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\');};
const same=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
async function directory(root:string,path:string):Promise<void>{if(!isAbsolute(root)||!inside(root,path))throw Error('RUNTIME_BOUNDARY');let current=path;for(;;){const stat=await lstat(current);if(!stat.isDirectory()||stat.isSymbolicLink()||!same(await realpath(current),current))throw Error('RUNTIME_BOUNDARY');if(same(root,current))return;const next=dirname(current);if(next===current)throw Error('RUNTIME_BOUNDARY');current=next;}}
async function openBrowser(ctx:Context):Promise<boolean>{
 const web=ctx.get('webServer') as unknown as {host:string;getOrigin():string},app=ctx.get('webApp') as {getAdvertisedUrl():string}|undefined,connection=ctx.get('connection') as {authenticatedUrl(url:string):string}|undefined;
 if(!app||!connection||web.host!=='127.0.0.1')return false;const origin=web.getOrigin(),url=connection.authenticatedUrl(app.getAdvertisedUrl());if(new URL(url).origin!==origin||new URL(origin).hostname!=='127.0.0.1')return false;
 const executable=process.platform==='win32'?join(process.env.SystemRoot??'C:\\Windows','System32','rundll32.exe'):process.platform==='darwin'?'/usr/bin/open':'/usr/bin/xdg-open',args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
 return await new Promise<boolean>(resolve=>{const child=spawn(executable,args,{windowsHide:true,stdio:'ignore',shell:false});child.once('error',()=>resolve(false));child.once('spawn',()=>{child.unref();resolve(true);});});
}
/** Ordinary A-layer plugin, loaded by the exact public SDK CLI. It imports no
 * second framework or bootstrap kernel. Only fresh initialization travels over
 * spawn IPC; retained status/show/stop use the authenticated own local socket. */
export function apply(ctx:Context,raw:unknown):void{
 const config=recoveryRuntimeConfig.parse(raw),scope=ctx.get('profileContext') as {name:string;home:string;installAnchor:string};
 if(!process.send||scope.name!==config.profile||scope.home!==config.home||scope.installAnchor!==config.installAnchor)throw Error('RECOVERY_RUNTIME_SCOPE');
 const state:RecoveryRuntimeState={execution:config.execution,phase:'starting',pid:process.pid,ready:false,port:null,browserRequested:false,error:null};
 let server:Server|undefined,closing:Promise<void>|undefined,stopping:Promise<void>|undefined,active=true,initialized=false;
 const announce=()=>{if(process.connected)process.send?.({execution:config.execution,state:{...state}},()=>{});};
 const closeChannel=()=>closing??=(async()=>{if(server)await new Promise<void>(done=>server!.close(()=>done()));})();
 const stop=()=>stopping??=(async()=>{state.phase='stopping';state.ready=false;announce();const force=setTimeout(()=>process.exit(1),15000);force.unref();try{await ctx.root.fiber.dispose();state.phase='exited';announce();if(process.connected)process.disconnect?.();clearTimeout(force);}catch{state.phase='failed';state.error='BACKUP_APPLICATION_STOP_FAILED';announce();process.exitCode=1;}})();
 const initSchema=z.object({execution:z.literal(config.execution),secret:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
 const timeout=setTimeout(()=>{if(!initialized){state.phase='failed';state.error='BACKUP_APPLICATION_START_FAILED';announce();void stop();}},10000);timeout.unref();
 const receive=(message:unknown)=>{if(initialized)return;const parsed=initSchema.safeParse(message);if(!parsed.success)return;initialized=true;clearTimeout(timeout);process.off('message',receive);
  void (async()=>{let stage='VERIFY';try{
   for(const path of[config.home,config.agentsHome,config.cwd,config.bundleDirectory])await directory(config.root,path);
   const metadata=JSON.parse(await readFile(config.installAnchor,'utf8'));if(metadata.name!=='@deepseek-ai/dsh'||metadata.version!==SUPPORTED_DSH||!same(process.cwd(),config.cwd)||process.env.DSH_HOME!==config.home||process.env.DSH_AGENTS_HOME!==config.agentsHome)throw Error('RECOVERY_RUNTIME_SCOPE');
   if(createHash('sha256').update(await readFile(join(config.bundleDirectory,'cordis.patch.yml'))).digest('hex')!==config.bundleDigest)throw Error('RECOVERY_RUNTIME_CONFIG_CHANGED');if(!active)return;
   stage='CHANNEL';server=await serveRecoveryRuntime(config.execution,parsed.data.secret,async operation=>{if(operation==='show'&&state.phase==='running')state.browserRequested=await openBrowser(ctx);if(operation==='stop'){state.phase='stopping';setTimeout(()=>void stop(),25);}return{...state};});if(!active){await closeChannel();return;}announce();
   stage='CORE';await new Promise<void>(done=>{const ready=ctx.get('appReady') as {onReady(listener:()=>void):()=>void};ctx.effect(()=>ready.onReady(done),'zhen: recovered public launcher ready');});if(!active)return;
   for(const key of[...config.requiresZhen?['zhen']:[],'sessions','sessionPersistence','attachments','workspaceRegistry','sessionController','workspaceController','configEditor','webServer','webApp','connection'])if(!ctx.get(key)){stage='CORE_'+key.replace(/[A-Z]/g,value=>'_'+value).toUpperCase();throw Error('RECOVERY_CORE_NOT_READY');}
   stage='LISTENER';const web=ctx.get('webServer') as unknown as {host:string;protocol:string;port:number};if(web.host!=='127.0.0.1'||web.protocol!=='http:'||!Number.isSafeInteger(web.port)||web.port<1)throw Error('RECOVERY_LISTENER_INVALID');
   state.port=web.port;state.ready=true;state.phase='running';if(config.openBrowser)state.browserRequested=await openBrowser(ctx);announce();
  }catch{state.phase='failed';state.ready=false;state.error='BACKUP_APPLICATION_'+stage+'_FAILED';announce();void stop();}})();
 };
 process.on('message',receive);ctx.effect(()=>()=>{active=false;clearTimeout(timeout);process.off('message',receive);return closeChannel();},'zhen: recovered application local control');
 if(process.connected)process.send?.({kind:'recovery/init',execution:config.execution},()=>{});
}
