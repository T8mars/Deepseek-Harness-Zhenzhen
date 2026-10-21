import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,readdirSync,existsSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {readReleaseArchive} from './release-archive.mjs';
import {releaseSnapshot,releaseDocuments} from './release-snapshot.mjs';

export const RELEASE_INPUT_DIRECTORY='.runtime/release-input';
const json=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
function ordinary(root,path,limit){
  const file=join(root,path),stat=lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit||realpathSync.native(file)!==file)throw Error('Release input must contain ordinary bounded files.');
  return readFileSync(file);
}
export function validateReleaseInput(meta,bytes,{sourceCommit,timestamp,upstream,manifest}){
  if(!meta||Object.keys(meta).sort().join(',')!=='archiveFile,archiveSha256,channel,schemaVersion,snapshotCommit,sourceCommit,sourceDirty,tag,timestamp,upstream'||meta.schemaVersion!==1||typeof meta.sourceDirty!=='boolean'||!isDeepStrictEqual(meta.upstream,upstream)||meta.sourceCommit!==sourceCommit||meta.timestamp!==timestamp)throw Error('Release input provenance differs from its trusted source checkout.');
  const archive=readReleaseArchive(bytes),snapshot=releaseSnapshot(archive,{sourceCommit,timestamp});
  if(!isDeepStrictEqual(archive.manifest,manifest)||meta.archiveFile!==`dsh-zhen-${manifest.version}-${archive.sha256.slice(0,16)}.tgz`||meta.archiveSha256!==archive.sha256||meta.snapshotCommit!==snapshot.commit)throw Error('Release input archive differs from its trusted identity.');
  if(meta.channel!=='development'&&meta.sourceDirty)throw Error('Publication requires a clean source checkout.');
  const documents=releaseDocuments(archive,snapshot,{channel:meta.channel,tag:meta.tag,upstream,publishTimestamp:timestamp});
  return {meta,archive,snapshot,documents,bytes};
}
export function readReleaseInput(workspace=process.cwd()){
  const base=realpathSync.native(workspace),root=join(base,RELEASE_INPUT_DIRECTORY);
  if(!lstatSync(root).isDirectory()||lstatSync(root).isSymbolicLink()||realpathSync.native(root)!==root)throw Error('Release input directory is not owned.');
  let meta;try{meta=JSON.parse(ordinary(root,'candidate.json',16384));}catch{throw Error('Release input metadata is invalid.');}
  if(!/^dsh-zhen-[0-9A-Za-z.-]+-[a-f0-9]{16}\.tgz$/.test(meta?.archiveFile??'')||!isDeepStrictEqual(readdirSync(root).sort(),[meta.archiveFile,'candidate.json'].sort()))throw Error('Unexpected release input files.');
  const git=args=>execFileSync('git',['--no-replace-objects','-C',base,...args],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
  const load=path=>JSON.parse(ordinary(base,path,1024*1024));
  const lock=load('UPSTREAM.lock.json');
  return validateReleaseInput(meta,ordinary(root,meta.archiveFile,8*1024*1024),{sourceCommit:git(['rev-parse','HEAD']),timestamp:Number(git(['show','-s','--format=%ct','HEAD'])),upstream:{version:lock.dsh.version,commit:lock.dsh.commit},manifest:load('packages/dsh-zhen/package.json')});
}
export function releaseOutput(name,value){
  if(!/^[a-z_]+$/.test(name)||!/^[0-9a-zA-Z./-]+$/.test(String(value)))throw Error('Release output refused.');
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,name+'='+value+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [command,...args]=process.argv.slice(2);
  if(command==='export'){
    if(args.length%2||args.some((x,n)=>n%2===0&&!['--channel','--tag'].includes(x)))throw Error('Usage: release-input.mjs export [--channel channel] [--tag tag]');
    const flags=Object.fromEntries(Array.from({length:args.length/2},(_,n)=>[args[2*n],args[2*n+1]]));
    const {prepareRelease}=await import('./prepare-release.mjs'),p=prepareRelease({channel:flags['--channel']??'development',tag:flags['--tag']||undefined});
    const m=p.staged.manifest,upstream={version:p.documents.compat.declaredRuntimeVersions[0],commit:p.documents.compat.upstreamCommit};
    const meta={schemaVersion:1,channel:m.channel,tag:m.tag,sourceCommit:m.sourceCommit,sourceDirty:m.sourceDirty,timestamp:m.snapshot.timestamp,archiveFile:m.archive.file,archiveSha256:m.archive.sha256,snapshotCommit:m.snapshot.commit,upstream};
    validateReleaseInput(meta,p.archive?readFileSync(join(p.staged.root,'assets',m.archive.file)):null,{sourceCommit:m.sourceCommit,timestamp:meta.timestamp,upstream,manifest:p.archive.manifest});
    const root=join(realpathSync.native(process.cwd()),RELEASE_INPUT_DIRECTORY);if(!existsSync(root))mkdirSync(root);
    if(!lstatSync(root).isDirectory()||lstatSync(root).isSymbolicLink()||realpathSync.native(root)!==root)throw Error('Release input directory is not owned.');
    const expected=new Map([['candidate.json',json(meta)],[m.archive.file,readFileSync(join(p.staged.root,'assets',m.archive.file))]]);
    if(readdirSync(root).some(path=>!expected.has(path)))throw Error('Existing release input contains unexpected files.');
    for(const [path,bytes] of expected){if(existsSync(join(root,path))){if(!ordinary(root,path,8*1024*1024).equals(bytes))throw Error('Refusing to overwrite different release input.');}else writeFileSync(join(root,path),bytes,{flag:'wx'});}
    releaseOutput('stage',m.tag+'-'+m.archive.sha256.slice(0,16)+'-'+m.sourceCommit.slice(0,8));console.log(JSON.stringify({state:'preview',tag:m.tag,channel:m.channel,sourceDirty:m.sourceDirty,published:false}));
  }else if(command==='hydrate'&&!args.length){
    const p=readReleaseInput(),artifact=JSON.parse(readFileSync('.runtime/package-artifact.json','utf8'));
    if(artifact.sha256!==p.archive.sha256||artifact.file!==p.meta.archiveFile)throw Error('Independent verification build does not match the publication archive.');
    const {writeReleaseStage,INDEX_URL}=await import('./prepare-release.mjs'),{parseMarketIndex}=await import('@deepseek-ai/dsh-plugin-market-index');
    p.documents.index=parseMarketIndex(p.documents.index,INDEX_URL);
    const stage=writeReleaseStage(process.cwd(),p.bytes,p.archive,p.snapshot,p.documents,{...p.meta});
    releaseOutput('stage',stage.root.split(/[\\/]/).at(-1));console.log(JSON.stringify({state:'preview',snapshotCommit:p.snapshot.commit,independentBuildMatched:true}));
  }else throw Error('Usage: release-input.mjs export|hydrate');
}
