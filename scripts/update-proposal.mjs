import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { requiredPackages, canonicalVersion, newerVersion, readCompatibility, upgradedManifests, guideChanges, profileChanges, sha256 } from './upstream-policy.mjs';
export const PROPOSAL_FILES = [
  'UPSTREAM.candidate.json','UPSTREAM.prepared.json','UPSTREAM.lock.json','package.json','package-lock.json',
  'packages/dsh-zhen/package.json','packages/dsh-zhen/src/compatibility.ts','contracts/upstream-baseline.json',
  'packages/dsh-zhen/catalog/runtime.json','packages/dsh-zhen/THIRD_PARTY_NOTICES.md',
];
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
export function validateCandidateRecord(data) {
  const urls={dsh:'https://github.com/deepseek-ai/deepseek-harness/tags',canvas:'https://github.com/T8mars/T8-penguin-canvas/commits/main',zhen:'https://github.com/T8mars/Deepseek-Harness-Zhenzhen/releases',gateway:'https://api.seedance.nz/docs/llms.txt'};
  assert(data.schemaVersion===1&&data.activation==='requires-contracts-and-review'&&Array.isArray(data.candidates)&&data.candidates.length<=4,'Candidate record refused.');
  assert(new Set(data.candidates.map(item=>item.id)).size===data.candidates.length,'Duplicate candidate source.');
  for(const item of data.candidates) {
    assert(urls[item.id]===item.url&&typeof item.current==='string'&&item.current.length<=150,'Candidate source refused.');
    assert(item.id==='gateway'?/^[a-f0-9]{64}$/.test(item.available)&&item.revision===item.available:canonicalVersion(item.available),'Candidate version refused.');
    assert(item.id==='dsh'?/^sha512-[A-Za-z0-9+/]{86}==$/.test(item.revision):item.id==='canvas'?/^[a-f0-9]{40}$/.test(item.revision):item.id==='zhen'?canonicalVersion(item.revision.replace(/^v/,'')):true,'Candidate revision refused.');
  }
}
export function validateProposal(proposal,readBase) {
  assert(proposal.schemaVersion===1&&/^[a-f0-9]{40}$/.test(proposal.baseCommit)&&Array.isArray(proposal.files)&&proposal.files.length<=PROPOSAL_FILES.length,'Proposal envelope refused.');
  const outcomes=['success','failure','skipped','cancelled'];
  assert(proposal.validation&&Object.keys(proposal.validation).sort().join(',')==='contracts,dependencies,installation,prepare,review'&&Object.values(proposal.validation).every(value=>outcomes.includes(value)),'Validation outcomes refused.');
  const files=new Map();let size=0;
  for(const file of proposal.files){assert(PROPOSAL_FILES.includes(file.path)&&typeof file.content==='string'&&typeof file.before==='string'&&/^[a-f0-9]{64}$|^$/.test(file.before)&&!files.has(file.path),'Proposal path refused.');size+=Buffer.byteLength(file.content);assert(size<=8*1024*1024&&Buffer.byteLength(file.content)<=4*1024*1024,'Proposal size refused.');const old=readBase(file.path);assert((old===null?'':sha256(old))===file.before,'Proposal base changed.');files.set(file.path,file.content);}
  const text=path=>files.has(path)?files.get(path):readBase(path),json=path=>JSON.parse(text(path));
  if(!proposal.files.length)return {files,record:null,prepared:null};
  const record=json('UPSTREAM.candidate.json');validateCandidateRecord(record);
  const hasPins=proposal.files.some(file=>file.path!=='UPSTREAM.candidate.json');
  if(!hasPins)return {files,record,prepared:null};
  const prepared=json('UPSTREAM.prepared.json');
  const oldRoot=JSON.parse(readBase('package.json')),oldPlugin=JSON.parse(readBase('packages/dsh-zhen/package.json')),oldLock=JSON.parse(readBase('UPSTREAM.lock.json'));
  assert(prepared.schemaVersion===1&&prepared.state==='prepared'&&isDeepStrictEqual(prepared.from,oldLock.dsh),'Prepared source baseline refused.');
  assert(newerVersion(prepared.target.version,oldLock.dsh.version),'Prepared version refused.');
  assert(isDeepStrictEqual(prepared.previousBaseline,JSON.parse(readBase('contracts/upstream-baseline.json'))),'Prepared previous observations refused.');
  const expected=upgradedManifests(oldRoot,oldPlugin,oldLock,readCompatibility(readBase('packages/dsh-zhen/src/compatibility.ts')),prepared.target);
  assert(isDeepStrictEqual(json('package.json'),expected.root)&&isDeepStrictEqual(json('packages/dsh-zhen/package.json'),expected.plugin)&&isDeepStrictEqual(json('UPSTREAM.lock.json'),expected.lock)&&text('packages/dsh-zhen/src/compatibility.ts')===expected.compatibility,'Only exact dependency/engine/compatibility pin changes may be published.');
  const packages=requiredPackages(oldRoot,oldPlugin);assert(Array.isArray(prepared.packages)&&prepared.packages.length===packages.length&&isDeepStrictEqual(prepared.packages.map(item=>item.name).sort(),packages),'Published package set refused.');
  const candidate=record.candidates.find(item=>item.id==='dsh');assert(candidate?.available===prepared.target.version&&candidate.revision===prepared.target.integrity,'Prepared release differs from discovered metadata.');
  const resolved=json('package-lock.json');assert(resolved.lockfileVersion===3,'Candidate lock format refused.');
  assert(isDeepStrictEqual(resolved.packages?.['']?.dependencies,expected.root.dependencies)&&isDeepStrictEqual(resolved.packages?.['']?.devDependencies,expected.root.devDependencies),'Candidate root lock differs.');
  assert(isDeepStrictEqual(resolved.packages?.['packages/dsh-zhen']?.peerDependencies,expected.plugin.peerDependencies),'Candidate plugin lock differs.');
  for(const item of prepared.packages){const entry=resolved.packages[`node_modules/${item.name}`];assert(item.version===prepared.target.version&&/^sha512-[A-Za-z0-9+/]{86}==$/.test(item.integrity)&&entry?.version===item.version&&entry.integrity===item.integrity&&entry.resolved===`https://registry.npmjs.org/${item.name}/-/${item.name.split('/')[1]}-${item.version}.tgz`,'Candidate published integrity differs.');}
  for(const [path,entry] of Object.entries(resolved.packages)){
    if(entry.link){assert(path===`node_modules/${oldPlugin.name}`&&entry.resolved==='packages/dsh-zhen','Unexpected workspace link refused.');continue;}
    if(entry.resolved)assert(typeof entry.resolved==='string'&&new URL(entry.resolved).origin==='https://registry.npmjs.org'&&!new URL(entry.resolved).username&&!new URL(entry.resolved).password&&!new URL(entry.resolved).search&&!new URL(entry.resolved).hash&&/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity??''),'Non-registry or unpinned lock resolution refused.');
  }
  const baseline=json('contracts/upstream-baseline.json');assert(baseline.observationsOnly===true&&baseline.dsh.version===prepared.target.version&&baseline.dsh.commit===prepared.target.commit&&isDeepStrictEqual(baseline.guides,prepared.guides),'Candidate observations refused.');
  assert(isDeepStrictEqual(prepared.guideChanges,guideChanges(prepared.previousBaseline.guides,baseline.guides))&&isDeepStrictEqual(prepared.profileChanges??[],profileChanges(prepared.previousBaseline.webRows,baseline.webRows)),'Candidate omitted source differences.');
  const runtime=json('packages/dsh-zhen/catalog/runtime.json'),oldRuntime=JSON.parse(readBase('packages/dsh-zhen/catalog/runtime.json'));assert(isDeepStrictEqual(runtime,{...oldRuntime,dsh:prepared.target.version}),'Generated runtime metadata differs.');
  return {files,record,prepared};
}
export function collectProposal(root,validation) {
  const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const baseCommit=git(['rev-parse','HEAD']).trim();
  const changed=[...new Set([...git(['diff','--name-only','-z']).split('\0'),...git(['ls-files','--others','--exclude-standard','-z']).split('\0')].filter(Boolean))];
  for(const path of changed)assert(PROPOSAL_FILES.includes(path),'Unexpected change in preparation checkout.');
  const base=path=>{try{return git(['show',`${baseCommit}:${path}`]);}catch{return null;}};
  const files=changed.sort().map(path=>{const before=base(path);return {path,before:before===null?'':sha256(before),content:readFileSync(resolve(root,path),'utf8')};});
  let proposal={schemaVersion:1,baseCommit,validation,files};
  try{validateProposal(proposal,base);}catch(error){
    if(Object.values(validation).every(value=>value==='success'||value==='skipped'))throw error;
    // A failed install/probe must not publish partially rewritten manifests.
    proposal={...proposal,files:files.filter(file=>file.path==='UPSTREAM.candidate.json')};validateProposal(proposal,base);
  }
  return proposal;
}
