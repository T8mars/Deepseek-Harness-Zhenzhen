import {isDeepStrictEqual} from 'node:util';
import {RELEASE_REPO} from './publish-release-core.mjs';
import {observationRunTitle,observationWindow,verifyCandidateObservation,promotionObservations} from './promotion-policy.mjs';

const requireFact=(ok,message)=>{if(!ok)throw Error(message);};
const positive=value=>Number.isSafeInteger(value)&&value>0;
const instant=value=>{const time=typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)?Date.parse(value):NaN;requireFact(Number.isFinite(time),'Observation server timestamp refused.');return time;};
/** Use this run's server creation time, never a body field or local clock, as the immutable cutoff. */
export async function promotionServerSnapshot(api,{sourceCommit,runId,attempt}){
 requireFact(/^[a-f0-9]{40}$/.test(sourceCommit??'')&&positive(runId)&&positive(attempt),'Promotion server identity refused.');
 const run=await api.request('/actions/runs/'+runId+'/attempts/'+attempt);
 requireFact(run?.id===runId&&run.run_attempt===attempt&&run.head_sha===sourceCommit&&run.head_branch==='main'&&run.path==='.github/workflows/promote.yml'&&run.event==='workflow_dispatch'&&run.repository?.full_name===RELEASE_REPO&&run.head_repository?.full_name===RELEASE_REPO,'Promotion must run on the exact own main source.');
 instant(run.created_at);return{runId,attempt,sourceCommit,asOf:run.created_at};
}
async function completeRunList(api,asOf){
 const runs=[],ids=new Set();let count;
 for(let page=1;page<=10;page++){
  // No success/event/branch filter: a failed, queued, retried or foreign candidate run must not disappear.
  const result=await api.request('/actions/workflows/real-gateway-smoke.yml/runs?created='+encodeURIComponent('<='+asOf)+'&per_page=100&page='+page);
  requireFact(Number.isSafeInteger(result?.total_count)&&result.total_count>=0&&result.total_count<1000&&Array.isArray(result.workflow_runs)&&result.workflow_runs.length<=100,'Complete bounded workflow history required; review retention when the API search limit is reached.');
  if(count===undefined)count=result.total_count;requireFact(count===result.total_count,'Observation run list changed during collection.');
  requireFact(result.workflow_runs.length===Math.min(100,count-runs.length),'Observation run pagination is incomplete.');
  for(const run of result.workflow_runs){requireFact(positive(run.id)&&!ids.has(run.id)&&typeof run.display_title==='string'&&instant(run.created_at)<=instant(asOf),'Observation history contains duplicate, malformed or future runs.');ids.add(run.id);runs.push(run);}
  if(runs.length===count)return runs;
 }
 throw Error('Observation history exceeds the complete collection bound.');
}
const runSummary=run=>Object.fromEntries(['id','run_attempt','head_sha','head_branch','display_title','status','conclusion','created_at','updated_at'].map(name=>[name,run[name]]));
const artifactSummary=artifact=>Object.fromEntries(['id','name','size_in_bytes','digest','expired','created_at','workflow_run'].map(name=>[name,artifact[name]]));
export async function collectCandidateObservations(api,candidate,{asOf,readSource}){
 const window=observationWindow(candidate,asOf),title=observationRunTitle(candidate.tag),all=await completeRunList(api,asOf);
 const relevant=runs=>runs.filter(run=>run.display_title===title&&(run.status!=='completed'||instant(run.updated_at)>=window.start)).map(runSummary).sort((a,b)=>a.id-b.id);
 const selected=relevant(all);requireFact(selected.length>=7&&selected.length<=100,'Seven days of complete fixed-candidate observations are not available.');
 const observations=[];let bytesRead=0;
 for(const listed of selected){
  requireFact(listed.run_attempt===1&&listed.status==='completed'&&listed.conclusion==='success','A fixed-candidate observation failed, is pending or was retried.');
  const latest=await api.request('/actions/runs/'+listed.id),run=await api.request('/actions/runs/'+listed.id+'/attempts/1');
  requireFact(isDeepStrictEqual(runSummary(latest),listed)&&isDeepStrictEqual(runSummary(run),listed),'Observation run changed or its current attempt differs.');
  const jobs=await api.request('/actions/runs/'+run.id+'/attempts/1/jobs?per_page=100');
  const response=await api.request('/actions/runs/'+run.id+'/artifacts?per_page=100');
  requireFact(Number.isSafeInteger(response?.total_count)&&response.total_count>=0&&response.total_count<100&&Array.isArray(response.artifacts)&&response.total_count===response.artifacts.length,'Complete observation artifact list required.');
  const candidates=response.artifacts.filter(a=>typeof a.name==='string'&&a.name.startsWith('candidate-observation-'));
  requireFact(candidates.length===1&&candidates[0].name==='candidate-observation-'+run.id+'-1'&&positive(candidates[0].id),'Unique first-attempt candidate artifact required.');
  const artifact=await api.request('/actions/artifacts/'+candidates[0].id);
  requireFact(isDeepStrictEqual(artifactSummary(artifact),artifactSummary(candidates[0])),'Observation artifact metadata changed during collection.');
  const bytes=await api.artifact(artifact.id);requireFact(Buffer.isBuffer(bytes),'Raw observation archive bytes required.');bytesRead+=bytes.length;
  requireFact(bytesRead<=64*1024*1024,'Candidate observation archives exceed the collection bound.');
  const observation={run,jobs,artifact,bytes};verifyCandidateObservation(observation,candidate,asOf,readSource);observations.push(observation);
 }
 requireFact(isDeepStrictEqual(relevant(await completeRunList(api,asOf)),selected),'Fixed-candidate history changed before collection completed.');
 const result=promotionObservations(candidate,asOf,observations,readSource);
 return{...result,observations:observations.length,bytesRead};
}
