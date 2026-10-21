import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,realpath,rm,symlink,chmod,stat} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {Context} from '@deepseek-ai/cordis';
import {FileSystemSkillProvider} from '@deepseek-ai/dsh-skill-filesystem';
import {SkillRegistry} from '@deepseek-ai/dsh-skill';
import {writeSkillBackup,restoreSkillBackup,skillBackupRecords,writeBackupArchive,openBackupArchive,assertSkillResourcePath} from '../packages/dsh-zhen/lib/backup.js';

const password='EXAMPLE skill resources archive password';
const skill=(name,body)=>`---\nname: ${name}\ndescription: EXAMPLE skill source\n---\n${body}\n`;
async function put(path,data){await mkdir(join(path,'..'),{recursive:true});await writeFile(path,data);}
async function fixture(t){
  const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-skill-backup-EXAMPLE-'))),a=join(root,'library-a'),b=join(root,'library-b'),parent=join(root,'candidates'),native=join(root,'EXAMPLE-protected');
  for(const path of [a,b,parent,native])await mkdir(path);await put(join(native,'EXAMPLE-do-not-read.db'),'EXAMPLE_PROTECTED_BYTES');
  await put(join(a,'same-skill','SKILL.md'),skill('example-shared','EXAMPLE_A [helper](scripts/run-example.mjs)'));await put(join(b,'same-skill','SKILL.md'),skill('example-shared','EXAMPLE_B'));
  await put(join(a,'flat.md'),skill('example-flat','EXAMPLE_FLAT [shared](shared-assets/EXAMPLE.bin)'));await put(join(a,'shared-assets','EXAMPLE.bin'),Buffer.alloc(1024*1024+7,149));
  const script=join(a,'same-skill','scripts','run-example.mjs');await put(script,`import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(join(root,'EXAMPLE_EXECUTED'))},'EXAMPLE');`);if(process.platform!=='win32')await chmod(script,0o700);
  await put(join(a,'unfinished','SKILL.md'),'EXAMPLE not valid frontmatter');await mkdir(join(a,'empty-resource-directory'));await put(join(a,'.git','config'),'EXAMPLE_PRIVATE_GIT_CREDENTIAL');
  const roots=[{key:'EXAMPLE-a',path:a,kind:'custom',mode:'library',enabled:true,provenance:{provider:'EXAMPLE-github',commit:'a'.repeat(40)}},{key:'EXAMPLE-b',path:b,kind:'custom',mode:'library',enabled:false}];
  const selection={roots,protectedContainers:[root],forbiddenTrees:[native]};
  t.after(async()=>{const part=relative(base,await realpath(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-skill-backup-EXAMPLE-'));await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
  return {root,a,b,parent,native,script,selection,path:join(root,'EXAMPLE.dshbackup')};
}
async function projection(t,roots){
  const ctx=new Context(),abort=new AbortController(),provider=new FileSystemSkillProvider(ctx,{signal:abort.signal,invalidate(){}},{includeDefaultRoots:false,customSkillDirs:roots,watch:false});
  t.after(async()=>{abort.abort();await provider.dispose();await ctx.fiber.dispose();});const result=await provider.list({});assert.ok(Array.isArray(result));return {ctx,provider,candidates:result};
}
async function decoded(path){const archive=await openBackupArchive(path,password),rows=[];try{for await(const item of archive.records()){const parts=[];for await(const bytes of item.data)parts.push(bytes);rows.push({metadata:item.metadata,bytes:Buffer.concat(parts)});}return rows;}finally{await archive.close();}}
async function* encoded(rows){for(const row of rows)yield {metadata:row.metadata,size:row.bytes.length,data:(async function*(){yield row.bytes;})()};}
async function forge(f,change,label){const rows=await decoded(f.path),manifest=JSON.parse(rows[0].bytes);change(manifest,rows);rows[0].bytes=Buffer.from(JSON.stringify(manifest));const path=join(f.root,'EXAMPLE_'+label);await writeBackupArchive(path,password,encoded(rows));return path;}

test('C92: full declared skill roots preserve shadowed definitions, flat shared resources, scripts, binaries and empty directories',async t=>{
  const f=await fixture(t),original=await projection(t,[f.a,f.b]);assert.equal(original.candidates.filter(item=>item.name==='example-shared').length,2);
  await writeSkillBackup(f.path,password,()=>f.selection);const result=await restoreSkillBackup(f.path,password,f.parent);assert.equal(result.activated,false);assert.equal(result.roots[1].origin.enabled,false);assert.deepEqual(result.roots[0].origin.provenance,f.selection.roots[0].provenance);
  const restored=await projection(t,result.roots.map(item=>item.restoredPath));assert.deepEqual(restored.candidates.map(item=>item.name),original.candidates.map(item=>item.name));
  for(const candidate of restored.candidates){const definition=await restored.provider.get(candidate,{});assert.ok(definition?.content);assert.ok(definition.path.startsWith(result.root));}
  assert.equal((await readFile(join(result.roots[1].restoredPath,'same-skill','SKILL.md'),'utf8')).includes('EXAMPLE_B'),true);
  assert.deepEqual(await readFile(join(result.roots[0].restoredPath,'shared-assets','EXAMPLE.bin')),await readFile(join(f.a,'shared-assets','EXAMPLE.bin')));
  assert.deepEqual(await readFile(join(result.roots[0].restoredPath,'same-skill','scripts','run-example.mjs')),await readFile(f.script));assert.deepEqual(await readdir(join(result.roots[0].restoredPath,'empty-resource-directory')),[]);
  assert.equal(await readFile(join(result.roots[0].restoredPath,'unfinished','SKILL.md'),'utf8'),'EXAMPLE not valid frontmatter');assert.equal((await readdir(f.root)).includes('EXAMPLE_EXECUTED'),false);
});

test('C92: SDK user-dsh reserved system skills and VCS metadata are omitted explicitly without losing ordinary assets',async t=>{
  const f=await fixture(t);f.selection.roots[0].kind='user-dsh';await put(join(f.a,'.system','EXAMPLE','SKILL.md'),skill('example-system','EXAMPLE_RESERVED'));await writeSkillBackup(f.path,password,()=>f.selection);
  const rows=await decoded(f.path),manifest=JSON.parse(rows[0].bytes);assert.deepEqual(manifest.roots[0].excludedMetadata,['.git','.system']);assert.equal(rows.some(row=>row.bytes.includes(Buffer.from('EXAMPLE_PRIVATE_GIT_CREDENTIAL'))),false);assert.equal(rows.some(row=>row.bytes.includes(Buffer.from('EXAMPLE_RESERVED'))),false);
  const restored=await restoreSkillBackup(f.path,password,f.parent);assert.equal((await readdir(restored.roots[0].restoredPath)).includes('.git'),false);assert.equal((await readdir(restored.roots[0].restoredPath)).includes('.system'),false);
});

test('C92: a real published registry selects a winner while both original definitions remain recoverable',async t=>{
  const register=(ctx,roots)=>ctx.skills.registerProvider(control=>{const provider=new FileSystemSkillProvider(ctx,control,{includeDefaultRoots:false,customSkillDirs:roots,watch:false});t.after(()=>provider.dispose());return provider;});
  const f=await fixture(t),source=await projection(t,[f.a,f.b]);await source.ctx.plugin(SkillRegistry);register(source.ctx,[f.a,f.b]);const winners=await source.ctx.skills.list();assert.equal(winners.filter(item=>item.name==='example-shared').length,1);
  await writeSkillBackup(f.path,password,()=>f.selection);const result=await restoreSkillBackup(f.path,password,f.parent),restored=await projection(t,result.roots.map(item=>item.restoredPath));assert.equal(restored.candidates.filter(item=>item.name==='example-shared').length,2);
  await restored.ctx.plugin(SkillRegistry);register(restored.ctx,result.roots.map(item=>item.restoredPath));assert.equal((await restored.ctx.skills.get('example-shared'))?.content,(await source.ctx.skills.get('example-shared'))?.content);
});

test('C92: whole workspaces and any forbidden-tree overlap refuse before resource capture',async t=>{
  const f=await fixture(t);await assert.rejects(writeSkillBackup(f.path,password,()=>({...f.selection,roots:[{...f.selection.roots[0],path:f.root}]})),error=>error.code==='BACKUP_SKILL_SCOPE_REFUSED');
  await assert.rejects(writeSkillBackup(f.path,password,()=>({...f.selection,forbiddenTrees:[f.a]})),error=>error.code==='BACKUP_SKILL_SCOPE_REFUSED');
  await assert.rejects(writeSkillBackup(f.path,password,()=>({...f.selection,forbiddenTrees:[join(f.a,'shared-assets')]})),error=>error.code==='BACKUP_SKILL_SCOPE_REFUSED');assert.equal(await readFile(join(f.native,'EXAMPLE-do-not-read.db'),'utf8'),'EXAMPLE_PROTECTED_BYTES');
});

test('C92: linked resources are rejected and the external directory remains unchanged',async t=>{
  const f=await fixture(t),link=join(f.a,'EXAMPLE_link');try{await symlink(f.native,link,process.platform==='win32'?'junction':'dir');}catch(error){if(['EPERM','EACCES'].includes(error.code))return;throw error;}
  await assert.rejects(writeSkillBackup(f.path,password,()=>f.selection),error=>error.code==='BACKUP_SKILL_LINK_REFUSED');assert.deepEqual(await readdir(f.native),['EXAMPLE-do-not-read.db']);
});

test('C92: changes between manifest and file reads refuse final archive publication',async t=>{
  const f=await fixture(t),rows=(async function*(){for await(const item of skillBackupRecords(()=>f.selection)){yield item;if(item.metadata.kind==='skill-manifest')await writeFile(join(f.a,'flat.md'),skill('example-flat','EXAMPLE_CHANGED'));}})();
  await assert.rejects(writeBackupArchive(f.path,password,rows),error=>error.code==='BACKUP_SOURCE_CHANGED');assert.equal((await readdir(f.root)).includes('EXAMPLE.dshbackup'),false);
});

test('C92: late resource additions are detected even when directory timestamps are not used as revisions',async t=>{
  const f=await fixture(t);let added=false;const rows=(async function*(){for await(const item of skillBackupRecords(()=>f.selection)){yield item;if(!added&&item.metadata.kind==='skill-file'){added=true;await writeFile(join(f.a,'EXAMPLE_added.bin'),Buffer.from([1,2,3]));}}})();
  await assert.rejects(writeBackupArchive(f.path,password,rows),error=>error.code==='BACKUP_SOURCE_CHANGED');assert.equal((await readdir(f.root)).includes('EXAMPLE.dshbackup'),false);
});

test('C92: excluded VCS metadata changes do not invalidate unchanged skill resources',async t=>{
  const f=await fixture(t),rows=(async function*(){for await(const item of skillBackupRecords(()=>f.selection)){yield item;if(item.metadata.kind==='skill-manifest')await writeFile(join(f.a,'.git','config'),'EXAMPLE_NEW_PRIVATE_GIT_CREDENTIAL');}})();
  await writeBackupArchive(f.path,password,rows);const result=await restoreSkillBackup(f.path,password,f.parent);assert.equal(result.files>0,true);assert.equal((await readdir(result.roots[0].restoredPath)).includes('.git'),false);
});

test('C92: source enablement and provenance changes invalidate a pending snapshot',async t=>{
  const f=await fixture(t);let selection=f.selection;const rows=(async function*(){for await(const item of skillBackupRecords(()=>selection)){yield item;if(item.metadata.kind==='skill-manifest')selection={...selection,roots:selection.roots.map((root,index)=>index===1?{...root,enabled:true}:root)};}})();
  await assert.rejects(writeBackupArchive(f.path,password,rows),error=>error.code==='BACKUP_SOURCE_CHANGED');
});

test('C92: absent declared roots stay absent and do not acquire an empty active installation',async t=>{
  const f=await fixture(t);f.selection.roots.push({key:'EXAMPLE-absent',path:join(f.root,'EXAMPLE_missing'),kind:'custom',mode:'library',enabled:false});await writeSkillBackup(f.path,password,()=>f.selection);const result=await restoreSkillBackup(f.path,password,f.parent),missing=result.roots[2];assert.equal(missing.present,false);await assert.rejects(stat(missing.restoredPath),error=>error.code==='ENOENT');
});

test('C92: private root provenance remains data and accessors are never invoked',async t=>{
  const f=await fixture(t);f.selection.roots[0].provenance=JSON.parse('{"__proto__":{"EXAMPLE":"DATA"},"constructor":"EXAMPLE_DATA"}');await writeSkillBackup(f.path,password,()=>f.selection);const result=await restoreSkillBackup(f.path,password,f.parent);assert.equal(result.roots[0].origin.provenance.constructor,'EXAMPLE_DATA');assert.equal(Object.hasOwn(result.roots[0].origin.provenance,'__proto__'),true);assert.equal({}.EXAMPLE,undefined);
  let calls=0;const bad=Object.defineProperty({},'EXAMPLE',{enumerable:true,get(){calls++;return 'EXAMPLE_PRIVATE';}});await assert.rejects(writeSkillBackup(join(f.root,'EXAMPLE_bad'),password,()=>({...f.selection,roots:[{...f.selection.roots[0],provenance:bad}]})),error=>error.code==='BACKUP_DATA_JSON_INVALID');assert.equal(calls,0);
});

test('C92: omitted file records and digest mismatches clean only the fresh candidate',async t=>{
  const f=await fixture(t);await writeSkillBackup(f.path,password,()=>f.selection);const rows=await decoded(f.path),missing=join(f.root,'EXAMPLE_missing_file');await writeBackupArchive(missing,password,encoded(rows.filter((row,index)=>index!==1)));await assert.rejects(restoreSkillBackup(missing,password,f.parent),error=>error.code==='BACKUP_SKILL_FILE_MISSING');assert.deepEqual(await readdir(f.parent),[]);
  const bad=await forge(f,(_manifest,records)=>{records[1].bytes[0]^=1;},'bad_digest');await assert.rejects(restoreSkillBackup(bad,password,f.parent),error=>error.code==='BACKUP_SKILL_DIGEST_MISMATCH');assert.deepEqual(await readdir(f.parent),[]);
});

test('C92: traversal, device names and case collisions are refused before creating restore directories',async t=>{
  const f=await fixture(t);await writeSkillBackup(f.path,password,()=>f.selection);
  for(const [label,change]of [['traversal',manifest=>{manifest.nodes[0].parts=['..','EXAMPLE_escape'];}],['device',manifest=>{manifest.nodes[0].parts=['CON.txt'];}],['collision',manifest=>{manifest.nodes.push({...manifest.nodes[0],parts:manifest.nodes[0].parts.map(part=>part.toUpperCase())});}]]){
    const bad=await forge(f,change,label);await assert.rejects(restoreSkillBackup(bad,password,f.parent));assert.deepEqual(await readdir(f.parent),[]);
  }
});

test('C92: inconsistent exclusions and undeclared parent directories refuse authenticated malformed manifests',async t=>{
  const f=await fixture(t);await writeSkillBackup(f.path,password,()=>f.selection);
  const excluded=await forge(f,manifest=>{manifest.roots[0].excludedMetadata=[];},'bad_exclusions');await assert.rejects(restoreSkillBackup(excluded,password,f.parent),error=>error.code==='BACKUP_SKILL_MANIFEST_INVALID');
  const parent=await forge(f,manifest=>{const node=manifest.nodes.find(item=>item.kind==='file');node.parts=['EXAMPLE_undeclared',...node.parts];},'bad_parent');await assert.rejects(restoreSkillBackup(parent,password,f.parent),error=>error.code==='BACKUP_SKILL_MANIFEST_INVALID');assert.deepEqual(await readdir(f.parent),[]);
});

test('C92: duplicate file records cannot overwrite a candidate object or original user data',async t=>{
  const f=await fixture(t);await writeSkillBackup(f.path,password,()=>f.selection);const rows=await decoded(f.path);rows.push(rows[1]);const bad=join(f.root,'EXAMPLE_duplicate');await writeBackupArchive(bad,password,encoded(rows));await assert.rejects(restoreSkillBackup(bad,password,f.parent),error=>error.code==='BACKUP_SKILL_FILE_INVALID');assert.deepEqual(await readdir(f.parent),[]);assert.equal((await readFile(join(f.b,'same-skill','SKILL.md'),'utf8')).includes('EXAMPLE_B'),true);
});

test('C92: budgets, aborts and wrong passwords never publish or activate a partial restore',async t=>{
  const f=await fixture(t);await assert.rejects(writeSkillBackup(f.path,password,()=>f.selection,{limits:{recordBytes:128}}),error=>error.code==='BACKUP_RECORD_SIZE_INVALID');assert.equal((await readdir(f.root)).includes('EXAMPLE.dshbackup'),false);
  await writeSkillBackup(f.path,password,()=>f.selection);await assert.rejects(restoreSkillBackup(f.path,'EXAMPLE incorrect skill password',f.parent),error=>error.code==='BACKUP_AUTHENTICATION_FAILED');assert.deepEqual(await readdir(f.parent),[]);
  const abort=new AbortController();abort.abort(new Error('EXAMPLE_CANCEL'));await assert.rejects(restoreSkillBackup(f.path,password,f.parent,{signal:abort.signal}),/EXAMPLE_CANCEL/);assert.deepEqual(await readdir(f.parent),[]);
});

test('C92: portable path preflight rejects superscript device aliases without opening filesystem objects',()=>{
  for(const name of ['COM¹.txt','LPT²','CONIN$','CONOUT$'])assert.throws(()=>assertSkillResourcePath([name]),error=>error.code==='BACKUP_SKILL_PATH_INVALID');
  assert.doesNotThrow(()=>assertSkillResourcePath(['EXAMPLE-directory','普通资料.txt']));
});

test('C92: VCS exclusions include case variants without opening their configuration',async t=>{
  const f=await fixture(t);await put(join(f.b,'.GIT','config'),'EXAMPLE_UPPERCASE_PRIVATE_GIT_CREDENTIAL');await writeSkillBackup(f.path,password,()=>f.selection);const rows=await decoded(f.path);assert.equal(rows.some(row=>row.bytes.includes(Buffer.from('EXAMPLE_UPPERCASE_PRIVATE_GIT_CREDENTIAL'))),false);
  const result=await restoreSkillBackup(f.path,password,f.parent);assert.equal((await readdir(result.roots[1].restoredPath)).includes('.GIT'),false);
});

test('C92: archived origin paths remain provenance and never choose a restore destination',async t=>{
  const f=await fixture(t);await writeSkillBackup(f.path,password,()=>f.selection);const forged=await forge(f,manifest=>{manifest.roots[0].path=f.native;manifest.roots[0].canonicalRoot=f.native;},'forged_origin');const result=await restoreSkillBackup(forged,password,f.parent);
  assert.equal(result.roots[0].origin.path,f.native);assert.equal(Object.hasOwn(result.roots[0],'path'),false);assert.ok(result.roots[0].restoredPath.startsWith(result.root));assert.deepEqual(await readdir(f.native),['EXAMPLE-do-not-read.db']);assert.equal(await readFile(join(f.native,'EXAMPLE-do-not-read.db'),'utf8'),'EXAMPLE_PROTECTED_BYTES');
});

test('C92: source normalization collisions refuse backup before publishing an unrestorable archive',async t=>{
  const f=await fixture(t);await put(join(f.a,'EXAMPLE_A.txt'),'EXAMPLE_ASCII');await put(join(f.a,'EXAMPLE_Ａ.txt'),'EXAMPLE_FULLWIDTH');
  await assert.rejects(writeSkillBackup(f.path,password,()=>f.selection),error=>error.code==='BACKUP_SKILL_PATH_COLLISION');assert.equal((await readdir(f.root)).includes('EXAMPLE.dshbackup'),false);
});
