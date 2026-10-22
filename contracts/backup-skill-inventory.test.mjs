import {summarizeSkills} from '../packages/dsh-zhen/lib/backup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,realpath,rm,rename,copyFile} from 'node:fs/promises';
import {existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Context} from '@deepseek-ai/cordis';
import {FileSystemSkillProvider} from '@deepseek-ai/dsh-skill-filesystem';
import {LocalSkills} from '../packages/dsh-zhen/lib/local-skills.js';
import {GithubSkills} from '../packages/dsh-zhen/lib/github-skills.js';
import {SkillMarket,readBundledCatalog} from '../packages/dsh-zhen/lib/market.js';
import {SkillFeed} from '../packages/dsh-zhen/lib/skill-feed.js';
import {LOCAL_SKILL_POLICY} from '../packages/dsh-zhen/lib/local-skills-schema.js';
import {GITHUB_SKILL_POLICY} from '../packages/dsh-zhen/lib/github-skills-schema.js';
import {collectSkillBackupInventory,resolveSkillFilesystem,writeSkillInventoryBackup,restoreSkillInventoryBackup,skillInventoryBackupRecords,openBackupArchive,writeBackupArchive} from '../packages/dsh-zhen/lib/backup.js';
import {githubSkillFixture} from './fixtures/github-skills.mjs';

const password='EXAMPLE inventory archive password',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const skill=(name,body='EXAMPLE_BODY')=>`---\nname: ${name}\ndescription: EXAMPLE skill\n---\n${body}\n`;
const base=readBundledCatalog()[0];
function release(version,id=base.manifest.id){const description='EXAMPLE backup test',content=`---\nname: ${id}\ndescription: ${JSON.stringify(description)}\n---\nEXAMPLE_RELEASE_${version}\n`;return {manifest:{...base.manifest,id,description,version,digest:sha(content)},content};}
async function put(path,bytes){await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}
async function removeOwned(root,path){const actual=await realpath(path),part=relative(root,actual);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..'));await rm(actual,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
async function fixture(t){
  const temp=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(temp,'dsh-inventory-EXAMPLE-'))),parent=join(root,'candidates'),project=join(root,'project'),cwd=join(project,'src','nested'),a=join(root,'local-a'),b=join(root,'local-b'),native=join(root,'EXAMPLE-protected'),home=join(root,'home'),agents=join(root,'agents'),custom=join(root,'custom'),bundled=join(root,'bundled');
  for(const path of [parent,cwd,a,b,native,home,agents,custom,bundled])await mkdir(path,{recursive:true});await mkdir(join(project,'.git'));await put(join(native,'EXAMPLE_DO_NOT_READ.db'),'EXAMPLE_PROTECTED');
  const sdkRoots=[join(project,'.dsh','skills'),join(project,'.agents','skills'),custom,join(home,'skills'),join(agents,'skills'),bundled];
  for(const [index,path]of sdkRoots.entries())await put(join(path,'sample','SKILL.md'),skill('example-sdk-'+index));
  await put(join(a,'same','SKILL.md'),skill('example-local-shared'));await put(join(b,'same','SKILL.md'),skill('example-local-shared','EXAMPLE_DISABLED'));
  await put(join(a,'same','scripts','EXAMPLE.mjs'),'throw new Error("EXAMPLE_MUST_NOT_RUN");');await put(join(a,'EXAMPLE_SHARED.bin'),Buffer.from([4,0,8,255]));
  const local=new LocalSkills(join(root,'local-state.json'),1000000);
  for(const path of [a,b]){const preview=await local.preview(path,'library');await local.connect(path,'library',preview.digest,LOCAL_SKILL_POLICY);}local.disable(local.backupState().sources[1].id);
  const git=githubSkillFixture(root),github=new GithubSkills(join(root,'github'),git.fetcher);
  const first=(await github.download(git.spec)).release;github.approve(first.sourceId,first.digest,GITHUB_SKILL_POLICY);git.setHead(git.second);const second=(await github.download(git.spec)).release;github.approve(second.sourceId,second.digest,GITHUB_SKILL_POLICY);
  const initial=release('1.0.0'),next=release('1.1.0'),marketFile=join(root,'market.sqlite'),market=new SkillMarket(marketFile,[initial]);market.select(initial.manifest.id,initial.manifest.digest);market.offerRemoteCatalog([next]);market.select(next.manifest.id,next.manifest.digest,next.manifest.version);const personal=market.fork(initial.manifest.id,initial.manifest.digest,'EXAMPLE_PRIVATE_PERSONAL');
  const feedFile=join(root,'feed.json'),feed=new SkillFeed(feedFile,market,async()=>{throw new Error('EXAMPLE_NO_NETWORK');});feed.setAutomatic(false);
  const source={filesystem:[{id:'EXAMPLE-filesystem',mode:'host-local',config:{providerName:'EXAMPLE-filesystem',dshHome:home,agentsHome:agents,customSkillDirs:[custom],bundledSkillDir:bundled,watch:false}}],workspaces:[cwd,cwd],local,github,market,feed,protectedContainers:[root],forbiddenTrees:[native]};
  t.after(async()=>{local.close();github.close();market.close();const part=relative(temp,await realpath(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-inventory-EXAMPLE-'));await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
  return {root,parent,project,cwd,a,b,native,home,agents,custom,bundled,sdkRoots,local,github,git,market,marketFile,feed,feedFile,source,initial,next,first,second,personal,path:join(root,'EXAMPLE.encrypted')};
}
async function rows(path){const reader=await openBackupArchive(path,password),result=[];try{for await(const record of reader.records()){const parts=[];for await(const bytes of record.data)parts.push(bytes);result.push({metadata:record.metadata,bytes:Buffer.concat(parts)});}return result;}finally{await reader.close();}}
async function* records(items){for(const row of items)yield {metadata:row.metadata,size:row.bytes.length,data:(async function*(){yield row.bytes;})()};}
async function forged(f,change,label){const items=await rows(f.path),document=JSON.parse(items[0].bytes);change(document,items);items[0].bytes=Buffer.from(JSON.stringify(document));const path=join(f.root,'EXAMPLE_'+label);await writeBackupArchive(path,password,records(items));return path;}

test('C93: effective project/custom/user/bundled roots match a real published filesystem provider without a winner filter',async t=>{
  const f=await fixture(t),{document}=await collectSkillBackupInventory(f.source);assert.equal(document.projects.length,1);assert.equal(document.projects[0].projectRoot,f.project);assert.deepEqual(document.roots.filter(row=>row.provenance.provider==='EXAMPLE-filesystem').map(row=>row.path),f.sdkRoots);
  const ctx=new Context(),abort=new AbortController(),provider=new FileSystemSkillProvider(ctx,{signal:abort.signal,invalidate(){}},f.source.filesystem[0].config);t.after(async()=>{abort.abort();await provider.dispose();await ctx.fiber.dispose();});
  const observed=await provider.list({cwd:f.cwd});assert.equal(observed.length,6);for(const item of observed){const root=document.roots.find(row=>row.path===dirname(dirname(item.locator.path)));assert.ok(root);assert.equal(root.provenance.role,item.source);}
});

test('C93: complete encrypted inventory restores resources and offline source/market state without activation or network',async t=>{
  const f=await fixture(t),calls=f.git.calls.length,before={local:f.local.backupState(),github:f.github.backupState(),market:f.market.backupState(),feed:f.feed.backupState()};await writeSkillInventoryBackup(f.path,password,()=>f.source);const result=await restoreSkillInventoryBackup(f.path,password,f.parent);
  assert.equal(result.activated,false);assert.equal(result.inventory.coverage.wholeApplicationRestore,false);assert.deepEqual(result.inventory.local,before.local);assert.deepEqual(result.inventory.market,before.market);assert.deepEqual(result.inventory.feed,before.feed);assert.equal(result.inventory.github.sources[0].pending,f.second.digest);assert.equal(result.inventory.github.running[0].digest,f.first.digest);
  const restored=result.roots.find(row=>row.origin.key==='local:'+before.local.sources[0].id);assert.deepEqual(await readFile(join(restored.restoredPath,'EXAMPLE_SHARED.bin')),await readFile(join(f.a,'EXAMPLE_SHARED.bin')));assert.equal(result.roots.find(row=>row.origin.key==='local:'+before.local.sources[1].id).origin.enabled,false);
  for(const value of result.roots.filter(row=>row.origin.provenance.provider==='dsh-zhen-github-skills'))assert.deepEqual(await readFile(join(value.restoredPath,'package','assets','example.bin')),Buffer.from([255,0,254]));
  assert.deepEqual(JSON.parse(await readFile(join(result.root,'dsh-zhen-skill-inventory.json'),'utf8')),result.inventory);assert.equal((await readFile(f.path)).includes(Buffer.from('EXAMPLE_PRIVATE_PERSONAL')),false);assert.equal(f.git.calls.length,calls);assert.deepEqual({local:f.local.backupState(),github:f.github.backupState(),market:f.market.backupState(),feed:f.feed.backupState()},before);
});

test('C93: a workspace without a Git marker uses the same cwd root as the published provider',async t=>{
  const f=await fixture(t),cwd=join(f.root,'EXAMPLE_standalone');await mkdir(cwd);await put(join(cwd,'.dsh','skills','standalone','SKILL.md'),skill('example-fallback'));f.source.workspaces=[cwd];const {document}=await collectSkillBackupInventory(f.source);assert.equal(document.projects[0].projectRoot,cwd);
  const ctx=new Context(),abort=new AbortController(),provider=new FileSystemSkillProvider(ctx,{signal:abort.signal,invalidate(){}},f.source.filesystem[0].config);t.after(async()=>{abort.abort();await provider.dispose();await ctx.fiber.dispose();});const candidates=await provider.list({cwd}),item=candidates.find(row=>row.name==='example-fallback');assert.equal(item.locator.path,join(cwd,'.dsh','skills','standalone','SKILL.md'));assert.ok(document.roots.some(row=>row.path===join(cwd,'.dsh','skills')));
});

test('C93: the nearest Git marker file selects a nested project without reading its content',async t=>{
  const f=await fixture(t),nearest=dirname(f.cwd);await put(join(nearest,'.git'),'EXAMPLE_PRIVATE_MARKER_CONTENT');await put(join(nearest,'.agents','skills','nested','SKILL.md'),skill('example-nearest'));const {document}=await collectSkillBackupInventory(f.source);assert.equal(document.projects[0].projectRoot,nearest);assert.equal(JSON.stringify(document).includes('EXAMPLE_PRIVATE_MARKER_CONTENT'),false);
  const ctx=new Context(),abort=new AbortController(),provider=new FileSystemSkillProvider(ctx,{signal:abort.signal,invalidate(){}},f.source.filesystem[0].config);t.after(async()=>{abort.abort();await provider.dispose();await ctx.fiber.dispose();});const candidates=await provider.list({cwd:f.cwd});assert.ok(candidates.some(row=>row.name==='example-nearest'));assert.equal(candidates.some(row=>row.name==='example-sdk-0'),false);
});

test('C93: backup includes retained market versions beyond the UI history limit and keeps their order',async t=>{
  const f=await fixture(t);for(let i=1;i<=55;i++){const item=release('2.0.'+i);f.market.offerRemoteCatalog([item]);f.market.select(item.manifest.id,item.manifest.digest,item.manifest.version);}
  assert.equal(f.market.versions(f.initial.manifest.id).length,50);const {document}=await collectSkillBackupInventory(f.source),retained=document.market.versions.filter(row=>row.package.manifest.id===f.initial.manifest.id);assert.equal(retained.length,57);assert.equal(retained[0].package.manifest.version,'1.0.0');assert.equal(retained.at(-1).package.manifest.version,'2.0.55');await writeSkillInventoryBackup(f.path,password,()=>f.source);const restored=await restoreSkillInventoryBackup(f.path,password,f.parent),details=summarizeSkills(restored).summary;assert.equal(details.counts.skillVersions,document.market.versions.length);assert.ok(details.counts.skillVersions>=57);assert.ok(details.warnings.includes('PERMISSIONS_REVIEW_REQUIRED'));
});

test('C93: bundled and remote candidate union larger than one feed is preserved',async t=>{
  const f=await fixture(t),catalog=Array.from({length:100},(_,i)=>release('1.0.0','zhen-example-inventory-'+i));f.market.offerRemoteCatalog(catalog);const {document}=await collectSkillBackupInventory(f.source);assert.equal(document.market.catalog.length,101);assert.equal(document.market.bundled.length,1);
});

test('C93: forgotten GitHub sources retain every orphan release for offline recovery without reapproval',async t=>{
  const f=await fixture(t);f.github.forget(f.first.sourceId);const {document}=await collectSkillBackupInventory(f.source);assert.deepEqual(document.github.sources,[]);assert.equal(document.github.releases.length,2);assert.equal(document.roots.filter(row=>row.provenance.provider==='dsh-zhen-github-skills').every(row=>!row.enabled),true);
});

test('C93: a missing disabled local root remains declared and absent in the restore candidate',async t=>{
  const f=await fixture(t),id=f.local.backupState().sources[1].id;await removeOwned(f.root,f.b);await writeSkillInventoryBackup(f.path,password,()=>f.source);const result=await restoreSkillInventoryBackup(f.path,password,f.parent),missing=result.roots.find(row=>row.origin.key==='local:'+id);assert.equal(missing.present,false);assert.equal(existsSync(missing.restoredPath),false);
});

test('C93: changed local root identity refuses backup rather than trusting replacement resources',async t=>{
  const f=await fixture(t),target=join(f.root,'EXAMPLE_retained_local');assert.ok(relative(f.root,target)&&!relative(f.root,target).startsWith('..'));await rename(f.a,target);await mkdir(f.a);await put(join(f.a,'SKILL.md'),skill('example-replacement'));
  await assert.rejects(writeSkillInventoryBackup(f.path,password,()=>f.source),error=>error.code==='BACKUP_SKILL_SOURCE_IDENTITY_CHANGED');assert.equal(existsSync(f.path),false);
});

test('C93: service snapshots are detached and a market read transaction leaves original database bytes unchanged',async t=>{
  const f=await fixture(t),bytes=await readFile(f.marketFile),state=f.market.backupState();state.versions[0].package.content='EXAMPLE_CHANGED';assert.notEqual(f.market.backupState().versions[0].package.content,'EXAMPLE_CHANGED');assert.deepEqual(await readFile(f.marketFile),bytes);
  const local=f.local.backupState();local.sources[0].enabled=false;assert.equal(f.local.backupState().sources[0].enabled,true);const github=f.github.backupState();github.sources[0].automatic=false;assert.equal(f.github.backupState().sources[0].automatic,true);const feed=f.feed.backupState();feed.status.message='EXAMPLE_CHANGED';assert.notEqual(f.feed.backupState().status.message,'EXAMPLE_CHANGED');
});

for(const [label,change]of [
  ['local policy',f=>f.local.disable(f.local.backupState().sources[0].id)],
  ['market update policy',f=>f.market.setAutoUpdates(true)],
  ['GitHub update policy',f=>f.github.automatic(f.first.sourceId,false)],
  ['feed scheduling',f=>f.feed.setAutomatic(true)],
  ['forbidden scope',f=>f.source.forbiddenTrees.push(join(f.root,'EXAMPLE_new_protected'))],
])test('C93: changing '+label+' after the inventory record refuses final archive publication',async t=>{
  const f=await fixture(t),items=(async function*(){for await(const item of skillInventoryBackupRecords(()=>f.source)){yield item;if(item.metadata.kind==='skill-inventory')change(f);}})();await assert.rejects(writeBackupArchive(f.path,password,items),error=>error.code==='BACKUP_SOURCE_CHANGED');assert.equal(existsSync(f.path),false);
});

test('C93: policy arrays are detached from their caller before later asynchronous resource operations',async t=>{
  const f=await fixture(t),result=await collectSkillBackupInventory(f.source);f.source.forbiddenTrees.push(join(f.root,'EXAMPLE_extra'));assert.equal(result.selection.forbiddenTrees.length,1);assert.notEqual(result.selection.protectedContainers,f.source.protectedContainers);
});

test('C93: inventory/resource-root disagreement rejects an authenticated archive before creating candidates',async t=>{
  const f=await fixture(t);await writeSkillInventoryBackup(f.path,password,()=>f.source);const path=await forged(f,(_document,items)=>{const manifest=JSON.parse(items[1].bytes);manifest.roots[0].enabled=false;items[1].bytes=Buffer.from(JSON.stringify(manifest));},'root_mismatch');await assert.rejects(restoreSkillInventoryBackup(path,password,f.parent),error=>error.code==='BACKUP_SKILL_INVENTORY_ROOTS_MISMATCH');assert.deepEqual(await readdir(f.parent),[]);
});

test('C93: invalid market identities, missing references, pending revisions and missing source roots cannot claim complete coverage',async t=>{
  const f=await fixture(t);await writeSkillInventoryBackup(f.path,password,()=>f.source);
  for(const [label,change]of [['key',v=>{v.market.versions[0].key='0'.repeat(64);}],['duplicate',v=>{v.market.versions.push(v.market.versions[0]);}],['reference',v=>{v.market.selections[0].active='0'.repeat(64);}],['revision',v=>{v.market.selections[0].pending_mode='automatic';v.market.selections[0].pending_revision='';}],['omitted',v=>{v.roots.pop();}],['promoted',v=>{v.coverage.activatesSources=true;}]]){const path=await forged(f,change,label);await assert.rejects(restoreSkillInventoryBackup(path,password,f.parent));assert.deepEqual(await readdir(f.parent),[]);}
});

test('C93: authentication and whole-archive integrity are verified before inventory restoration creates paths',async t=>{
  const f=await fixture(t);await writeSkillInventoryBackup(f.path,password,()=>f.source);await assert.rejects(restoreSkillInventoryBackup(f.path,'EXAMPLE incorrect password',f.parent),error=>error.code==='BACKUP_AUTHENTICATION_FAILED');const bytes=await readFile(f.path),tampered=join(f.root,'EXAMPLE_tampered');bytes[bytes.length-1]^=1;await writeFile(tampered,bytes);await assert.rejects(restoreSkillInventoryBackup(tampered,password,f.parent),error=>error.code==='BACKUP_AUTHENTICATION_FAILED');assert.deepEqual(await readdir(f.parent),[]);
});

test('C93: more than 128 declared roots are preserved without truncating provider inventory',async t=>{
  const f=await fixture(t);f.source.filesystem=Array.from({length:2},(_,provider)=>({id:'EXAMPLE-provider-'+provider,mode:'host-local',config:{includeDefaultRoots:false,dshHome:f.home,agentsHome:f.agents,customSkillDirs:Array.from({length:65},(_,i)=>join(f.root,'EXAMPLE-missing-'+provider+'-'+i)),watch:false}}));f.source.workspaces=[];await writeSkillInventoryBackup(f.path,password,()=>f.source);const result=await restoreSkillInventoryBackup(f.path,password,f.parent);assert.equal(result.inventory.roots.filter(row=>row.provenance.provider.startsWith('EXAMPLE-provider-')).length,130);assert.equal(result.roots.length,134);
});

test('C93: effective configuration tolerates absent optional fields but never invokes accessors or serializes ambient values',async t=>{
  const f=await fixture(t),result=resolveSkillFilesystem({dshHome:f.home,agentsHome:f.agents,bundledSkillDir:f.bundled,watch:undefined});assert.equal(result.dshHome,f.home);assert.equal(Object.hasOwn(result,'watch'),false);let calls=0;const bad=Object.defineProperty({},'dshHome',{enumerable:true,get(){calls++;return f.home;}});assert.throws(()=>resolveSkillFilesystem(bad));assert.equal(calls,0);assert.deepEqual(Object.keys(result).sort(),['agentsHome','bundledSkillDir','customSkillDirs','dshHome','includeDefaultRoots','providerName']);
});

test('C93: disabled default roots stay excluded and virtual filesystem providers are explicitly refused',async t=>{
  const f=await fixture(t);f.source.filesystem[0].config.includeDefaultRoots=false;const {document}=await collectSkillBackupInventory(f.source);assert.deepEqual(document.roots.filter(row=>row.provenance.provider==='EXAMPLE-filesystem').map(row=>row.provenance.role),['custom','bundled']);f.source.filesystem[0].mode='EXAMPLE-virtual';await assert.rejects(writeSkillInventoryBackup(f.path,password,()=>f.source),error=>error.code==='BACKUP_SKILL_FILESYSTEM_UNSUPPORTED');
});

test('C93: a real in-flight GitHub download refuses a backup snapshot and cancellation releases it',async t=>{
  const f=await fixture(t);let started;const ready=new Promise(resolve=>{started=resolve;});f.git.intercept(async(_url,options)=>{started();await new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));});const download=f.github.download(f.git.spec);await ready;assert.throws(()=>f.github.backupState());f.github.cancelDownload();await assert.rejects(download);assert.equal(f.github.backupState().releases.length,2);
});

test('C93: a real in-flight feed read refuses a snapshot without staging a pending update',async t=>{
  const f=await fixture(t),abort=new AbortController();let started;const ready=new Promise(resolve=>{started=resolve;});const feed=new SkillFeed(join(f.root,'EXAMPLE_busy_feed.json'),f.market,async(_url,options)=>{started();return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));});const pending=feed.check(abort.signal);await ready;assert.throws(()=>feed.backupState());abort.abort(new Error('EXAMPLE_CANCEL'));await pending;assert.deepEqual(feed.backupState().catalog,[]);
});

test('C93: foreign-platform origin paths are provenance and never become live restore destinations',async t=>{
  const f=await fixture(t);await writeSkillInventoryBackup(f.path,password,()=>f.source);const path=await forged(f,(document,items)=>{
    const provider=document.filesystem[0],root=document.roots.find(row=>row.provenance.role==='custom'&&row.provenance.provider===provider.id);provider.config={providerName:'EXAMPLE',includeDefaultRoots:false,dshHome:'/EXAMPLE/dsh',agentsHome:'/EXAMPLE/agents',customSkillDirs:['/EXAMPLE/skills']};root.path='/EXAMPLE/skills';document.projects=[];document.local.sources=[];document.schema='dsh-zhen-skill-inventory-v1';items[0].metadata.schema=document.schema;document.github={schemaVersion:1,sources:[],running:[],releases:[]};document.roots=[root];const manifest=JSON.parse(items[1].bytes);manifest.roots=[{...root,present:true,canonicalRoot:'/EXAMPLE/skills',excludedMetadata:['.git']}];manifest.nodes=[];items[1].bytes=Buffer.from(JSON.stringify(manifest));items.splice(2);
  },'foreign_origin');const result=await restoreSkillInventoryBackup(path,password,f.parent);assert.equal(result.roots[0].origin.path,'/EXAMPLE/skills');assert.equal(dirname(result.root),f.parent);assert.ok(result.roots[0].restoredPath.startsWith(result.root));
});

test('C93: cancellation after resource restoration cleans the complete candidate before inventory persistence',async t=>{
  const f=await fixture(t);await writeSkillInventoryBackup(f.path,password,()=>f.source);const abort=new AbortController(),original=abort.signal.throwIfAborted.bind(abort.signal);let cancelled=false;abort.signal.throwIfAborted=()=>{if(readdirSync(f.parent).some(name=>existsSync(join(f.parent,name,'dsh-zhen-skill-restore.json')))){cancelled=true;abort.abort(new Error('EXAMPLE_CANCEL_AT_COMPOSITION'));}original();};await assert.rejects(restoreSkillInventoryBackup(f.path,password,f.parent,{signal:abort.signal}),/EXAMPLE_CANCEL_AT_COMPOSITION/);assert.equal(cancelled,true);assert.deepEqual(await readdir(f.parent),[]);
});

test('C93: failed source readers produce fixed diagnostics without raw private reasons or partial publication',async t=>{
  const f=await fixture(t),source={...f.source,market:{backupState(){throw new Error('EXAMPLE_PRIVATE_REASON');}}};await assert.rejects(writeSkillInventoryBackup(f.path,password,()=>source),error=>error.code==='BACKUP_SKILL_INVENTORY_READ_FAILED'&&!error.message.includes('EXAMPLE_PRIVATE_REASON'));assert.equal(existsSync(f.path),false);
});

test('C93: retained GitHub manifest budget is checked cumulatively before reading further resource payloads',async t=>{
  const f=await fixture(t),source=join(f.root,'github','releases',f.first.sourceId,f.first.digest);
  for(let i=0;i<65;i++){
    const spec={...f.first.spec,reference:'EXAMPLE_budget_'+Math.floor(i/17)},sourceId=sha(JSON.stringify(spec)),{digest:_digest,...body}={...f.first,spec,sourceId,revision:String(i+1).padStart(40,'0')},release={...body,digest:sha(JSON.stringify(body))},target=join(f.root,'github','releases',sourceId,release.digest);
    for(const file of f.first.files){const path=join(target,file.location,file.path);await mkdir(dirname(path),{recursive:true});await copyFile(join(source,file.location,file.path),path);}
    const json=Buffer.from(JSON.stringify(release));await writeFile(join(target,'manifest.json'),Buffer.concat([json,Buffer.alloc(1024**2-json.length,32)]));
  }
  assert.throws(()=>f.github.backupState(),/技能备份清单过大/);await assert.rejects(writeSkillInventoryBackup(f.path,password,()=>f.source),error=>error.code==='BACKUP_SKILL_INVENTORY_READ_FAILED');assert.equal(existsSync(f.path),false);
});
