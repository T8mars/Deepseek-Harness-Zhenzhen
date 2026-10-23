import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import net from 'node:net';import tls from 'node:tls';
const input=JSON.parse(await readFile(process.argv[2],'utf8'));assert.equal(process.env.DSH_HOME,input.home);assert.equal(process.env.DSH_AGENTS_HOME,input.agentsHome);assert.equal(process.cwd(),input.cwd);
let blocked=0;globalThis.fetch=async()=>{blocked++;throw Error('EXAMPLE_OFFLINE_FETCH');};
function guard(original){return function(...args){const value=args[0],host=typeof value==='object'&&value?value.host:typeof args[1]==='string'?args[1]:undefined;if(typeof value==='object'&&value?.path||['127.0.0.1','localhost','::1'].includes(host))return original.apply(this,args);blocked++;throw Error('EXAMPLE_OFFLINE_SOCKET');};}
net.connect=guard(net.connect);net.createConnection=guard(net.createConnection);tls.connect=guard(tls.connect);syncBuiltinESMExports();
const {runProfile}=await import('@deepseek-ai/dsh/profile-boot'),{createLaunchEnvironmentSnapshot}=await import('@deepseek-ai/dsh-launch-environment');let ctx,report;
try{
 ({ctx}=await runProfile({environment:createLaunchEnvironmentSnapshot([{source:'process',values:{DSH_HOME:input.home,DSH_AGENTS_HOME:input.agentsHome,DSH_TELEMETRY_DISABLED:'1'}}]),profile:input.profile,patchFiles:input.patchFiles??[],args:['--host','127.0.0.1','--port','0','--no-open']}));
 const services=Object.fromEntries(['sessionPersistence','attachments','workspaceRegistry','sessionController','workspaceController','configEditor','webServer',...input.requiredServices??[]].map(name=>[name,!!ctx.get(name)]));for(const[name,value]of Object.entries(services))assert.equal(value,true,name);
 assert.equal(ctx.webServer.host,'127.0.0.1');assert.equal(ctx.webServer.protocol,'http:');assert.ok(ctx.webServer.port>0);assert.equal(ctx.get('schedule'),undefined);
 const model=ctx.configEditor.entries().find(row=>row.options.name==='@deepseek-ai/dsh-agent-default-model');assert.ok(model);
 const before=model.options.config?.model??null;if(input.expectedModel)assert.equal(before,input.expectedModel);
 if(input.editModel)await ctx.configEditor.edit(model,current=>({...current,model:input.editModel}));
 report={passed:true,services,normalProfileWithoutCliOverlays:true,modelBefore:before,modelEdited:input.editModel??null,workspaceRegistryReady:true,sessionAndWorkspaceControllersReady:true,schedulePaused:true,blockedOutboundAttempts:blocked,nativeRequests:0,modelRequests:0};
}catch(error){report={passed:false,errorCode:typeof error.code==='string'?error.code:'EXAMPLE_ACTIVATION_BOOT_FAILED',message:String(error.message).slice(0,450),blockedOutboundAttempts:blocked};process.exitCode=1;}
finally{await ctx?.fiber.dispose();await writeFile(input.output,JSON.stringify(report)+'\n',{flag:'wx'});}
