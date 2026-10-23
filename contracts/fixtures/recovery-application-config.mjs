import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,writeFile,readFile,readdir,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';import {dirname,join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {parseDocument} from 'yaml';
import {loadProfile,readProfileManifest} from '@deepseek-ai/dsh-app-boot';
import {prepareRestoredApplication,sealRecoveryCandidate,verifyRecoveryCandidate} from '../../packages/dsh-zhen/lib/backup.js';
import {inspectRecoveryApplication,adoptRecoveryApplication} from '../../packages/dsh-zhen/lib/recovery-application-config.js';
import {mcpChildEnvironment} from '../../packages/dsh-zhen/lib/mcp-market.js';
import {ownedTempCleanup} from './owned-temp-cleanup.mjs';
import {checkPackagePaths} from '../../scripts/package-policy.mjs';
const anchor=createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'),cli=resolve('node_modules/@deepseek-ai/dsh/lib/bin.js');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t,{change,withZhen=false,configure}={}){
 const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-application-config-EXAMPLE-'))),cleanup=ownedTempCleanup(base,root,'dsh-application-config-EXAMPLE-',{budgetMs:30000}),disposers=[];t.after(async()=>{for(const dispose of disposers.toReversed())await dispose();await cleanup.cleanup();});
 const candidate=join(root,'dsh-zhen-recovery-EXAMPLE'),environment=join(candidate,'env'),home=join(environment,'home'),agentsHome=join(environment,'agents'),overlays=join(environment,'overlays');for(const path of[candidate,environment,home,agentsHome,overlays])await mkdir(path);
 const name='restore-EXAMPLE',env=mcpChildEnvironment({DSH_HOME:home,DSH_AGENTS_HOME:agentsHome,DSH_TELEMETRY_DISABLED:'1'});
 const dumped=execFileSync(process.execPath,[cli,'--profile',name,'--from-default-profile','web','--dump-config'],{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true,timeout:45000,maxBuffer:8*1024**2});
 if(withZhen){
  const npm=[process.env.npm_execpath,resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].find(path=>path&&existsSync(path));assert.ok(npm);
  const published=JSON.parse(execFileSync(process.execPath,[npm,'pack','./packages/dsh-zhen','--ignore-scripts','--offline','--json','--dry-run'],{cwd:process.cwd(),env,windowsHide:true,timeout:45000,maxBuffer:4*1024**2}))[0];
  const own=join(environment,'EXAMPLE_own_bundle');await mkdir(own);
  for(const path of checkPackagePaths(published.files)){const target=join(own,path);await mkdir(dirname(target),{recursive:true});await copyFile(resolve('packages/dsh-zhen',path),target);}
  const packed=JSON.parse(execFileSync(process.execPath,[npm,'pack',own,'--ignore-scripts','--offline','--json','--pack-destination',environment],{cwd:root,env,windowsHide:true,timeout:45000,maxBuffer:4*1024**2}))[0];checkPackagePaths(packed.files);
  execFileSync(process.execPath,[cli,'plugin','--profile',name,'add',join(environment,packed.filename),'--ignore-scripts','--offline'],{cwd:root,env,windowsHide:true,stdio:'pipe',timeout:120000,maxBuffer:4*1024**2});
 }
 const rows=parseDocument(dumped,{customTags:[{tag:'tag:yaml.org,2002:js',resolve:value=>({__jsExpr:value})}]}).toJS(),profile=loadProfile('EXAMPLE',name,anchor,home),overlay=join(overlays,'EXAMPLE.json'),patches=[];await configure?.({root,candidate,home,profile});change?.(patches,rows);await writeFile(overlay,JSON.stringify(patches)+'\n');
 const layouts=[{kind:'environment',root:environment,details:true,locations:[{role:'home',path:home,type:'directory'},{role:'agents',path:agentsHome,type:'directory'}],profiles:[{name,originName:'EXAMPLE',directory:profile.dir,overlay,wasActive:true,launchable:true,compatibilityReview:false,dependencyIssues:0}],externalPackages:0}];
 const recipe=await prepareRestoredApplication(candidate,layouts,{installAnchor:anchor});assert.ok(recipe.profiles[0].launch);
 const summary={kind:'environment',counts:{profiles:1,packages:0},warnings:[]};await writeFile(join(candidate,'dsh-zhen-recovery.json'),JSON.stringify({schema:'dsh-zhen-selected-backup-v1',root:candidate,components:['environment'],activated:false,wholeApplicationRestore:false,credentialStoresIncluded:false,limitations:[],restored:[{kind:'environment',root:environment,summary}]})+'\n');
 const baseline=await sealRecoveryCandidate(candidate,[summary]);
 return{root,candidate,home,agentsHome,name,baseline,recipe,rows,overlay,profile,dispose:fn=>disposers.push(fn)};
}
async function boot(f,t,{editModel,expectedModel,patchFiles=[],requiredServices=[]}={}){
 const suffix=editModel?'edit':'reopen',input=join(f.root,'EXAMPLE-'+suffix+'.json'),output=join(f.root,'EXAMPLE-'+suffix+'-result.json');await writeFile(input,JSON.stringify({profile:f.name,home:f.home,agentsHome:f.agentsHome,cwd:f.recipe.profiles[0].launch.cwd,editModel,expectedModel,patchFiles,requiredServices,output}));
 const child=spawn(process.execPath,[resolve('contracts/fixtures/recovery-application-boot.mjs'),input],{cwd:f.recipe.profiles[0].launch.cwd,env:mcpChildEnvironment({DSH_HOME:f.home,DSH_AGENTS_HOME:f.agentsHome,DSH_TELEMETRY_DISABLED:'1'}),windowsHide:true,stdio:'ignore',timeout:90000});
 t.after(()=>{if(child.exitCode===null)child.kill();});const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);});const report=JSON.parse(await readFile(output,'utf8'));assert.equal(report.passed,true,JSON.stringify(report));assert.equal(code,0);return report;
}


export {fixture,boot};
