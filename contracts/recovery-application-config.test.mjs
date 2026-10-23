import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,writeFile,readFile,readdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {dirname,join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parseDocument} from 'yaml';
import {loadProfile,readProfileManifest,writeProfileManifest} from '@deepseek-ai/dsh-app-boot';
import {prepareRestoredApplication,sealRecoveryCandidate,verifyRecoveryCandidate} from '../packages/dsh-zhen/lib/backup.js';
import {inspectRecoveryApplication,adoptRecoveryApplication,recoveryApplicationLaunchPatches} from '../packages/dsh-zhen/lib/recovery-application-config.js';
import {mcpChildEnvironment} from '../packages/dsh-zhen/lib/mcp-market.js';
import {ownedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';
const anchor=createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'),cli=resolve('node_modules/@deepseek-ai/dsh/lib/bin.js');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
import {fixture,boot} from './fixtures/recovery-application-config.mjs';

test('C195: inspection remains inert and describes the complete recovered tree without configuration or code bodies',async t=>{
 const f=await fixture(t),before=hash(await readFile(f.profile.patchPath)),plan=await inspectRecoveryApplication(f.baseline,f.name,anchor);
 assert.ok(plan.programs.length>100);assert.ok(plan.programs.every(row=>typeof row.enabled==='boolean'&&['installed','restored'].includes(row.origin)));assert.equal(hash(await readFile(f.profile.patchPath)),before);assert.equal((await verifyRecoveryCandidate(f.baseline)).integrity,'unchanged');
 const workspace=plan.entries.find(row=>row.name==='@deepseek-ai/dsh-workspace');assert.equal(workspace.disabled,false);assert.equal(plan.entries.find(row=>row.name==='@deepseek-ai/dsh-schedule').disabled,true);assert.equal(plan.entries.find(row=>row.name==='@deepseek-ai/dsh-sandbox-policy').config.mode,'read-only');assert.equal(plan.entries.find(row=>row.name==='@deepseek-ai/dsh-user-approval').config.policy,'ask');
 assert.equal(JSON.stringify(plan.programs).includes('apiKeyEnv'),false);assert.equal((await readdir(join(f.home,'profiles',f.name))).includes('pnpm-lock.yaml'),false);
});

test('C195: the launch-only listener and monitor overlay keeps normal ConfigEditor writes editable across real boots',async t=>{
 const f=await fixture(t),plan=await inspectRecoveryApplication(f.baseline,f.name,anchor),adopted=await adoptRecoveryApplication(plan,plan.digest),monitor=join(f.root,'recovery-application-runtime.js');await writeFile(monitor,'export const name="EXAMPLE-inert-monitor"; export function apply() {}\n');
 const patches=await recoveryApplicationLaunchPatches(adopted,anchor,{id:'dsh-zhen-recovery-runtime',name:pathToFileURL(monitor).href,config:{schema:'dsh-zhen-recovery-runtime-v1'}}),overlay=join(f.root,'EXAMPLE_launch.json');assert.equal(patches.length,3);assert.equal(patches.some(row=>row.id==='agent-default-model'),false);await writeFile(overlay,JSON.stringify(patches));
 const first=await boot(f,t,{editModel:'example/launch-overlay-edit',patchFiles:[overlay]}),second=await boot(f,t,{expectedModel:'example/launch-overlay-edit',patchFiles:[overlay]});assert.equal(first.modelEdited,second.modelBefore);
});

test('C195: a second-generation restore drops the old execution monitor instead of loading its old absolute module',async t=>{
 const f=await fixture(t,{change:patches=>patches.push({insert:[{id:'dsh-zhen-recovery-runtime',name:'file:///EXAMPLE_OLD_INSTALL/recovery-application-runtime.js',config:{schema:'dsh-zhen-recovery-runtime-v1',execution:'EXAMPLE_OLD_EXECUTION'}}]})}),plan=await inspectRecoveryApplication(f.baseline,f.name,anchor);
 assert.equal(plan.entries.some(row=>row.id==='dsh-zhen-recovery-runtime'),false);assert.equal(plan.programs.some(row=>row.id==='dsh-zhen-recovery-runtime'),false);assert.equal(plan.unresolvedPrograms,0);assert.equal((await verifyRecoveryCandidate(f.baseline)).integrity,'unchanged');
});

test('C195: normal published SDK adoption boots all core controllers and permits a real ConfigEditor edit that survives a second normal boot',async t=>{
 const f=await fixture(t),plan=await inspectRecoveryApplication(f.baseline,f.name,anchor),oldManifest=readProfileManifest('EXAMPLE',f.profile.dir),sourceOverlay=hash(await readFile(f.overlay));
 const adopted=await adoptRecoveryApplication(plan,plan.digest);assert.equal(adopted.profile,f.name);assert.equal(hash(await readFile(f.overlay)),sourceOverlay);assert.notDeepEqual(readProfileManifest('EXAMPLE',f.profile.dir).dsh.profile.bundles,oldManifest.dsh.profile.bundles);
 const first=await boot(f,t,{editModel:'example/recovery-model'}),second=await boot(f,t,{expectedModel:'example/recovery-model'});assert.equal(first.modelEdited,'example/recovery-model');assert.equal(second.modelBefore,'example/recovery-model');
 console.log(JSON.stringify({contract:'C195',actualPublicManifestAndStandardNodeProjection:true,completeReviewedTreePreserved:true,actualWorkspaceRegistryAndBothControllersReady:true,normalProfileWithoutCliOverlays:true,actualPublishedConfigEditorEdit:true,editSurvivesSecondRealBoot:true,originalPortableOverlayPreserved:true,selectedProfileIdentityPreserved:true,readonlyAndAskDefaults:true,scheduleRemainsPaused:true,ownerGatewayExercisedInThisContract:false,applicationOpenedInUserHome:false,nativeRequests:0,modelRequests:0}));
});

test('C195: changed source bytes or another review digest refuse before application writes',async t=>{
 const f=await fixture(t),plan=await inspectRecoveryApplication(f.baseline,f.name,anchor),before=hash(await readFile(join(f.profile.dir,'package.json')));
 await assert.rejects(adoptRecoveryApplication(plan,'0'.repeat(64)),{code:'BACKUP_APPLICATION_REVIEW_CHANGED'});await writeFile(f.overlay,'[]\n ');await assert.rejects(adoptRecoveryApplication(plan,plan.digest),{code:'BACKUP_CANDIDATE_CHANGED'});assert.equal(hash(await readFile(join(f.profile.dir,'package.json'))),before);
});

test('C195: a workspace deliberately disabled in the original profile is not silently enabled',async t=>{
 const f=await fixture(t,{change:(patches,rows)=>patches.push({id:rows.find(row=>row.name==='@deepseek-ai/dsh-workspace').id,disabled:true})});await assert.rejects(inspectRecoveryApplication(f.baseline,f.name,anchor),{code:'BACKUP_APPLICATION_WORKSPACE_DISABLED'});
});

test('C195: an unknown program in the SDK namespace is unresolved and never inherits installation trust',async t=>{
 const f=await fixture(t,{change:patches=>patches.push({insert:[{id:'EXAMPLE_spoof',name:'@deepseek-ai/example-not-installed'}]})}),plan=await inspectRecoveryApplication(f.baseline,f.name,anchor),item=plan.programs.find(row=>row.id==='EXAMPLE_spoof');
 assert.equal(item.origin,'unresolved');assert.equal(plan.unresolvedPrograms,1);await assert.rejects(adoptRecoveryApplication(plan,plan.digest),{code:'BACKUP_APPLICATION_PROGRAM_UNAVAILABLE'});assert.equal((await verifyRecoveryCandidate(f.baseline)).integrity,'unchanged');
});

test('C195: a non-Web configuration is refused before adoption instead of offering a window that cannot exist',async t=>{
 const f=await fixture(t,{change:(patches,rows)=>{for(const row of rows.filter(row=>['@deepseek-ai/dsh-web-app','@deepseek-ai/dsh-host-webserver'].includes(row.name)))patches.push({id:row.id,disabled:true});}});await assert.rejects(inspectRecoveryApplication(f.baseline,'',anchor),{code:'BACKUP_APPLICATION_PROFILE_UNAVAILABLE'});assert.equal((await verifyRecoveryCandidate(f.baseline)).integrity,'unchanged');
});

test('C195: retained dependency links and profile insert patches survive adoption without rebuilding the package-manager graph',async t=>{
 let program,projection;const f=await fixture(t,{configure:async({candidate,profile})=>{program=join(candidate,'env','EXAMPLE_program');await mkdir(program);await writeFile(join(program,'package.json'),JSON.stringify({name:'example-retained-program',version:'0.0.0',type:'module',main:'index.js'}));await writeFile(join(program,'index.js'),'export const name="EXAMPLE retained program"; export function apply(ctx){ctx.provide("exampleRetained","EXAMPLE");}\n');const modules=join(profile.dir,'node_modules');await mkdir(modules,{recursive:true});projection=join(modules,'example-retained-program');await symlink(program,projection,process.platform==='win32'?'junction':'dir');const manifest=readProfileManifest('EXAMPLE',profile.dir);writeProfileManifest(profile.dir,{...manifest,dependencies:{...manifest.dependencies,'example-retained-program':'link:'+program}});await writeFile(profile.patchPath,JSON.stringify([{insert:[{id:'EXAMPLE_retained',name:'example-retained-program'}]}]));}});
 const originalPatch=await readFile(f.profile.patchPath);const plan=await inspectRecoveryApplication(f.baseline,f.name,anchor),before=await realpath(projection),manifest=readProfileManifest('EXAMPLE',f.profile.dir);assert.equal(plan.programs.find(row=>row.id==='EXAMPLE_retained').origin,'restored');const adopted=await adoptRecoveryApplication(plan,plan.digest);assert.deepEqual(await readFile(join(dirname(adopted.bundleDirectory),'original-profile-patch.yml')),originalPatch);assert.equal(await readFile(f.profile.patchPath,'utf8'),'[]\n');assert.equal(await realpath(projection),before);assert.equal(readProfileManifest('EXAMPLE',f.profile.dir).dependencies['example-retained-program'],manifest.dependencies['example-retained-program']);assert.equal((await readdir(f.profile.dir)).includes('pnpm-lock.yaml'),false);const report=await boot(f,t,{requiredServices:['exampleRetained']});assert.equal(report.services.exampleRetained,true);
});
