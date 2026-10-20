import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,appendFileSync,readdirSync,lstatSync,realpathSync,rmSync,existsSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Context} from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import {McpMarket} from '../packages/dsh-zhen/lib/mcp-market.js';
import {MCP_RECIPES} from '../packages/dsh-zhen/lib/mcp-market-schema.js';
import {CuratedMcpRuntime} from '../packages/dsh-zhen/lib/mcp-runtime.js';

// Actual published filesystem server and DSH ToolRuntime; exclusively EXAMPLE
// files/agent sessions in an owned TEMP tree. No model, user project or Canvas.
const args=process.argv.slice(2),name=args.length===0?'mcp-filesystem-maintenance-stdio.json':args.length===2&&args[0]==='--out-name'?args[1]:'';
if(!/^[a-zA-Z0-9-]+\.json$/.test(name))throw Error('Usage: node scripts/smoke-mcp-filesystem-maintenance.mjs [--out-name <new-name.json>]');
const output=resolve('.runtime/evidence',name);if(existsSync(output))throw Error('Evidence already exists; choose a new --out-name.');
const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-filesystem-maintenance-EXAMPLE-'))),workspace=join(root,'EXAMPLE_PROJECT'),outside=join(root,'EXAMPLE_OUTSIDE');mkdirSync(workspace);mkdirSync(outside);mkdirSync(join(workspace,'EXAMPLE_ASSETS'));
const sha=b=>createHash('sha256').update(b).digest('hex'),execute=promisify(execFile),recipe=MCP_RECIPES.filesystem,ctx=new Context(),market=new McpMarket(join(root,'EXAMPLE_MCP'));
let directory=workspace,credentials=0,calls=0,programEntry='',report;
const agent={session:{id:'EXAMPLE_INITIAL_SESSION'},options:{provider:'seedance'}};
ctx.provide('workingDirectory',{get:()=>directory,ensure:async()=>directory});ctx.provide('credentials',{resolve:async()=>{credentials++;throw Error('EXAMPLE_NO_CREDENTIAL_READ');}});
writeFileSync(join(workspace,'EXAMPLE_SEED.md'),'EXAMPLE ONLY\n示例资料保持不变。\n');writeFileSync(join(workspace,'EXAMPLE_ASSETS/EXAMPLE_BYTES.bin'),Buffer.from([0,255,17,128,0,42]));
const outsideFile=join(outside,'EXAMPLE_UNGRANTED.md');writeFileSync(outsideFile,'EXAMPLE ONLY OUTSIDE ROOT');const outsideHash=sha(readFileSync(outsideFile));
function tree(){
 const files=[];
 const visit=path=>{for(const entry of readdirSync(path).sort()){const file=join(path,entry),info=lstatSync(file);assert.equal(info.isSymbolicLink(),false);if(info.isDirectory())visit(file);else{assert.ok(info.isFile());files.push([relative(workspace,file).replaceAll('\\','/'),sha(readFileSync(file))]);}}};visit(workspace);return{files:files.length,sha256:sha(JSON.stringify(files))};
}
async function call(tool,arguments_={}){calls++;return ctx.tools.execute({callId:'EXAMPLE_FS_'+calls,name:'mcp__zhenfiles__'+tool,arguments:arguments_,agent,signal:new AbortController().signal});}
const text=result=>result.value.content.filter(item=>item.type==='text').map(item=>item.text).join('\n');
async function serverProcesses(){
 if(process.platform!=='win32')return null;
 const script="@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($env:DSH_MCP_EXAMPLE_ENTRY.ToLowerInvariant()) } | ForEach-Object { [PSCustomObject]@{pid=$_.ProcessId;created=$_.CreationDate.ToUniversalTime().ToString('o')} }) | ConvertTo-Json -Compress";
 const value=(await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,DSH_MCP_EXAMPLE_ENTRY:programEntry},encoding:'utf8',windowsHide:true,timeout:15000})).stdout.trim();if(!value)return[];const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[parsed];
}
try{
 console.log('Installing the pinned filesystem program without lifecycle hooks…');
 const installed=await market.install('filesystem',recipe.version,recipe.integrity);assert.equal(installed.release.integrity,recipe.integrity);assert.equal(installed.release.gitHead,recipe.gitHead);
 const initial=market.launch('filesystem',recipe.version);programEntry=join(initial.directory,'node_modules',recipe.package,recipe.entry);
 const programPart=relative(root,realpathSync.native(programEntry));assert.ok(programPart&&!isAbsolute(programPart)&&!programPart.startsWith('..'));
 await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);const runtime=new CuratedMcpRuntime(ctx,market);ctx.on('tools/pre-execute',async()=>({kind:'allow'}));
 market.select('filesystem',recipe.version,workspace);await runtime.sync();assert.equal(runtime.state('filesystem'),'ready');
 const tools=ctx.tools.schemas().filter(tool=>tool.name.startsWith('mcp__zhenfiles__')).map(tool=>tool.name.slice('mcp__zhenfiles__'.length));for(const required of ['list_allowed_directories','read_text_file','write_file','edit_file','move_file'])assert.ok(tools.includes(required),required);
 const allowedResult=await call('list_allowed_directories');assert.equal(allowedResult.isError,false);const allowed=text(allowedResult).split(/\r?\n/).map(line=>line.trim()).find(isAbsolute);assert.ok(allowed);assert.equal(realpathSync.native(allowed),realpathSync.native(workspace));
 const note=join(allowed,'EXAMPLE_OUTPUT.md'),final=join(allowed,'EXAMPLE_FINAL.md');assert.equal(existsSync(note),false);assert.equal(existsSync(final),false);
 const content='EXAMPLE ONLY\n示例角色：蓝桥。\n示例道具：铜铃。\n';assert.equal((await call('write_file',{path:note,content})).isError,false);assert.equal(text(await call('read_text_file',{path:note})),content);
 assert.equal((await call('edit_file',{path:note,edits:[{oldText:'铜铃',newText:'纸灯'}]})).isError,false);assert.equal((await call('move_file',{source:note,destination:final})).isError,false);assert.equal(readFileSync(final,'utf8'),content.replace('铜铃','纸灯'));
 assert.equal((await call('read_text_file',{path:outsideFile})).isError,true);assert.equal((await call('write_file',{path:outsideFile,content:'EXAMPLE_REFUSED_WRITE'})).isError,true);assert.equal(sha(readFileSync(outsideFile)),outsideHash);
 directory=outside;assert.equal((await call('read_text_file',{path:final})).isError,true);directory=workspace;
 const baseline=tree(),epoch=market.active()[0].epoch,before=await serverProcesses();if(before)assert.equal(before.length,1);
 await runtime.restart('filesystem');assert.equal(runtime.state('filesystem'),'ready');assert.equal(market.active()[0].epoch,epoch);assert.equal((await call('read_text_file',{path:final})).isError,false);market.assertSession(agent.session.id,workspace);
 const after=await serverProcesses();if(after){assert.equal(after.length,1);assert.notDeepEqual(after,before);}assert.deepEqual(tree(),baseline);
 async function reenable(session){
  assert.equal(market.active().length,0);assert.equal(ctx.tools.schemas().some(t=>t.name.startsWith('mcp__zhenfiles__')),false);assert.deepEqual(tree(),baseline);
  market.select('filesystem',recipe.version,workspace);await runtime.sync();assert.equal(runtime.state('filesystem'),'ready');assert.throws(()=>market.assertSession(agent.session.id,workspace));
  assert.equal((await call('write_file',{path:final,content:'EXAMPLE_STALE_CALL_MUST_NOT_WRITE'})).isError,true);assert.deepEqual(tree(),baseline);
  agent.session.id=session;assert.equal(text(await call('read_text_file',{path:final})),content.replace('铜铃','纸灯'));market.assertSession(agent.session.id,workspace);
 }
 console.log('Repairing the real filesystem program and preserving project bytes…');
 await market.repair('filesystem',recipe.version,()=>runtime.quiesce('filesystem'));const repaired=market.snapshot().installations[0],archive=market.snapshot().archives.find(a=>a.verified&&a.programRetained);assert.ok(archive);await reenable('EXAMPLE_AFTER_REPAIR');
 console.log('Restoring the retained original program with a fresh session…');
 await market.restoreArchive(archive.archiveId,()=>runtime.quiesce('filesystem'));assert.equal(market.launch('filesystem',recipe.version).digest,installed.digest);await reenable('EXAMPLE_AFTER_RESTORE');
 console.log('Detecting and repairing an altered temporary program without touching project files…');
 market.disable('filesystem');await runtime.quiesce('filesystem');const stopped=await serverProcesses();if(stopped)assert.equal(stopped.length,0);
 appendFileSync(programEntry,'\n// EXAMPLE_ONLY_FAULT_INJECTION\n');assert.throws(()=>market.launch('filesystem',recipe.version));assert.deepEqual(tree(),baseline);
 await market.repair('filesystem',recipe.version,()=>runtime.quiesce('filesystem'));const damaged=market.snapshot().archives.find(a=>a.programRetained&&!a.verified);assert.ok(damaged);await assert.rejects(market.restoreArchive(damaged.archiveId,()=>runtime.quiesce('filesystem')));await reenable('EXAMPLE_AFTER_DAMAGE_REPAIR');
 assert.deepEqual(tree(),baseline);assert.equal(sha(readFileSync(outsideFile)),outsideHash);assert.equal(credentials,0);
 report={at:new Date().toISOString(),node:process.versions.node,package:recipe.package,version:recipe.version,rootIntegrity:recipe.integrity,originalDigest:installed.digest,repairedDigest:repaired.digest,originalProgramRestored:true,tools:tools.length,toolCalls:calls,actualPublishedDshToolRuntime:true,syntheticAgentSessions:true,projectFiles:baseline.files,projectTreeSha256:baseline.sha256,projectBytesPreserved:true,binaryBytesPreserved:true,outsideRootReadAndWriteRefused:true,crossProjectCallRefused:true,restartSameGenerationAllowed:true,restartFreshProcessObserved:after!==null,oldSessionsCannotWriteAfterReenable:true,damagedProgramRefused:true,damagedArchiveUnverifiedAndRestoreRefused:true,credentialReads:0,modelCalls:0,paidCalls:0,nativeWrites:0,browserInspected:false};
}finally{
 await ctx.fiber.dispose();market.close();if(programEntry){const remaining=await serverProcesses();if(remaining)assert.equal(remaining.length,0,'Temporary MCP processes still live; cleanup refused.');}
 const physical=realpathSync.native(root),part=relative(base,physical);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\')&&part.startsWith('dsh-filesystem-maintenance-EXAMPLE-'));rmSync(physical,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
mkdirSync(resolve('.runtime/evidence'),{recursive:true});writeFileSync(output,JSON.stringify({...report,temporaryDataAndProcessesRemoved:true},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,temporaryDataAndProcessesRemoved:true}));
