import {createHash} from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import {validateCanaryRecord,RELEASE_REPO,releaseJson} from './publish-release-core.mjs';
import {verifyArtifactDigest,readArtifactZip} from './actions-artifact.mjs';
import {readReleaseArchive} from './release-archive.mjs';import {corePackage,canonicalVersion} from './upstream-policy.mjs';

export const OBSERVATION_POLICY='fixed-canary-seven-utc-days-v1';
const DAY=86400000,sha=b=>createHash('sha256').update(b).digest('hex'),hex=(v,n)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v),positive=v=>Number.isSafeInteger(v)&&v>0;
function requireFact(ok,message){if(!ok)throw Error(message);}
const keys=v=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().join(','):'';
const time=v=>{const n=typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)?Date.parse(v):NaN;requireFact(Number.isFinite(n)&&n>=0,'Server observation timestamp refused.');return n;};

export function candidateIdentity(record){validateCanaryRecord(record);const{runtimeEvidence,...identity}=record;return structuredClone(identity);}
export function validateCandidateIdentity(value){
 requireFact(keys(value)==='archiveSha256,payloadSha256,publishTimestamp,releaseId,snapshotCommit,sourceCommit,tag,upstream,version'&&canonicalVersion(value.version)&&/^\d+\.\d+\.\d+-canary\.[1-9]\d*$/.test(value.version??'')&&value.tag==='v'+value.version&&hex(value.archiveSha256,64)&&hex(value.payloadSha256,64)&&hex(value.sourceCommit,40)&&hex(value.snapshotCommit,40)&&positive(value.releaseId)&&Number.isSafeInteger(value.publishTimestamp)&&value.publishTimestamp>=0&&value.publishTimestamp<100000000000&&keys(value.upstream)==='commit,version'&&hex(value.upstream.commit,40)&&canonicalVersion(value.upstream.version),'Fixed candidate identity refused.');return value;
}
export function requireCandidatePayload(archive,candidate){
 validateCandidateIdentity(candidate);requireFact(archive.payloadSha256===candidate.payloadSha256&&archive.manifest.engines?.dsh===candidate.upstream.version,'Observed bundle or SDK engine differs from the fixed canary.');
 const peers=Object.entries(archive.manifest.peerDependencies??{}).filter(([name])=>corePackage(name));requireFact(peers.length>0&&peers.every(([,version])=>version===candidate.upstream.version),'Observed SDK peer pins differ from the fixed canary.');
 let runtime;try{runtime=JSON.parse(archive.files.get('catalog/runtime.json'));}catch{throw Error('Observed runtime pin catalog refused.');}requireFact(runtime.dsh===candidate.upstream.version,'Observed runtime pin differs from the fixed canary.');
}
export function observerBinding(candidate,archive,upstream,adapterVersion){
 requireCandidatePayload(archive,candidate);requireFact(isDeepStrictEqual(upstream,candidate.upstream)&&adapterVersion===upstream.version,'Observation SDK or reviewed upstream commit differs.');return{identity:structuredClone(candidate),observerArchiveSha256:archive.sha256,observerPayloadSha256:archive.payloadSha256,observerUpstream:structuredClone(upstream),observerAdapterVersion:adapterVersion};
}
export function validateObserverBinding(binding,candidate,archive){
 requireFact(keys(binding)==='identity,observerAdapterVersion,observerArchiveSha256,observerPayloadSha256,observerUpstream'&&isDeepStrictEqual(binding.identity,candidate),'Observation identifies another candidate.');const expected=observerBinding(candidate,archive,binding.observerUpstream,binding.observerAdapterVersion);requireFact(isDeepStrictEqual(binding,expected),'Observation bundle or SDK binding differs.');
}
export function observationRunTitle(tag){requireFact(/^v\d+\.\d+\.\d+-canary\.[1-9]\d*$/.test(tag??''),'Observation candidate tag refused.');return'Flash observation · '+tag;}
export function observationWindow(candidate,asOf){
 validateCandidateIdentity(candidate);const end=Math.floor(time(asOf)/DAY)*DAY,start=end-7*DAY;requireFact(start>=0&&candidate.publishTimestamp*1000<=start,'Canary needs seven complete UTC observation days.');requireFact(time(asOf)-candidate.publishTimestamp*1000<=30*DAY,'Candidate observation retention window exceeded; prepare a fresh candidate.');return{start,end,asOf:time(asOf)};
}
function requireRun(run,jobs,candidate,asOf){
 requireFact(run&&positive(run.id)&&run.run_attempt===1&&run.head_branch==='main'&&run.repository?.full_name===RELEASE_REPO&&run.head_repository?.full_name===RELEASE_REPO&&run.path==='.github/workflows/real-gateway-smoke.yml'&&['workflow_dispatch','schedule'].includes(run.event)&&run.display_title===observationRunTitle(candidate.tag)&&hex(run.head_sha,40)&&run.status==='completed'&&run.conclusion==='success','Candidate observation run is missing, retried, foreign or unsuccessful.');
 requireFact(time(run.created_at)<=time(run.updated_at)&&time(run.updated_at)<=time(asOf),'Candidate observation run was not complete at the promotion snapshot.');
 requireFact(Array.isArray(jobs?.jobs)&&jobs.total_count===jobs.jobs.length&&jobs.jobs.length<=100,'Complete observation job list required.');const matches=jobs.jobs.filter(j=>j.name==='smoke');requireFact(matches.length===1,'Unique observation job required.');const job=matches[0];requireFact(positive(job.id)&&job.run_id===run.id&&job.run_attempt===1&&job.status==='completed'&&job.conclusion==='success'&&time(job.started_at)>=time(run.created_at)&&time(job.started_at)<=time(job.completed_at)&&time(job.completed_at)<=time(run.updated_at),'Candidate observation job is not a completed successful attempt.');
 requireFact(Array.isArray(job.steps)&&job.steps.length<=100,'Observation steps required.');let paid;
 for(const name of['Bind fixed published canary','One fixed real Flash request','Export candidate observation']){const steps=job.steps.filter(s=>s.name===name);requireFact(steps.length===1&&steps[0].status==='completed'&&steps[0].conclusion==='success','Candidate preparation, paid check or receipt export did not succeed.');requireFact(time(steps[0].started_at)>=time(job.started_at)&&time(steps[0].started_at)<=time(steps[0].completed_at)&&time(steps[0].completed_at)<=time(job.completed_at),'Observation step timestamp differs.');if(name==='One fixed real Flash request')paid=steps[0];}
 return{job,paid};
}
const REPORT_KEYS=['schemaVersion','at','finishedAt','policy','mode','repository','commit','runId','sourceDirty','sourceSha256','provider','model','maxTokens','outcome','code','requests','blockedRequests','httpStatus','finishKind','inputTokens','outputTokens','visibleTextMatched','temporaryCleaned','userSessionsAccessed','nativeWrites','candidate'].sort().join(',');
export function verifyCandidateObservation({run,jobs,artifact,bytes},candidate,asOf,readSource){
 validateCandidateIdentity(candidate);const{job,paid}=requireRun(run,jobs,candidate,asOf);
 requireFact(artifact&&positive(artifact.id)&&artifact.name==='candidate-observation-'+run.id+'-1'&&artifact.expired===false&&artifact.workflow_run?.id===run.id&&artifact.workflow_run.head_branch==='main'&&artifact.workflow_run.head_sha===run.head_sha&&time(artifact.created_at)>=time(run.created_at)&&time(artifact.created_at)<=time(run.updated_at),'Observation artifact identity refused.');verifyArtifactDigest(bytes,artifact);
 const files=readArtifactZip(bytes,['report.json','bundle.tgz']);requireFact(files.get('report.json').length<=16384,'Observation receipt exceeded its bound.');let report;try{report=JSON.parse(files.get('report.json'));}catch{throw Error('Observation receipt is not valid JSON.');}const archive=readReleaseArchive(files.get('bundle.tgz'));validateObserverBinding(report?.candidate,candidate,archive);
 requireFact(keys(report)===REPORT_KEYS&&report.schemaVersion===1&&report.policy==='default-flash-single-512-v1'&&report.mode==='ci'&&report.repository===RELEASE_REPO&&report.commit===run.head_sha&&report.runId===run.id+'-1'&&report.sourceDirty===false&&report.provider==='seedance'&&report.model==='deepseek/deepseek-v4.1-flash'&&report.maxTokens===512&&report.outcome==='passed'&&report.code===''&&report.requests===1&&report.blockedRequests===0&&report.httpStatus===200&&report.finishKind==='stop'&&report.visibleTextMatched===true&&report.temporaryCleaned===true&&report.userSessionsAccessed===false&&report.nativeWrites===0,'Observation is not a successful fixed real Flash receipt.');
 requireFact([report.inputTokens,report.outputTokens].every(v=>v===null||Number.isSafeInteger(v)&&v>=0),'Observation usage summary refused.');requireFact(time(report.at)>=time(run.created_at)&&time(report.finishedAt)>=time(report.at)&&time(report.finishedAt)<=time(run.updated_at)+5000,'Receipt time differs from server run time.');
 const scripts=['check-smoke-ci.mjs','gateway-smoke-core.mjs','real-gateway-smoke.mjs'];requireFact(keys(report.sourceSha256)===scripts.join(','),'Observation script identity is incomplete.');
 for(const name of scripts){requireFact(hex(report.sourceSha256[name],64)&&typeof readSource==='function'&&sha(readSource(run.head_sha,'scripts/'+name))===report.sourceSha256[name],'Observation scripts differ from their actual source commit.');}
 return{runId:run.id,attempt:1,jobId:job.id,sourceCommit:run.head_sha,artifactId:artifact.id,artifactSha256:artifact.digest.slice(7),observerArchiveSha256:archive.sha256,startedAt:paid.started_at,completedAt:paid.completed_at};
}
export function promotionObservations(candidate,asOf,observations,readSource){
 const window=observationWindow(candidate,asOf);requireFact(Array.isArray(observations)&&observations.length>=7&&observations.length<=100,'Seven complete days of bounded candidate observations are required.');const ids=new Set(),artifacts=new Set(),days=new Set(),samples=[];
 for(const observation of observations){const sample=verifyCandidateObservation(observation,candidate,asOf,readSource),started=time(sample.startedAt);requireFact(!ids.has(sample.runId)&&!artifacts.has(sample.artifactId)&&started>=window.start&&started<=window.asOf,'Duplicate or out-of-window candidate observation refused.');ids.add(sample.runId);artifacts.add(sample.artifactId);if(started<window.end)days.add(Math.floor(started/DAY));samples.push(sample);}
 requireFact(days.size===7,'A complete UTC day has no successful fixed-candidate observation.');samples.sort((a,b)=>time(a.startedAt)-time(b.startedAt)||a.runId-b.runId);
 const proof={schemaVersion:1,policy:OBSERVATION_POLICY,candidate:structuredClone(candidate),asOf,windowStart:new Date(window.start).toISOString(),windowEnd:new Date(window.end).toISOString(),days:7,samples};return{proof,sha256:sha(releaseJson(proof))};
}
export function requireStablePayload(p,candidate){
 requireFact(p.meta.channel==='stable-candidate'&&!p.meta.sourceDirty&&p.archive.manifest.version===candidate.version.replace(/-canary\.[1-9]\d*$/,'')&&p.meta.tag==='v'+p.archive.manifest.version,'Stable promotion requires the exact final base version and a clean source.');requireCandidatePayload(p.archive,candidate);requireFact(isDeepStrictEqual(p.meta.upstream,candidate.upstream),'Stable upstream pin differs from the observed canary.');
}
