import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,mkdir,readFile,writeFile,unlink,readdir,open,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {Context} from '@deepseek-ai/cordis';
import Credentials from '@deepseek-ai/dsh-credentials-local';
import {credentialRef} from '@deepseek-ai/dsh-credentials';
import {initProfile,readProfileManifest,writeProfileManifest,resolveProfileDir,PROFILE_PATCH_FILENAME,PROFILE_COMPATIBILITY_FILENAME,PROFILES_DIR,setProfileVersionExemption} from '@deepseek-ai/dsh-app-boot';
import {writeProfileBackup,readProfileBackup,profileBackupRecords,writeBackupArchive,openBackupArchive,prepareProfileBackup,BackupError} from '../packages/dsh-zhen/lib/backup.js';

const password='EXAMPLE profile snapshot password',anchor=createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t){
  const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-profile-backup-EXAMPLE-'))),home=join(root,'home');await mkdir(home);
  const alpha=resolveProfileDir('EXAMPLE_alpha',home),beta=resolveProfileDir('EXAMPLE_beta',home);initProfile(alpha,[]);initProfile(beta,[]);
  const manifest=readProfileManifest('EXAMPLE',alpha);manifest.dependencies={'@example/backup-fixture':'^1.0.0'};manifest.dsh.profile.bundles=['@example/backup-fixture'];manifest.exampleMarker='EXAMPLE_MANIFEST';writeProfileManifest(alpha,manifest);
  const module=join(alpha,'node_modules','@example','backup-fixture');await mkdir(module,{recursive:true});await writeFile(join(module,'package.json'),JSON.stringify({name:'@example/backup-fixture',version:'1.2.3',main:'index.cjs',dsh:{bundle:{patch:'./cordis.patch.yml'}}}));await writeFile(join(module,'index.cjs'),'globalThis.EXAMPLE_BACKUP_PACKAGE_EXECUTED = true;');
  // Synthetic source documents only, inside this owned TEMP fixture. Product
  // code never writes profile patches or copies their private storage files.
  await writeFile(join(alpha,PROFILE_PATCH_FILENAME),'- id: EXAMPLE_row\n  config:\n    providers:\n      EXAMPLE_z: { model: EXAMPLE_z }\n      EXAMPLE_a: { model: EXAMPLE_a }\n    expression: !!js "globalThis.EXAMPLE_BACKUP_EXPRESSION_EXECUTED = true"\n    constructor: EXAMPLE_LITERAL\n');
  await unlink(join(beta,PROFILE_PATCH_FILENAME));
  await writeFile(join(home,PROFILE_PATCH_FILENAME),'- id: EXAMPLE_machine\n  disabled: true\n');
  await setProfileVersionExemption(alpha,'@example/backup-fixture@1.2.3','0.2.1-rc.2',true,true);
  const ctx=new Context();await ctx.plugin(Credentials,{dshHome:home,watch:false});await ctx.credentials.set(credentialRef('EXAMPLE_BACKUP_REFERENCE'),'EXAMPLE_CREDENTIAL_CANARY_PRIVATE');
  t.after(async()=>{await ctx.fiber.dispose();const part=relative(base,await realpath(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-profile-backup-EXAMPLE-'));await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
  const source={home,installAnchor:anchor,active:{name:'EXAMPLE_alpha',dir:alpha,cwd:root,startedBundles:['@example/backup-fixture'],overlays:[{id:'EXAMPLE_overlay',disabled:true}],telemetryDisabledEnv:'EXAMPLE_DISABLED'}};
  const files=[join(alpha,'package.json'),join(alpha,PROFILE_PATCH_FILENAME),join(alpha,PROFILE_COMPATIBILITY_FILENAME),join(beta,'package.json'),join(home,PROFILE_PATCH_FILENAME)];
  const before=await Promise.all(files.map(async path=>digest(await readFile(path))));
  return {root,home,alpha,beta,source,ctx,files,before,path:join(root,'EXAMPLE.dshbackup')};
}
async function decoded(path){const archive=await openBackupArchive(path,password),rows=[];try{for await(const item of archive.records()){const parts=[];for await(const bytes of item.data)parts.push(bytes);rows.push({metadata:item.metadata,bytes:Buffer.concat(parts)});}return rows;}finally{await archive.close();}}
async function* encoded(rows){for(const row of rows)yield {metadata:row.metadata,size:row.bytes.length,data:(async function*(){yield row.bytes;})()};}
test('C170: owned overlays are retained for an inactive profile without creating or changing source profile patches',async t=>{const f=await fixture(t),patch={id:'EXAMPLE_owned_overlay',disabled:true,config:{watchMaxProjects:11}},source={...f.source,additionalProfilePatches:[{profile:'EXAMPLE_beta',patches:[patch]}]};await writeProfileBackup(f.path,password,()=>source);const document=await readProfileBackup(f.path,password);assert.equal(document.profiles[1].patch.present,true);assert.deepEqual(document.profiles[1].patch.patches,[patch]);await assert.rejects(readFile(join(f.beta,PROFILE_PATCH_FILENAME)),{code:'ENOENT'});assert.deepEqual(await Promise.all(f.files.map(async file=>digest(await readFile(file)))),f.before);});
test('C170: fresh profile capture cannot renew away the initial owned-overlay revision',async t=>{const f=await fixture(t);let revision=0;const source=()=>{const captured=revision;return{...f.source,assertCurrent:async()=>{if(captured!==revision)throw new BackupError('BACKUP_SOURCE_CHANGED');}};};const lease=await prepareProfileBackup(source);try{revision++;await assert.rejects(lease.assertCurrent(),{code:'BACKUP_SOURCE_CHANGED'});}finally{lease.close();}});
for(const name of['EXAMPLE_missing','EXAMPLE_duplicate'])test('C170: '+name+' owned profile overlays refuse instead of disappearing from a complete snapshot',async t=>{const f=await fixture(t),row={profile:name==='EXAMPLE_missing'?name:'EXAMPLE_beta',patches:[]},additionalProfilePatches=name==='EXAMPLE_duplicate'?[row,row]:[row];await assert.rejects(writeProfileBackup(f.path,password,()=>({...f.source,additionalProfilePatches})),{code:'BACKUP_PROFILE_RECORD_INVALID'});await assert.rejects(readFile(f.path),{code:'ENOENT'});});

test('C91: public profile readers preserve every named profile, machine layer, order, expressions and compatibility without loading code',async t=>{
  const f=await fixture(t);await writeProfileBackup(f.path,password,()=>f.source);const result=await readProfileBackup(f.path,password);
  assert.deepEqual(result.profiles.map(value=>value.name),['EXAMPLE_alpha','EXAMPLE_beta']);const alpha=result.profiles[0],beta=result.profiles[1];
  assert.equal(alpha.manifest.exampleMarker,'EXAMPLE_MANIFEST');assert.deepEqual(alpha.dependencies,[{name:'@example/backup-fixture',version:'1.2.3',bundle:true,enabled:true}]);assert.deepEqual(Object.keys(alpha.patch.patches[0].config.providers),['EXAMPLE_z','EXAMPLE_a']);
  assert.equal(alpha.patch.patches[0].config.expression.__jsExpr,'globalThis.EXAMPLE_BACKUP_EXPRESSION_EXECUTED = true');assert.equal(alpha.patch.patches[0].config.constructor,'EXAMPLE_LITERAL');
  assert.equal(beta.patch.present,false);assert.equal(alpha.compatibility.present,true);assert.equal(beta.compatibility.present,false);assert.deepEqual(alpha.compatibility.exemptions,{'@example/backup-fixture@1.2.3':['0.2.1-rc.2']});
  assert.deepEqual(result.machine,{present:true,patches:[{id:'EXAMPLE_machine',disabled:true}]});assert.deepEqual(result.active.overlays,f.source.active.overlays);assert.equal(result.active.telemetryDisabled,true);
  assert.equal(result.coverage.restoreImplemented,false);assert.equal(result.coverage.packageManagerFiles,false);assert.equal(result.coverage.packageArtifacts,false);assert.equal(globalThis.EXAMPLE_BACKUP_PACKAGE_EXECUTED,undefined);assert.equal(globalThis.EXAMPLE_BACKUP_EXPRESSION_EXECUTED,undefined);
  assert.deepEqual(await Promise.all(f.files.map(async path=>digest(await readFile(path)))),f.before);
});

test('C91: credential-store values remain excluded and rotations do not invalidate unrelated logical profile data',async t=>{
  const f=await fixture(t);let rotated=false;
  const rows=(async function*(){for await(const item of profileBackupRecords(()=>f.source)){yield item;await f.ctx.credentials.set(credentialRef('EXAMPLE_BACKUP_REFERENCE'),'EXAMPLE_ROTATED_CREDENTIAL_PRIVATE');rotated=true;}})();
  await writeBackupArchive(f.path,password,rows);const result=await readProfileBackup(f.path,password),serialized=JSON.stringify(result);
  assert.equal(rotated,true);assert.equal(serialized.includes('EXAMPLE_CREDENTIAL_CANARY_PRIVATE'),false);assert.equal(serialized.includes('EXAMPLE_ROTATED_CREDENTIAL_PRIVATE'),false);assert.equal(result.coverage.credentialStoresIncluded,false);
});

test('C91: an SDK-retired bundle is preserved without triggering source profile cleanup',async t=>{
  const f=await fixture(t),manifest=readProfileManifest('EXAMPLE',f.alpha),retired='@deepseek-ai/dsh-experimental-schedule-bundle';
  manifest.dsh.profile.bundles.push(retired);writeProfileManifest(f.alpha,manifest);const before=await readFile(join(f.alpha,'package.json'));
  await writeProfileBackup(f.path,password,()=>f.source);const result=await readProfileBackup(f.path,password);
  assert.deepEqual(result.profiles[0].manifest.dsh.profile.bundles,manifest.dsh.profile.bundles);assert.deepEqual(await readFile(join(f.alpha,'package.json')),before);
});

test('C91: changing a source manifest after the logical record refuses final archive publication',async t=>{
  const f=await fixture(t),rows=(async function*(){for await(const item of profileBackupRecords(()=>f.source)){yield item;const manifest=readProfileManifest('EXAMPLE',f.alpha);manifest.exampleMarker='EXAMPLE_CHANGED';writeProfileManifest(f.alpha,manifest);}})();
  await assert.rejects(writeBackupArchive(f.path,password,rows),error=>error.code==='BACKUP_SOURCE_CHANGED');assert.equal((await readdir(f.root)).includes('EXAMPLE.dshbackup'),false);
});

test('C91: adding a previously absent named profile during backup refuses publication',async t=>{
  const f=await fixture(t),rows=(async function*(){for await(const item of profileBackupRecords(()=>f.source)){yield item;initProfile(resolveProfileDir('EXAMPLE_added',f.home),[]);}})();
  await assert.rejects(writeBackupArchive(f.path,password,rows),error=>error.code==='BACKUP_SOURCE_CHANGED');assert.equal((await readdir(f.root)).includes('EXAMPLE.dshbackup'),false);
});

test('C91: launch overlay and telemetry changes are tracked independently from persisted files',async t=>{
  const f=await fixture(t);let source=f.source;const rows=(async function*(){for await(const item of profileBackupRecords(()=>source)){yield item;source={...source,active:{...source.active,overlays:[],telemetryDisabledEnv:undefined}};}})();
  await assert.rejects(writeBackupArchive(f.path,password,rows),error=>error.code==='BACKUP_SOURCE_CHANGED');
});

test('C91: missing machine layer and an empty profile patch remain distinct',async t=>{
  const f=await fixture(t);await unlink(join(f.home,PROFILE_PATCH_FILENAME));initProfile(resolveProfileDir('EXAMPLE_empty',f.home),[]);await writeProfileBackup(f.path,password,()=>f.source);const result=await readProfileBackup(f.path,password);
  assert.deepEqual(result.machine,{present:false,patches:[]});assert.deepEqual(result.profiles.find(profile=>profile.name==='EXAMPLE_empty').patch,{present:true,patches:[]});assert.deepEqual(result.profiles.find(profile=>profile.name==='EXAMPLE_beta').patch,{present:false,patches:[]});
});

test('C91: shared profiles/node_modules is not confused with a user profile or modified',async t=>{
  const f=await fixture(t),shared=join(f.home,PROFILES_DIR,'node_modules');await mkdir(shared);await writeFile(join(shared,'EXAMPLE_keep.txt'),'EXAMPLE_SHARED_RESOLUTION');await writeProfileBackup(f.path,password,()=>f.source);const result=await readProfileBackup(f.path,password);assert.equal(result.profiles.length,2);assert.equal(await readFile(join(shared,'EXAMPLE_keep.txt'),'utf8'),'EXAMPLE_SHARED_RESOLUTION');
});

test('C91: linked profile directories are refused before following outside source paths',async t=>{
  const f=await fixture(t),outside=join(f.root,'EXAMPLE_outside'),target=join(f.home,PROFILES_DIR,'EXAMPLE_link');await mkdir(outside);
  try{await symlink(outside,target,process.platform==='win32'?'junction':'dir');}catch(error){if(['EPERM','EACCES'].includes(error.code))return;throw error;}
  await assert.rejects(writeProfileBackup(f.path,password,()=>f.source),error=>error.code==='BACKUP_PROFILE_FILE_INVALID');assert.deepEqual(await readdir(outside),[]);
});

test('C91: oversized source layers fail before parsing or publishing partial data',async t=>{
  const f=await fixture(t),file=await open(join(f.alpha,PROFILE_PATCH_FILENAME),'r+');try{await file.truncate(8*1024**2+1);}finally{await file.close();}
  await assert.rejects(writeProfileBackup(f.path,password,()=>f.source),error=>error.code==='BACKUP_PROFILE_LIMIT');assert.equal((await readdir(f.root)).includes('EXAMPLE.dshbackup'),false);
});

test('C91: an uninitialized directory is not silently invented as a valid backed-up profile',async t=>{
  const f=await fixture(t);await mkdir(join(f.home,PROFILES_DIR,'EXAMPLE_uninitialized'));
  await assert.rejects(writeProfileBackup(f.path,password,()=>f.source),error=>error.code==='BACKUP_PROFILE_MANIFEST_MISSING');assert.equal((await readdir(f.root)).includes('EXAMPLE.dshbackup'),false);
});

test('C91: authenticated snapshot data cannot promote omitted artifacts or package-manager files to restored coverage',async t=>{
  const f=await fixture(t);await writeProfileBackup(f.path,password,()=>f.source);const original=await decoded(f.path);
  for(const field of ['packageArtifacts','packageManagerFiles','restoreImplemented','credentialStoresIncluded']){
    const rows=original.map(row=>({metadata:structuredClone(row.metadata),bytes:Buffer.from(row.bytes)})),data=JSON.parse(rows[0].bytes);data.coverage[field]=true;rows[0].bytes=Buffer.from(JSON.stringify(data));const path=join(f.root,'EXAMPLE_forged_'+field);await writeBackupArchive(path,password,encoded(rows));await assert.rejects(readProfileBackup(path,password),error=>error.code==='BACKUP_PROFILE_RECORD_INVALID');
  }
});

test('C91: mixed purpose, extra records and invalid UTF8 are rejected after archive authentication',async t=>{
  const f=await fixture(t);await writeProfileBackup(f.path,password,()=>f.source);const original=await decoded(f.path);
  const rows=[...original,{metadata:{kind:'EXAMPLE_other'},bytes:Buffer.alloc(0)}],extra=join(f.root,'EXAMPLE_extra');await writeBackupArchive(extra,password,encoded(rows));await assert.rejects(readProfileBackup(extra,password),error=>error.code==='BACKUP_PROFILE_RECORD_INVALID');
  const invalid=join(f.root,'EXAMPLE_invalid');await writeBackupArchive(invalid,password,encoded([{metadata:original[0].metadata,bytes:Buffer.from([0xff])}]));await assert.rejects(readProfileBackup(invalid,password),error=>error.code==='BACKUP_DATA_JSON_INVALID');
});

test('C91: active profile mismatches and raw reader failures are refused with fixed diagnostics',async t=>{
  const f=await fixture(t);await assert.rejects(writeProfileBackup(f.path,password,()=>({...f.source,active:{...f.source.active,name:'EXAMPLE_missing'}})),error=>error.code==='BACKUP_PROFILE_ACTIVE_MISMATCH');
  await writeFile(join(f.alpha,PROFILE_PATCH_FILENAME),'- EXAMPLE_BAD: [EXAMPLE_PRIVATE_PARSE_REASON');await assert.rejects(writeProfileBackup(f.path,password,()=>f.source),error=>error.code==='BACKUP_PROFILE_READ_FAILED'&&!error.message.includes('EXAMPLE_PRIVATE_PARSE_REASON'));
});
