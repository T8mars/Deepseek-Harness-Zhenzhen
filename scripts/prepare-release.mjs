import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,realpathSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {parseMarketIndex,marketInstallTarget} from '@deepseek-ai/dsh-plugin-market-index';
import {checkRepository} from './check-private.mjs';
import {readReleaseArchive} from './release-archive.mjs';
import {releaseSnapshot,releaseDocuments} from './release-snapshot.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const INDEX_URL='https://t8mars.github.io/Deepseek-Harness-Zhenzhen/market/index.json';
function directory(parent,name){const target=join(parent,name);if(!existsSync(target))mkdirSync(target);if(!lstatSync(target).isDirectory()||lstatSync(target).isSymbolicLink()||realpathSync.native(target)!==target)throw Error('Release staging requires ordinary owned directories.');return target;}
function ordinaryJson(root,path){
  const file=join(root,path),stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024||realpathSync.native(file)!==file)throw Error('Release metadata requires an ordinary bounded file.');
  try{return JSON.parse(readFileSync(file,'utf8'));}catch{throw Error('Release metadata JSON is invalid.');}
}
export function writeReleaseStage(workspace,archiveBytes,archive,snapshot,documents,meta){
  const verified=readReleaseArchive(archiveBytes),sealed=releaseSnapshot(verified,{sourceCommit:meta.sourceCommit,timestamp:snapshot.timestamp});
  if(verified.sha256!==archive.sha256||sealed.commit!==snapshot.commit||sealed.tree!==snapshot.tree||meta.archiveFile!==`dsh-zhen-${verified.manifest.version}-${verified.sha256.slice(0,16)}.tgz`||documents.compat?.sourceCommit!==meta.sourceCommit||documents.compat?.snapshotCommit!==sealed.commit||documents.compat?.tag!==meta.tag||documents.compat?.channel!==meta.channel||documents.compat?.package?.archiveSha256!==verified.sha256)throw Error('Staging metadata does not match its archive and snapshot.');
  const expectedIndex=releaseDocuments(verified,sealed,{channel:meta.channel,tag:meta.tag,upstream:{version:documents.compat.declaredRuntimeVersions?.[0],commit:documents.compat.upstreamCommit},publishTimestamp:documents.index?.plugins?.[0]?.versions?.[0]?.publishTimestamp});
  if(!isDeepStrictEqual(parseMarketIndex(expectedIndex.index,INDEX_URL),parseMarketIndex(documents.index,INDEX_URL))||!isDeepStrictEqual(expectedIndex.compat,documents.compat))throw Error('Staging index or compatibility metadata differs.');
  archive=verified;snapshot=sealed;
  const base=realpathSync.native(workspace),runtime=directory(base,'.runtime'),parent=directory(runtime,'distribution-staging'),name=meta.tag+'-'+archive.sha256.slice(0,16)+'-'+meta.sourceCommit.slice(0,8);
  if(!/^v[0-9a-zA-Z.-]+-[a-f0-9]{16}-[a-f0-9]{8}$/.test(name))throw Error('Staging identity refused.');
  const root=join(parent,name),expected=new Map([['assets/'+meta.archiveFile,archiveBytes],['compat.json',json(documents.compat)],['market/index.json',json(documents.index)],...Array.from(snapshot.paths,([path,bytes])=>['snapshot/'+path,bytes])]);
  const manifest={schemaVersion:1,state:'preview',channel:meta.channel,tag:meta.tag,sourceCommit:meta.sourceCommit,sourceDirty:meta.sourceDirty,packageName:archive.manifest.name,packageVersion:archive.manifest.version,archive:{file:meta.archiveFile,sha256:archive.sha256,bytes:archive.bytes,payloadSha256:archive.payloadSha256},snapshot:{commit:snapshot.commit,tree:snapshot.tree,timestamp:snapshot.timestamp},installTarget:marketInstallTarget('dsh-zhen',documents.index.plugins[0].versions[0]),files:[...expected].map(([path,bytes])=>({path,sha256:hash(bytes),bytes:bytes.length}))};
  expected.set('manifest.json',json(manifest));
  if(existsSync(root)){
    const seen=[];function scan(path,prefix=''){if(lstatSync(path).isSymbolicLink())throw Error('Linked stage refused.');for(const entry of readdirSync(path,{withFileTypes:true})){const key=prefix+entry.name,file=join(path,entry.name);if(entry.isDirectory())scan(file,key+'/');else if(entry.isFile()&&!entry.isSymbolicLink())seen.push(key);else throw Error('Special stage entry refused.');}}scan(root);
    if(seen.length!==expected.size||seen.some(path=>!expected.has(path)||!readFileSync(join(root,path)).equals(expected.get(path))))throw Error('Existing release stage differs; refusing overwrite.');
    return {root,manifest,reused:true};
  }
  directory(parent,name);
  for(const [path,bytes] of expected){const parts=path.split('/');let target=root;for(const part of parts.slice(0,-1))target=directory(target,part);writeFileSync(join(target,parts.at(-1)),bytes,{flag:'wx',mode:archive.modes.get(path.replace(/^snapshot\/package\//,''))==='100755'?0o755:0o644});}
  return {root,manifest,reused:false};
}
export function prepareRelease({workspace=process.cwd(),channel='development',tag}={}){
  const root=realpathSync.native(workspace),load=p=>ordinaryJson(root,p),git=args=>execFileSync('git',['--no-replace-objects','-C',root,...args],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
  checkRepository(root);
  const artifact=load('.runtime/package-artifact.json'),lock=load('UPSTREAM.lock.json'),source=load('packages/dsh-zhen/package.json'),meta=load('meta.json');
  if(!/^dsh-zhen-[0-9A-Za-z.-]+-[a-f0-9]{16}\.tgz$/.test(artifact.file)||!/^[a-f0-9]{64}$/.test(artifact.sha256))throw Error('Package artifact identity refused.');
  const file=join(root,'.runtime/packages',artifact.file);if(!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink()||relative(root,realpathSync.native(file))!==join('.runtime/packages',artifact.file))throw Error('Package archive escaped the workspace.');
  const bytes=readFileSync(file),archive=readReleaseArchive(bytes);if(archive.sha256!==artifact.sha256||!artifact.file.endsWith('-'+archive.sha256.slice(0,16)+'.tgz')||!isDeepStrictEqual(archive.manifest,source))throw Error('Built package does not match the source manifest.');
  const sourceCommit=git(['rev-parse','HEAD']),timestamp=Number(git(['show','-s','--format=%ct','HEAD'])),sourceDirty=!!git(['status','--porcelain','--untracked-files=normal']);
  if(channel!=='development'&&sourceDirty)throw Error('Publication candidates require a clean source checkout.');
  tag??=meta.remoteBackup.latestCheckpointTag;
  const snapshot=releaseSnapshot(archive,{sourceCommit,timestamp}),documents=releaseDocuments(archive,snapshot,{channel,tag,upstream:lock.dsh,publishTimestamp:timestamp});
  documents.index=parseMarketIndex(documents.index,INDEX_URL);
  const staged=writeReleaseStage(root,bytes,archive,snapshot,documents,{channel,tag,sourceCommit,sourceDirty,archiveFile:artifact.file});
  writeFileSync(join(root,'.runtime/release-stage-current.json'),JSON.stringify({root:staged.root,tag,channel,sourceCommit,sourceDirty,archiveSha256:archive.sha256,snapshotCommit:snapshot.commit},null,2)+'\n');
  return {staged,archive,snapshot,documents};
}
export function readReleaseStage({workspace=process.cwd(),stageName,archiveBytes,upstream}){
  const base=realpathSync.native(workspace);
  if(typeof stageName!=='string'||!/^v[0-9a-zA-Z.-]+-[a-f0-9]{16}-[a-f0-9]{8}$/.test(stageName))throw Error('Stage name refused.');
  const root=join(base,'.runtime/distribution-staging',stageName);
  if(!lstatSync(root).isDirectory()||lstatSync(root).isSymbolicLink()||realpathSync.native(root)!==root)throw Error('Stage escaped its owned directory.');
  const m=ordinaryJson(root,'manifest.json');
  const archive=readReleaseArchive(archiveBytes);
  if(m.state!=='preview'||typeof m.sourceDirty!=='boolean'||stageName!==m.tag+'-'+archive.sha256.slice(0,16)+'-'+m.sourceCommit?.slice(0,8))throw Error('Stage does not identify this exact package.');
  const snapshot=releaseSnapshot(archive,{sourceCommit:m.sourceCommit,timestamp:m.snapshot?.timestamp}),documents=releaseDocuments(archive,snapshot,{channel:m.channel,tag:m.tag,upstream,publishTimestamp:m.snapshot?.timestamp});documents.index=parseMarketIndex(documents.index,INDEX_URL);
  const staged=writeReleaseStage(base,archiveBytes,archive,snapshot,documents,{channel:m.channel,tag:m.tag,sourceCommit:m.sourceCommit,sourceDirty:m.sourceDirty,archiveFile:m.archive.file});
  if(staged.root!==root||!staged.reused)throw Error('Existing stage verification failed.');
  return {staged,archive,snapshot,documents};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);if(args.some((x,n)=>n%2===0?!['--channel','--tag'].includes(x):!args[n-1])||args.length%2)throw Error('Usage: prepare-release.mjs [--channel development|canary|stable-candidate] [--tag version-tag]');
  const flags=Object.fromEntries(Array.from({length:args.length/2},(_,n)=>[args[n*2],args[n*2+1]])),result=prepareRelease({channel:flags['--channel']??'development',tag:flags['--tag']});
  console.log(JSON.stringify({state:'preview',root:result.staged.root,packageFiles:result.archive.files.size,snapshotCommit:result.snapshot.commit,archiveSha256:result.archive.sha256,sourceDirty:result.staged.manifest.sourceDirty,reused:result.staged.reused,published:false}));
}
