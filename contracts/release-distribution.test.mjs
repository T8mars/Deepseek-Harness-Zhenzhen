import test from 'node:test';import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';import {mkdtempSync,realpathSync,rmSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {join,relative,isAbsolute} from 'node:path';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';
import {parseMarketIndex,marketInstallTarget} from '@deepseek-ai/dsh-plugin-market-index';
import {readReleaseArchive,releasePayloadHash,MAX_RELEASE_EXPANDED} from '../scripts/release-archive.mjs';
import {releaseSnapshot,releaseDocuments} from '../scripts/release-snapshot.mjs';
import {writeReleaseStage,readReleaseStage,INDEX_URL} from '../scripts/prepare-release.mjs';
import {checkPackagePaths} from '../scripts/package-policy.mjs';
const commit='1'.repeat(40),upstream={version:'0.2.1-rc.2',commit:'2'.repeat(40)},timestamp=1700000000;
// Construct a forbidden-header negative fixture; it has no key body or credential.
const EXAMPLE_PRIVATE_HEADER=['-----BEGIN','PRIVATE KEY-----'].join(' ');
const manifest=version=>({name:'dsh-zhen',version,description:'EXAMPLE_ONLY',main:'./lib/index.js',engines:{dsh:upstream.version},dsh:{bundle:{patch:'./cordis.patch.yml'}}});
const required=['LICENSE','NOTICE.md','THIRD_PARTY_NOTICES.md','lib/index.js','lib/client.js','lib/remote.js','lib/typert.js','lib/canvas-server.js','lib/mcp-server.js','lib/pdf-text-worker.js','lib/docx-text-worker.js','cordis.patch.yml','catalog/skills.json'];
function fixtureFiles(version='0.1.0-canary.1'){return [['package.json',JSON.stringify(manifest(version))],...required.map(x=>[x,'EXAMPLE_ONLY '+x])];}
function header(path,bytes,type='0',mode=0o644){const h=Buffer.alloc(512);h.write(path,0,100);h.write(mode.toString(8).padStart(7,'0')+'\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h.write(type,156);h.write('ustar\0',257);h.write('00',263);const sum=h.reduce((a,b)=>a+b,0);h.write(sum.toString(8).padStart(6,'0')+'\0 ',148);return h;}
function tar(entries){return Buffer.concat([...entries.flatMap(entry=>{const [path,value,type='0',mode]=entry,data=Buffer.from(value);return[header(path,data,type,mode),data,Buffer.alloc((512-data.length%512)%512)];}),Buffer.alloc(1024)]);}
function archive(entries=fixtureFiles()){return gzipSync(tar(entries.map(([name,value,type,mode])=>['package/'+name,value,type,mode])));}
function owned(t){const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-release-contract-EXAMPLE-')));t.after(()=>{const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});return root;}
function paxLine(key,value){let n=key.length+value.length+4;while(true){const s=n+' '+key+'='+value+'\n';if(Buffer.byteLength(s)===n)return s;n=Buffer.byteLength(s);}}

test('C72: compiled snapshot produces a genuine upstream format-1 Git install target',()=>{
 const a=readReleaseArchive(archive()),s=releaseSnapshot(a,{sourceCommit:commit,timestamp}),docs=releaseDocuments(a,s,{channel:'canary',tag:'v0.1.0-canary.1',upstream,publishTimestamp:timestamp});
 const index=parseMarketIndex(docs.index,INDEX_URL),target=marketInstallTarget('dsh-zhen',index.plugins[0].versions[0]);
 assert.equal(target.spec,`git+https://github.com/T8mars/Deepseek-Harness-Zhenzhen.git#${s.commit}&path:/package`);assert.deepEqual(docs.compat.declaredRuntimeVersions,[upstream.version]);assert.equal(docs.compat.runtimeEvidence,null);assert.equal(docs.compat.state,'preview');assert.equal(s.paths.has('package/lib/index.js'),true);
 const bad=structuredClone(docs.index);bad.plugins[0].versions[0].source={type:'tarball',url:'https://example.invalid/EXAMPLE.tgz'};assert.throws(()=>parseMarketIndex(bad,INDEX_URL));
});

test('C72: canary and stable-candidate tags must match their real package versions',()=>{
 const a=readReleaseArchive(archive()),s=releaseSnapshot(a,{sourceCommit:commit,timestamp}),o={upstream,publishTimestamp:timestamp};
 assert.throws(()=>releaseDocuments(a,s,{...o,channel:'canary',tag:'v0.1.0-canary.2'}));assert.throws(()=>releaseDocuments(a,s,{...o,channel:'stable-candidate',tag:'v0.1.0'}));
 const stable=readReleaseArchive(archive(fixtureFiles('0.1.0'))),t=releaseSnapshot(stable,{sourceCommit:commit,timestamp});assert.doesNotThrow(()=>releaseDocuments(stable,t,{...o,channel:'stable-candidate',tag:'v0.1.0'}));assert.throws(()=>releaseDocuments(stable,t,{...o,channel:'canary',tag:'v0.1.0'}));
 assert.throws(()=>releaseDocuments(a,t,{...o,channel:'canary',tag:'v0.1.0-canary.1'}));
});

test('C72: payload identity ignores only canonical package version, preserving code and mode changes',()=>{
 const a=readReleaseArchive(archive()),b=readReleaseArchive(archive(fixtureFiles('0.1.0')));assert.equal(a.payloadSha256,b.payloadSha256);assert.notEqual(a.sha256,b.sha256);
 const changed=new Map(b.files);changed.set('lib/index.js',Buffer.from('EXAMPLE_CHANGED'));assert.notEqual(a.payloadSha256,releasePayloadHash(changed,b.modes));
 const modes=new Map(b.modes);modes.set('lib/index.js','100755');assert.notEqual(a.payloadSha256,releasePayloadHash(b.files,modes));
 const deps=new Map(b.files),m=JSON.parse(deps.get('package.json'));m.dependencies={EXAMPLE_ONLY:'1.0.0'};deps.set('package.json',Buffer.from(JSON.stringify(m)));assert.notEqual(a.payloadSha256,releasePayloadHash(deps,b.modes));
});

test('C72: tar checksum, truncation, trailing payload and nonzero padding are rejected',()=>{
 const entries=fixtureFiles().map(([p,b])=>['package/'+p,b]);const original=tar(entries),bad=Buffer.from(original);bad[0]^=1;assert.throws(()=>readReleaseArchive(gzipSync(bad)));assert.throws(()=>readReleaseArchive(gzipSync(original.subarray(0,-512))));
 const tail=Buffer.from(original);tail[tail.length-1]=1;assert.throws(()=>readReleaseArchive(gzipSync(tail)));
 const padding=Buffer.from(original);padding[512+Buffer.byteLength(entries[0][1])]=1;assert.throws(()=>readReleaseArchive(gzipSync(padding)));
});

test('C72: links, traversal, private runtime data and unexpected entries are rejected',()=>{
 for(const entry of [['../EXAMPLE','x'],['.credentials.yaml','x'],['AGENTS.md','x'],['lib/EXAMPLE.js','x'],['lib/types/EXAMPLE.d.ts','x','2'],['lib/types/EXAMPLE.d.ts','x','1'],['lib/types/../EXAMPLE.d.ts','x'],['lib/types\\EXAMPLE.d.ts','x']])assert.throws(()=>readReleaseArchive(archive([...fixtureFiles(),entry])));
 assert.throws(()=>readReleaseArchive(archive([...fixtureFiles(),['LICENSE','EXAMPLE_DUPLICATE']])));
 assert.throws(()=>readReleaseArchive(archive([...fixtureFiles(),['lib/types/EXAMPLE.d.ts','x','0',0o4644]])));
});

test('C72: malformed manifests and secret candidates never become release payloads',()=>{
 const files=fixtureFiles(),first=JSON.parse(files[0][1]);for(const patch of [{name:'EXAMPLE_OTHER'},{scripts:{prepare:'EXAMPLE_PROGRAM'}},{workspaces:['EXAMPLE']}])assert.throws(()=>readReleaseArchive(archive([['package.json',JSON.stringify({...first,...patch})],...files.slice(1)])));
 assert.throws(()=>readReleaseArchive(archive([...files,['lib/types/EXAMPLE.d.ts',EXAMPLE_PRIVATE_HEADER+' EXAMPLE ONLY']])));
 const raw=archive(),head=Buffer.from(raw.subarray(0,10));head[3]|=16;const withComment=Buffer.concat([head,Buffer.from(EXAMPLE_PRIVATE_HEADER+' EXAMPLE ONLY\0'),raw.subarray(10)]);assert.throws(()=>readReleaseArchive(withComment));
});

test('C72: bounded gzip expansion refuses oversized input before staging',()=>{assert.throws(()=>readReleaseArchive(gzipSync(Buffer.alloc(MAX_RELEASE_EXPANDED+512))));});

test('C72: safe PAX paths work while traversal, links and duplicate keys are refused',()=>{
 const tail=fixtureFiles().map(([p,b])=>['package/'+p,b]);const valid=gzipSync(tar([['package/EXAMPLE_PAX',paxLine('path','package/lib/types/EXAMPLE.d.ts'),'x'],['package/EXAMPLE_SHORT','EXAMPLE'],...tail]));assert.equal(readReleaseArchive(valid).files.has('lib/types/EXAMPLE.d.ts'),true);
 for(const body of [paxLine('path','package/../EXAMPLE'),paxLine('linkpath','EXAMPLE'),paxLine('path','package/LICENSE')+paxLine('path','package/LICENSE'),'9 path=EXAMPLE\n'])assert.throws(()=>readReleaseArchive(gzipSync(tar([['package/EXAMPLE_PAX',body,'x'],['package/EXAMPLE_SHORT','EXAMPLE'],...tail]))));
});

test('C72: Git object IDs and full snapshot graph are accepted by actual Git plumbing',t=>{
 const root=owned(t);execFileSync('git',['init','--bare',root],{stdio:'ignore',windowsHide:true});const a=readReleaseArchive(archive()),s=releaseSnapshot(a,{sourceCommit:commit,timestamp});
 for(const [expected,object] of s.objects){const sha=execFileSync('git',['-C',root,'hash-object','-w','--stdin','-t',object.type],{input:object.data,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true}).trim();assert.equal(sha,expected);}
 execFileSync('git',['-C',root,'update-ref','refs/heads/example',s.commit],{stdio:'ignore',windowsHide:true});
 const listing=execFileSync('git',['-C',root,'ls-tree','-r','--name-only',s.commit],{encoding:'utf8',windowsHide:true});assert.ok(listing.includes('package/lib/index.js'));assert.ok(listing.includes('provenance.json'));
 execFileSync('git',['-C',root,'fsck','--full','--no-reflogs'],{stdio:'ignore',windowsHide:true});assert.equal(releaseSnapshot(a,{sourceCommit:commit,timestamp}).commit,s.commit);
});

test('C72: stage reuse verifies every byte and refuses changed or extra files',t=>{
 const root=owned(t),bytes=archive(),a=readReleaseArchive(bytes),s=releaseSnapshot(a,{sourceCommit:commit,timestamp}),docs=releaseDocuments(a,s,{channel:'canary',tag:'v0.1.0-canary.1',upstream,publishTimestamp:timestamp});docs.index=parseMarketIndex(docs.index,INDEX_URL);
 const meta={channel:'canary',tag:'v0.1.0-canary.1',sourceCommit:commit,sourceDirty:false,archiveFile:`dsh-zhen-0.1.0-canary.1-${a.sha256.slice(0,16)}.tgz`};const result=writeReleaseStage(root,bytes,a,s,docs,meta);assert.equal(result.reused,false);assert.equal(writeReleaseStage(root,bytes,a,s,docs,meta).reused,true);
 const stageName=result.root.split(/[\\/]/).at(-1);assert.equal(readReleaseStage({workspace:root,stageName,archiveBytes:bytes,upstream}).snapshot.commit,s.commit);assert.throws(()=>readReleaseStage({workspace:root,stageName:'../EXAMPLE_OTHER',archiveBytes:bytes,upstream}));assert.throws(()=>readReleaseStage({workspace:root,stageName,archiveBytes:archive(fixtureFiles('0.1.0')),upstream}));
 writeFileSync(join(result.root,'snapshot/package/lib/index.js'),'EXAMPLE_CHANGED');assert.throws(()=>writeReleaseStage(root,bytes,a,s,docs,meta));assert.ok(readFileSync(join(result.root,'manifest.json'),'utf8').includes('preview'));
});

test('C72: a partial or unexpected existing stage is never overwritten',t=>{
 const root=owned(t),bytes=archive(),a=readReleaseArchive(bytes),s=releaseSnapshot(a,{sourceCommit:commit,timestamp}),docs=releaseDocuments(a,s,{channel:'canary',tag:'v0.1.0-canary.1',upstream,publishTimestamp:timestamp});
 const meta={channel:'canary',tag:'v0.1.0-canary.1',sourceCommit:commit,sourceDirty:false,archiveFile:`dsh-zhen-0.1.0-canary.1-${a.sha256.slice(0,16)}.tgz`},dir=join(root,'.runtime/distribution-staging',meta.tag+'-'+a.sha256.slice(0,16)+'-'+commit.slice(0,8));mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'EXAMPLE_KEEP'),'EXAMPLE_PRESERVE');assert.throws(()=>writeReleaseStage(root,bytes,a,s,docs,meta));assert.equal(readFileSync(join(dir,'EXAMPLE_KEEP'),'utf8'),'EXAMPLE_PRESERVE');
 assert.throws(()=>writeReleaseStage(root,bytes,a,s,docs,{...meta,archiveFile:'../EXAMPLE_ESCAPE'}));
 const wrong=structuredClone(docs);wrong.compat.runtimeEvidence={EXAMPLE_UNAPPROVED:true};assert.throws(()=>writeReleaseStage(root,bytes,a,s,wrong,meta));
});

test('C72: pack and release share path policy including case and Unicode collisions',()=>{assert.doesNotThrow(()=>checkPackagePaths(required));for(const paths of [['LICENSE','license'],['lib/types/EXAMPLE.d.ts','lib/types/ＥＸＡＭＰＬＥ.d.ts'],['skills/EXAMPLE/../../AGENTS.md'],['.runtime/EXAMPLE']])assert.throws(()=>checkPackagePaths(paths));});
