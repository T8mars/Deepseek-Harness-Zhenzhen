import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {releaseJson,checkReleaseEvidence} from './publish-release-core.mjs';
import {readPublishedCanary} from './published-canary.mjs';
import {requireStablePayload,validateCandidateIdentity} from './promotion-policy.mjs';
import {reviewedUpstreamSource,upstreamServerReview} from './promotion-upstream.mjs';
import {promotionServerSnapshot,collectCandidateObservations} from './collect-candidate-observations.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),keys=x=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().join(','):'';
const requireFact=(ok,message)=>{if(!ok)throw Error(message);},hex=(x,n)=>typeof x==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(x),positive=x=>Number.isSafeInteger(x)&&x>0;
export function promotionSummary(proof){
 requireFact(keys(proof)==='candidate,observations,observationsSha256,policy,profileSha256,promotionRun,schemaVersion,sourceCommit,upstreamReview,upstreamReviewSha256'&&proof.schemaVersion===1&&proof.policy==='stable-fixed-canary-v1'&&hex(proof.sourceCommit,40)&&keys(proof.promotionRun)==='asOf,runId'&&positive(proof.promotionRun.runId)&&hex(proof.profileSha256,64),'Stable promotion proof identity refused.');validateCandidateIdentity(proof.candidate);
 const o=proof.observations,u=proof.upstreamReview;
 requireFact(o?.schemaVersion===1&&o.policy==='fixed-canary-seven-utc-days-v1'&&o.days===7&&o.asOf===proof.promotionRun.asOf&&isDeepStrictEqual(o.candidate,proof.candidate)&&sha(releaseJson(o))===proof.observationsSha256,'Stable observation proof differs from its fixed candidate.');
 requireFact(u?.schemaVersion===1&&u.policy==='reviewed-pinned-sdk-v1'&&u.sourceCommit===proof.sourceCommit&&u.profileSha256===proof.profileSha256&&isDeepStrictEqual(u.upstream,proof.candidate.upstream)&&positive(u.w3?.runId)&&sha(releaseJson(u))===proof.upstreamReviewSha256,'Stable upstream review proof differs.');
 return{schemaVersion:1,policy:proof.policy,sha256:sha(releaseJson(proof)),candidate:structuredClone(proof.candidate),asOf:proof.promotionRun.asOf,windowStart:o.windowStart,windowEnd:o.windowEnd,days:7,upstreamReviewSha256:proof.upstreamReviewSha256,profileSha256:proof.profileSha256,promotionRunId:proof.promotionRun.runId};
}
/** Every call reads original raw server evidence; inert JSON cannot approve its own promotion. */
export async function collectPromotionProof(api,p,{source,runId,canaryTag,profileDigest}){
 requireFact(positive(runId)&&hex(profileDigest,64),'Promotion source profile or server run is unavailable.');
 const latest=await api.request('/actions/runs/'+runId),snapshot=await promotionServerSnapshot(api,{sourceCommit:p.meta.sourceCommit,runId,attempt:latest?.run_attempt});
 const published=await readPublishedCanary(api,canaryTag,source);requireStablePayload(p,published.identity);
 const review=reviewedUpstreamSource(source,p.meta.sourceCommit,p.meta.upstream,{profileDigest}),upstream=await upstreamServerReview(api,source,p.meta.sourceCommit,p.meta.upstream,snapshot.asOf,review),observations=await collectCandidateObservations(api,published.identity,{asOf:snapshot.asOf,readSource:source.readSource});
 const proof={schemaVersion:1,policy:'stable-fixed-canary-v1',sourceCommit:p.meta.sourceCommit,promotionRun:{runId,asOf:snapshot.asOf},candidate:published.identity,observations:observations.proof,observationsSha256:observations.sha256,upstreamReview:upstream,upstreamReviewSha256:sha(releaseJson(upstream)),profileSha256:profileDigest};promotionSummary(proof);return proof;
}
export async function verifyPromotionProof(api,p,proof,{source}){
 promotionSummary(proof);requireFact(proof.sourceCommit===p.meta.sourceCommit,'Promotion proof belongs to another stable source.');
 const expected=await collectPromotionProof(api,p,{source,runId:proof.promotionRun.runId,canaryTag:proof.candidate.tag,profileDigest:proof.profileSha256});requireFact(isDeepStrictEqual(proof,expected),'Promotion artifact differs from freshly rechecked server and source evidence.');return expected;
}
export async function checkPromotionEvidence(api,options){
 const evidence=await checkReleaseEvidence(api,{...options,workflow:'promote.yml'}),jobs=await api.request('/actions/runs/'+options.runId+'/attempts/'+options.attempt+'/jobs?per_page=100');
 requireFact(Array.isArray(jobs?.jobs)&&jobs.total_count===jobs.jobs.length&&jobs.jobs.length<=100,'Complete promotion build steps required.');const matches=jobs.jobs.filter(job=>job.name==='build'&&job.run_attempt===options.attempt&&job.run_id===options.runId);requireFact(matches.length===1&&Array.isArray(matches[0].steps),'Unique promotion build proof required.');
 for(const name of['Run npm run check','Capture shipped SDK profile','Prepare stable promotion']){const steps=matches[0].steps.filter(step=>step.name===name);requireFact(steps.length===1&&steps[0].status==='completed'&&steps[0].conclusion==='success','Promotion build, actual shipped-profile capture or preparation did not succeed.');}return evidence;
}
