import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,realpathSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {readReleaseArchive} from './release-archive.mjs';
import {observerBinding,validateObserverBinding} from './promotion-policy.mjs';

const requireFact=(ok,message)=>{if(!ok)throw Error(message);};
const keys=x=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().join(','):'';
export function ownedSmokeDirectory(workspace,parts,{create=false}={}){
 let at=realpathSync.native(workspace);
 for(const name of parts){requireFact(/^@?[a-zA-Z0-9_.-]+$/.test(name)&&name!=='.'&&name!=='..','Candidate input directory refused.');at=join(at,name);if(create&&!existsSync(at))mkdirSync(at);const stat=lstatSync(at);requireFact(stat.isDirectory()&&!stat.isSymbolicLink()&&realpathSync.native(at)===at,'Candidate input directory is not owned.');}return at;
}
export function ordinarySmokeFile(root,name,limit){
 requireFact(/^[a-zA-Z0-9_.-]+$/.test(name)&&name!=='.'&&name!=='..','Candidate file name refused.');const path=join(root,name),stat=lstatSync(path);requireFact(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=limit&&realpathSync.native(path)===path,'Candidate input must contain bounded ordinary files.');return readFileSync(path);
}
export function writeSmokeFiles(root,files){
 requireFact(readdirSync(root).every(name=>files.has(name)),'Unexpected candidate observation files.');
 // Preflight all existing bytes before adding anything; never replace a partial or prior attempt.
 for(const[name,bytes]of files)if(existsSync(join(root,name)))requireFact(ordinarySmokeFile(root,name,8*1024*1024).equals(bytes),'Refusing to replace candidate observation input.');
 for(const[name,bytes]of files)if(!existsSync(join(root,name)))writeFileSync(join(root,name),bytes,{flag:'wx'});
}
export function currentObserver(workspace=process.cwd()){
 const root=realpathSync.native(workspace),runtime=ownedSmokeDirectory(root,['.runtime']),packages=ownedSmokeDirectory(root,['.runtime','packages']);
 let metadata;try{metadata=JSON.parse(ordinarySmokeFile(runtime,'package-artifact.json',16384));}catch{throw Error('Observer bundle metadata is unavailable.');}
 requireFact(keys(metadata)==='file,sha256'&&/^dsh-zhen-[0-9A-Za-z.-]+-[a-f0-9]{16}\.tgz$/.test(metadata.file??'')&&/^[a-f0-9]{64}$/.test(metadata.sha256??''),'Observer bundle metadata refused.');
 const bytes=ordinarySmokeFile(packages,metadata.file,8*1024*1024),archive=readReleaseArchive(bytes);
 requireFact(archive.sha256===metadata.sha256&&metadata.file===`dsh-zhen-${archive.manifest.version}-${archive.sha256.slice(0,16)}.tgz`,'Observer bundle digest or file identity differs.');
 const manifestRoot=ownedSmokeDirectory(root,['packages','dsh-zhen']),adapterRoot=ownedSmokeDirectory(root,['node_modules','@deepseek-ai','dsh-llm-pi-ai']);
 let manifest,lock,adapter;try{manifest=JSON.parse(ordinarySmokeFile(manifestRoot,'package.json',65536));lock=JSON.parse(ordinarySmokeFile(root,'UPSTREAM.lock.json',1024*1024));adapter=JSON.parse(ordinarySmokeFile(adapterRoot,'package.json',65536));}catch{throw Error('Observer source or installed SDK metadata is unavailable.');}
 requireFact(isDeepStrictEqual(manifest,archive.manifest)&&adapter.name==='@deepseek-ai/dsh-llm-pi-ai','Observer source manifest or actual SDK identity differs.');
 return{archive,bytes,upstream:{version:lock.dsh?.version,commit:lock.dsh?.commit},adapterVersion:adapter.version};
}
export function bindSmokeCandidate(workspace,candidate,observerCommit){
 requireFact(/^[a-f0-9]{40}$/.test(observerCommit??''),'Observer source identity refused.');const observer=currentObserver(workspace),binding=observerBinding(candidate,observer.archive,observer.upstream,observer.adapterVersion);
 const root=ownedSmokeDirectory(workspace,['.runtime']);const file=join(root,'smoke-candidate.json'),bytes=Buffer.from(JSON.stringify({schemaVersion:1,observerCommit,binding},null,2)+'\n');
 if(existsSync(file))requireFact(ordinarySmokeFile(root,'smoke-candidate.json',16384).equals(bytes),'Refusing to replace a different candidate binding.');else writeFileSync(file,bytes,{flag:'wx'});
 return{...observer,binding};
}
export function readSmokeCandidate({workspace=process.cwd(),mode,runId,commit,tag}){
 requireFact(mode==='ci'&&/^[1-9]\d{0,19}-1$/.test(runId??'')&&/^[a-f0-9]{40}$/.test(commit??'')&&/^v\d+\.\d+\.\d+-canary\.[1-9]\d*$/.test(tag??''),'Candidate observations require the first authorized CI attempt.');
 const root=ownedSmokeDirectory(workspace,['.runtime']);let input;try{input=JSON.parse(ordinarySmokeFile(root,'smoke-candidate.json',16384));}catch{throw Error('Fixed candidate binding is unavailable.');}
 requireFact(keys(input)==='binding,observerCommit,schemaVersion'&&input.schemaVersion===1&&input.observerCommit===commit&&input.binding?.identity?.tag===tag,'Candidate binding differs from this observation source or selection.');
 const observer=currentObserver(workspace);validateObserverBinding(input.binding,input.binding.identity,observer.archive);
 requireFact(isDeepStrictEqual(observer.upstream,input.binding.observerUpstream)&&observer.adapterVersion===input.binding.observerAdapterVersion,'Actual observation SDK or upstream pin changed.');return{...observer,binding:input.binding};
}
