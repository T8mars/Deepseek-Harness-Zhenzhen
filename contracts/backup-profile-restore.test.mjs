import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,mkdir,readFile,writeFile,unlink,readdir} from 'node:fs/promises';
import {existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {parseDocument} from 'yaml';
import {applyEntryPatches} from '@deepseek-ai/cordis-plugin-include';
import {initProfile,readProfileManifest,writeProfileManifest,resolveProfileDir,PROFILE_PATCH_FILENAME,loadOptionalPatches,loadOverlayPatches,readProfileCompatibility,setProfileVersionExemption} from '@deepseek-ai/dsh-app-boot';
import {writeProfileBackup,readProfileBackup,restoreProfileBackup,writeBackupArchive,openBackupArchive} from '../packages/dsh-zhen/lib/backup.js';
import {mcpChildEnvironment} from '../packages/dsh-zhen/lib/mcp-market.js';

const password='EXAMPLE portable profile restore password',anchor=createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'),cli=resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'),packageName='@example/profile-restore-fixture',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function packageFixture(folder){
  await mkdir(folder,{recursive:true});
  await writeFile(join(folder,'package.json'),JSON.stringify({name:packageName,version:'1.2.3',type:'module',exports:{'.':'./EXAMPLE.mjs'},engines:{dsh:'0.2.1-rc.2'},dsh:{bundle:{patch:'./EXAMPLE.patch.json'}}}));
  await writeFile(join(folder,'EXAMPLE.patch.json'),JSON.stringify([{insert:[{id:'EXAMPLE_target',name:packageName,config:{EXAMPLE:'base'}},{id:'EXAMPLE_disabled',name:'EXAMPLE_MODULE_MUST_NOT_BE_IMPORTED'}]}]));
  await writeFile(join(folder,'EXAMPLE.mjs'),`import{writeFile}from'node:fs/promises';export function apply(ctx,config){ctx.effect(async()=>{await writeFile(process.env.EXAMPLE_RECEIPT,JSON.stringify({config,expressionExecuted:globalThis.EXAMPLE_PROFILE_EXPR_EXECUTED===true}));const timer=setTimeout(()=>{void ctx.loader.ctx.fiber.dispose();},25);return()=>clearTimeout(timer);});}`);
}
async function fixture(t){
  const temp=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(temp,'dsh-profile-restore-EXAMPLE-'))),home=join(root,'source'),parent=join(root,'candidates'),cwd=join(root,'workspace');await mkdir(home);await mkdir(parent);await mkdir(cwd);
  t.after(async()=>{delete globalThis.EXAMPLE_PROFILE_EXPR_EXECUTED;const part=relative(temp,await realpath(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-profile-restore-EXAMPLE-'));await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
  const alpha=resolveProfileDir('EXAMPLE_alpha',home),beta=resolveProfileDir('EXAMPLE_beta',home);initProfile(alpha,[]);initProfile(beta,[]);const manifest=readProfileManifest('EXAMPLE',alpha);manifest.dependencies={[packageName]:'^1.0.0'};manifest.devDependencies={'@example/dev-only':'file:EXAMPLE_ORIGIN_PATH'};manifest.optionalDependencies={'@example/optional-only':'workspace:*'};manifest.peerDependencies={'@example/peer-only':'^2.0.0'};manifest.dsh.profile.bundles=[packageName];manifest.exampleMetadata={constructor:'EXAMPLE_LITERAL',values:[1,false,null,'EXAMPLE']};writeProfileManifest(alpha,manifest);await packageFixture(join(alpha,'node_modules','@example','profile-restore-fixture'));await unlink(join(beta,PROFILE_PATCH_FILENAME));
  const profile=[{id:'EXAMPLE_target',config:{EXAMPLE:'profile'}}],machine=[{id:'EXAMPLE_target',config:{EXAMPLE:'machine'}}],overlays=[{id:'EXAMPLE_target',config:{EXAMPLE:'active',constructor:'EXAMPLE_LITERAL',expression:{__jsExpr:'(globalThis.EXAMPLE_PROFILE_EXPR_EXECUTED=true,"EXAMPLE_INTERPOLATED")'}}},{id:'EXAMPLE_disabled',disabled:true}];
  await writeFile(join(alpha,PROFILE_PATCH_FILENAME),JSON.stringify(profile));await writeFile(join(home,PROFILE_PATCH_FILENAME),JSON.stringify(machine));await setProfileVersionExemption(alpha,packageName+'@1.2.3','0.2.1-rc.2',true,true);
  const source={home,installAnchor:anchor,active:{name:'EXAMPLE_alpha',dir:alpha,cwd,startedBundles:[packageName],overlays,telemetryDisabledEnv:undefined}},path=join(root,'EXAMPLE.encrypted'),files=[join(alpha,'package.json'),join(alpha,PROFILE_PATCH_FILENAME),join(home,PROFILE_PATCH_FILENAME),join(beta,'package.json')],before=await Promise.all(files.map(async path=>sha(await readFile(path))));await writeProfileBackup(path,password,()=>source);
  return {root,home,parent,cwd,alpha,beta,source,path,files,before,profile,machine,overlays};
}
async function decoded(path){const archive=await openBackupArchive(path,password),result=[];try{for await(const row of archive.records()){const parts=[];for await(const bytes of row.data)parts.push(bytes);result.push({metadata:row.metadata,bytes:Buffer.concat(parts)});}return result;}finally{await archive.close();}}
async function* records(rows){for(const row of rows)yield {metadata:row.metadata,size:row.bytes.length,data:(async function*(){yield row.bytes;})()};}
async function forged(f,label,change){const rows=await decoded(f.path),document=JSON.parse(rows[0].bytes);change(document,rows);rows[0].bytes=Buffer.from(JSON.stringify(document));const file=join(f.root,'EXAMPLE_'+label);await writeBackupArchive(file,password,records(rows));return file;}

test('C96: all profiles and original manifests restore through public SDK into a new inactive home',async t=>{
  const f=await fixture(t),document=await readProfileBackup(f.path,password),result=await restoreProfileBackup(f.path,password,f.parent);assert.equal(result.activated,false);assert.equal(result.readyForActivation,false);assert.equal(result.profiles.length,2);assert.deepEqual(result.document,document);
  for(const profile of result.profiles){assert.match(profile.name,/^restore-[a-f0-9]{32}$/);assert.equal(profile.directory,resolveProfileDir(profile.name,result.home));assert.deepEqual(readProfileManifest('EXAMPLE',profile.directory),document.profiles.find(row=>row.name===profile.originName).manifest);assert.deepEqual(loadOptionalPatches('EXAMPLE',join(profile.directory,PROFILE_PATCH_FILENAME)),[]);assert.equal(existsSync(join(profile.directory,'node_modules')),false);assert.equal(profile.launch.env.DSH_HOME,result.home);assert.equal(profile.launch.env.DSH_AGENTS_HOME,result.agentsHome);assert.equal(profile.launch.env.DSH_TELEMETRY_DISABLED,'1');}
  assert.deepEqual(JSON.parse(await readFile(result.provenance,'utf8')),result);assert.deepEqual(await Promise.all(f.files.map(async path=>sha(await readFile(path)))),f.before);assert.equal(result.coverage.packageArtifacts,false);assert.equal(result.coverage.originalPackageManagerFiles,false);
});

test('C96: portable overlays follow real bundle/profile/machine/active ordering and whole-config replacement',async t=>{
  const f=await fixture(t),result=await restoreProfileBackup(f.path,password,f.parent),active=result.profiles.find(row=>row.wasActive),inactive=result.profiles.find(row=>!row.wasActive),patches=loadOverlayPatches('EXAMPLE',active.overlay);assert.deepEqual(patches,[...f.profile,...f.machine,...f.overlays]);assert.deepEqual(loadOverlayPatches('EXAMPLE',inactive.overlay),f.machine);
  const base=[{id:'EXAMPLE_target',name:packageName,config:{EXAMPLE:'base',EXAMPLE_WHOLE_CONFIG:'must disappear'}},{id:'EXAMPLE_disabled',name:'EXAMPLE_MODULE_MUST_NOT_BE_IMPORTED'}],expected=applyEntryPatches(base,[...f.profile,...f.machine,...f.overlays],()=>{throw Error('EXAMPLE_UNEXPECTED_SKIP');});assert.deepEqual(applyEntryPatches(base,patches,()=>{throw Error('EXAMPLE_UNEXPECTED_SKIP');}),expected);assert.equal(Object.hasOwn(expected[0].config,'EXAMPLE_WHOLE_CONFIG'),false);assert.equal(expected[1].disabled,true);
});

test('C96: missing and empty source layers remain distinguishable in restoration provenance',async t=>{
  const f=await fixture(t),result=await restoreProfileBackup(f.path,password,f.parent);assert.equal(result.document.profiles.find(row=>row.name==='EXAMPLE_beta').patch.present,false);assert.equal(result.document.profiles.find(row=>row.name==='EXAMPLE_alpha').patch.present,true);assert.equal(result.document.machine.present,true);assert.deepEqual(result.profiles.find(row=>row.originName==='EXAMPLE_beta').declaredDependencies,[]);
});

test('C96: historical compatibility exemptions remain pending data without automatically granting a new profile',async t=>{
  const f=await fixture(t),result=await restoreProfileBackup(f.path,password,f.parent),profile=result.profiles.find(row=>row.wasActive);assert.deepEqual(profile.pendingCompatibility,{present:true,exemptions:{[packageName+'@1.2.3']:['0.2.1-rc.2']}});assert.deepEqual(readProfileCompatibility(profile.directory).exemptions,{});assert.equal(result.coverage.compatibilityGrants,false);assert.equal(Object.keys(readProfileCompatibility(f.alpha).exemptions).length,1);
});

test('C96: restoration and public overlay reads preserve expression data without running it',async t=>{
  const f=await fixture(t),result=await restoreProfileBackup(f.path,password,f.parent),profile=result.profiles.find(row=>row.wasActive),overlay=loadOverlayPatches('EXAMPLE',profile.overlay);assert.equal(globalThis.EXAMPLE_PROFILE_EXPR_EXECUTED,undefined);assert.equal(overlay[2].config.expression.__jsExpr,'(globalThis.EXAMPLE_PROFILE_EXPR_EXECUTED=true,"EXAMPLE_INTERPOLATED")');assert.equal(overlay[2].config.constructor,'EXAMPLE_LITERAL');assert.equal(result.coverage.expressionData,true);
});

test('C96: foreign origin paths and Windows device profile names never choose output paths',async t=>{
  const f=await fixture(t),file=await forged(f,'foreign',document=>{document.originHome='/EXAMPLE_FOREIGN_HOME';document.profiles[0].name='CON';document.active.name='CON';document.active.cwd='Z:\\EXAMPLE_FOREIGN_WORKSPACE';}),result=await restoreProfileBackup(file,password,f.parent),profile=result.profiles.find(row=>row.originName==='CON');assert.ok(profile);assert.match(profile.name,/^restore-/);assert.ok(relative(result.root,profile.directory)&&!relative(result.root,profile.directory).startsWith('..'));assert.equal(result.document.originHome,'/EXAMPLE_FOREIGN_HOME');assert.equal(result.document.active.cwd,'Z:\\EXAMPLE_FOREIGN_WORKSPACE');assert.equal(existsSync(join(result.home,'CON')),false);
});

test('C96: origin names that collide by case or normalization map to distinct safe candidate identities',async t=>{
  const f=await fixture(t),file=await forged(f,'names',document=>{document.profiles[0].name='EXAMPLE_Ａ';document.profiles[1].name='EXAMPLE_A';document.active.name='EXAMPLE_Ａ';}),result=await restoreProfileBackup(file,password,f.parent);assert.equal(new Set(result.profiles.map(row=>row.name)).size,2);for(const row of result.profiles)assert.match(row.name,/^restore-[a-f0-9]{32}$/);
});

test('C96: malformed executable DSH manifest structures reject before candidate creation',async t=>{
  const f=await fixture(t);for(const [label,value]of [['dsh','EXAMPLE_INVALID'],['profile',{profile:'EXAMPLE_INVALID'}],['bundles',{profile:{bundles:'EXAMPLE_INVALID'}}]]){const file=await forged(f,label,document=>{document.profiles[0].manifest.dsh=value;});await assert.rejects(restoreProfileBackup(file,password,f.parent),error=>error.code==='BACKUP_PROFILE_MANIFEST_INVALID');assert.deepEqual(await readdir(f.parent),[]);}
});

test('C96: full authentication and integrity verification precede SDK initialization or overlays',async t=>{
  const f=await fixture(t);await assert.rejects(restoreProfileBackup(f.path,'EXAMPLE_WRONG_PASSWORD',f.parent),error=>error.code==='BACKUP_AUTHENTICATION_FAILED');assert.deepEqual(await readdir(f.parent),[]);const bytes=await readFile(f.path),bad=join(f.root,'EXAMPLE_corrupt');bytes[bytes.length-1]^=1;await writeFile(bad,bytes);await assert.rejects(restoreProfileBackup(bad,password,f.parent),error=>error.code==='BACKUP_AUTHENTICATION_FAILED');assert.deepEqual(await readdir(f.parent),[]);
});

test('C96: authenticated extra records cannot become profile output or partial candidates',async t=>{
  const f=await fixture(t),file=await forged(f,'extra',(_document,rows)=>{rows.push({metadata:{kind:'EXAMPLE_OTHER'},bytes:Buffer.alloc(0)});});await assert.rejects(restoreProfileBackup(file,password,f.parent),error=>error.code==='BACKUP_PROFILE_RECORD_INVALID');assert.deepEqual(await readdir(f.parent),[]);
});

test('C96: cancellation before restore creates no candidate',async t=>{
  const f=await fixture(t),control=new AbortController();control.abort();await assert.rejects(restoreProfileBackup(f.path,password,f.parent,{signal:control.signal}),error=>error.name==='AbortError');assert.deepEqual(await readdir(f.parent),[]);
});

test('C96: cancellation after provenance persistence removes only the complete fresh candidate',async t=>{
  const f=await fixture(t),keep=join(f.parent,'EXAMPLE_KEEP');await mkdir(keep);await writeFile(join(keep,'example.txt'),'EXAMPLE_UNCHANGED');const control=new AbortController(),check=control.signal.throwIfAborted.bind(control.signal);control.signal.throwIfAborted=()=>{for(const name of readdirSync(f.parent))if(name.startsWith('dsh-zhen-profile-restore-')&&existsSync(join(f.parent,name,'dsh-zhen-profile-restore.json')))control.abort();check();};await assert.rejects(restoreProfileBackup(f.path,password,f.parent,{signal:control.signal}),error=>error.name==='AbortError');assert.deepEqual(await readdir(f.parent),['EXAMPLE_KEEP']);assert.equal(await readFile(join(keep,'example.txt'),'utf8'),'EXAMPLE_UNCHANGED');
});

test('C96: repeated restores preserve existing candidates and origin bytes',async t=>{
  const f=await fixture(t),first=await restoreProfileBackup(f.path,password,f.parent),before=await readFile(first.provenance),second=await restoreProfileBackup(f.path,password,f.parent);assert.notEqual(first.root,second.root);assert.deepEqual(first.profiles.map(row=>row.name),second.profiles.map(row=>row.name));assert.deepEqual(await readFile(first.provenance),before);assert.deepEqual(await Promise.all(f.files.map(async path=>sha(await readFile(path)))),f.before);
});

test('C96: relative destination parent is refused without output',async t=>{
  const f=await fixture(t);await assert.rejects(restoreProfileBackup(f.path,password,'EXAMPLE_relative'),error=>error.code==='BACKUP_PATH_INVALID');assert.deepEqual(await readdir(f.parent),[]);
});

test('C96: SDK-retired bundles remain recorded and are not sanitized during inactive restoration',async t=>{
  const f=await fixture(t),retired='@deepseek-ai/dsh-experimental-schedule-bundle',file=await forged(f,'retired',document=>{document.profiles[0].manifest.dsh.profile.bundles.push(retired);}),result=await restoreProfileBackup(file,password,f.parent),profile=result.profiles.find(row=>row.wasActive);assert.ok(readProfileManifest('EXAMPLE',profile.directory).dsh.profile.bundles.includes(retired));assert.ok(result.document.profiles[0].manifest.dsh.profile.bundles.includes(retired));
});

test('C96: desktop origin remains recoverable data without bypassing the public CLI desktop guard',async t=>{
  const f=await fixture(t),file=await forged(f,'desktop',document=>{document.profiles[0].name='DeSkToP';document.active.name='DeSkToP';}),result=await restoreProfileBackup(file,password,f.parent),profile=result.profiles.find(row=>row.wasActive);assert.equal(profile.originName,'DeSkToP');assert.equal(profile.launch,null);assert.equal(profile.launchBlockedReason,'DESKTOP_MANAGED_PROFILE');assert.deepEqual(readProfileManifest('EXAMPLE',profile.directory),profile.manifest);assert.ok(result.profiles.find(row=>!row.wasActive).launch);
  let output='',failed=false;const child=spawn(process.execPath,[cli,'--profile','DeSkToP','--dump-config'],{cwd:f.cwd,env:mcpChildEnvironment({DSH_HOME:result.home,DSH_AGENTS_HOME:result.agentsHome,DSH_TELEMETRY_DISABLED:'1'}),windowsHide:true,stdio:['ignore','pipe','pipe'],signal:AbortSignal.timeout(10000)});for(const stream of [child.stdout,child.stderr]){stream.setEncoding('utf8');stream.on('data',value=>output=(output+value).slice(-4096));}const code=await new Promise(done=>{child.once('error',()=>{failed=true;});child.once('close',done);});assert.equal(failed,false);assert.notEqual(code,0);assert.match(output,/managed exclusively by the Electron application/);
});

test('C96: actual public CLI dumps and boots the restored overlay after fixture-only dependencies are supplied',async t=>{
  const f=await fixture(t),result=await restoreProfileBackup(f.path,password,f.parent),profile=result.profiles.find(row=>row.wasActive),receipt=join(f.root,'EXAMPLE_cli_receipt.json');await packageFixture(join(profile.directory,'node_modules','@example','profile-restore-fixture'));
  const run=async args=>{let output='',failed=false;const child=spawn(process.execPath,[cli,...args],{cwd:f.cwd,env:mcpChildEnvironment({...profile.launch.env,EXAMPLE_RECEIPT:receipt}),windowsHide:true,stdio:['ignore','pipe','pipe'],signal:AbortSignal.timeout(30000)});for(const stream of [child.stdout,child.stderr]){stream.setEncoding('utf8');stream.on('data',value=>output=(output+value).slice(-128*1024));}const code=await new Promise(done=>{child.once('error',()=>{failed=true;});child.once('close',done);});assert.equal(failed,false,'EXAMPLE public CLI failed');assert.equal(code,0,'EXAMPLE public CLI failed');return output;};
  const dump=await run([...profile.launch.args,'--dump-config']),doc=parseDocument(dump,{customTags:[{tag:'tag:yaml.org,2002:js',resolve:value=>value}]});assert.equal(doc.errors.length,0);const target=doc.toJS().find(row=>row.id==='EXAMPLE_target');assert.equal(target.config.EXAMPLE,'active');assert.equal(existsSync(receipt),false);await run(profile.launch.args);assert.deepEqual(JSON.parse(await readFile(receipt,'utf8')),{config:{EXAMPLE:'active',constructor:'EXAMPLE_LITERAL',expression:'EXAMPLE_INTERPOLATED'},expressionExecuted:true});assert.equal(result.coverage.packageArtifacts,false);assert.equal(result.readyForActivation,false);assert.deepEqual(await Promise.all(f.files.map(async path=>sha(await readFile(path)))),f.before);console.log(JSON.stringify({contract:'C96',actualPublicCliDumpAndBoot:true,dependenciesSuppliedByFixture:true,productionDependencyRestoreVerified:false,sourceBytesPreserved:true,nativeWrites:0,modelRequests:0}));
});
