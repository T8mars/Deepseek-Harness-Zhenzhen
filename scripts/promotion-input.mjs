import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {releaseApi,releaseJson,RELEASE_REPO,FEED_REF,readDistributionFeed} from './publish-release-core.mjs';
import {readReleaseInput,releaseOutput} from './release-input.mjs';
import {promotionSource} from './promotion-source.mjs';
import {profileFactsSha256,reviewedUpstreamSource} from './promotion-upstream.mjs';
import {collectPromotionProof,promotionSummary} from './promotion-gates.mjs';
import {ordinarySmokeFile,ownedSmokeDirectory,writeSmokeFiles} from './candidate-smoke-input.mjs';
import {observationWindow,requireStablePayload} from './promotion-policy.mjs';
import {promotionServerSnapshot} from './collect-candidate-observations.mjs';

const keys=x=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().join(','):'',requireFact=(ok,message)=>{if(!ok)throw Error(message);};
export function promotionInvocation(env=process.env){
 requireFact(env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY===RELEASE_REPO&&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')&&/^[1-9]\d{0,19}$/.test(env.GITHUB_RUN_ID??'')&&/^[1-9]\d{0,4}$/.test(env.GITHUB_RUN_ATTEMPT??'')&&['true','false'].includes(env.DSH_PUBLISH_STABLE??''),'Promotion requires an explicit own main dispatch.');
 const tag=env.DSH_PROMOTE_CANARY??'';requireFact(tag===''||/^v\d+\.\d+\.\d+-canary\.[1-9]\d*$/.test(tag),'Fixed promotion canary tag refused.');requireFact(Number.isSafeInteger(Number(env.GITHUB_RUN_ID))&&Number.isSafeInteger(Number(env.GITHUB_RUN_ATTEMPT)),'Promotion run counters exceed supported integers.');return{sourceCommit:env.GITHUB_SHA,runId:Number(env.GITHUB_RUN_ID),attempt:Number(env.GITHUB_RUN_ATTEMPT),publish:env.DSH_PUBLISH_STABLE==='true',tag};
}
function sourceContext(workspace,context){const source=promotionSource(workspace);requireFact(source.head()===context.sourceCommit&&!source.dirty(),'Promotion requires the exact clean source checkout.');return source;}
function writeSingle(root,name,bytes){if(existsSync(join(root,name)))requireFact(ordinarySmokeFile(root,name,512*1024).equals(bytes),'Refusing to replace different promotion evidence.');else writeFileSync(join(root,name),bytes,{flag:'wx'});}
function profileInput(workspace,context,source){
 const root=ownedSmokeDirectory(workspace,['.runtime']);let value;try{value=JSON.parse(ordinarySmokeFile(root,'promotion-profile.json',16384));}catch{throw Error('Actual shipped SDK profile capture is missing.');}const pin=JSON.parse(source.readSource(context.sourceCommit,'UPSTREAM.lock.json')).dsh,baseline=JSON.parse(source.readSource(context.sourceCommit,'contracts/upstream-baseline.json'));
 requireFact(keys(value)==='adapterVersion,dshVersion,profileSha256,schemaVersion,sourceCommit,upstream'&&value.schemaVersion===1&&value.sourceCommit===context.sourceCommit&&isDeepStrictEqual(value.upstream,{version:pin.version,commit:pin.commit})&&value.dshVersion===pin.version&&value.adapterVersion===pin.version&&value.profileSha256===profileFactsSha256(baseline.webRows),'Captured shipped SDK profile differs from the source baseline or pin.');return value;
}
export async function capturePromotionProfile({workspace=process.cwd(),env=process.env,capture}={}){
 const context=promotionInvocation(env),source=sourceContext(workspace,context),pin=JSON.parse(source.readSource(context.sourceCommit,'UPSTREAM.lock.json')).dsh,baseline=JSON.parse(source.readSource(context.sourceCommit,'contracts/upstream-baseline.json'));
 const dshVersion=JSON.parse(readFileSync(join(workspace,'node_modules/@deepseek-ai/dsh/package.json'))).version,adapterVersion=JSON.parse(readFileSync(join(workspace,'node_modules/@deepseek-ai/dsh-llm-pi-ai/package.json'))).version;requireFact(dshVersion===pin.version&&adapterVersion===pin.version,'Installed promotion SDK differs from the exact pin.');
 const captureProfile=capture??(await import('./upstream-inspect.mjs')).captureProfile,rows=await captureProfile(workspace);requireFact(isDeepStrictEqual(rows,baseline.webRows),'Actual shipped SDK profile differs from the trusted baseline.');sourceContext(workspace,context);
 const value={schemaVersion:1,sourceCommit:context.sourceCommit,upstream:{version:pin.version,commit:pin.commit},dshVersion,adapterVersion,profileSha256:profileFactsSha256(rows)},root=ownedSmokeDirectory(workspace,['.runtime'],{create:true});writeSingle(root,'promotion-profile.json',releaseJson(value));return{state:'profile-captured',sourceCommit:context.sourceCommit,rows:rows.length,profileSha256:value.profileSha256};
}
export function readPromotionInput(workspace=process.cwd()){
 const p=readReleaseInput(workspace),root=ownedSmokeDirectory(workspace,['.runtime','promotion-input']);let proof,bytes;try{bytes=ordinarySmokeFile(root,'promotion.json',512*1024);proof=JSON.parse(bytes);}catch{throw Error('Stable promotion proof input is invalid.');}requireFact(isDeepStrictEqual(readdirSync(root),['promotion.json'])&&bytes.equals(releaseJson(proof)),'Unexpected or noncanonical promotion input files.');promotionSummary(proof);requireFact(proof.sourceCommit===p.meta.sourceCommit,'Promotion proof and release input identify different sources.');requireStablePayload(p,proof.candidate);return{...p,proof};
}
const knownReviewMissing=message=>['Initial SDK applicability review is missing; an observation-only baseline is not approval.','Initial SDK upgrade guides need individual applicability acknowledgments.','Upgrade guide or profile applicability needs explicit acknowledgment.'].includes(message);
export async function preparePromotion({workspace=process.cwd(),env=process.env,api}={}){
 const context=promotionInvocation(env),source=sourceContext(workspace,context),profile=profileInput(workspace,context,source),client=api??releaseApi(env.GH_TOKEN,{readOnly:true}),snapshot=await promotionServerSnapshot(client,context),missing=[];
 let review;try{review=reviewedUpstreamSource(source,context.sourceCommit,profile.upstream,{profileDigest:profile.profileSha256});}catch(error){if(!knownReviewMissing(error.message))throw error;missing.push('upstream-applicability-review');}
 const ref=await client.request('/git/ref/'+FEED_REF,{optional:true});let record;if(ref){requireFact(ref.object?.type==='commit','Distribution feed reference is not a commit.');const feed=await readDistributionFeed(client,ref.object.sha);record=context.tag?feed.state.canary.find(r=>r.tag===context.tag):feed.state.canary[0];}
 if(!record)missing.push('published-canary');else{try{observationWindow(record,snapshot.asOf);}catch(error){if(!['Canary needs seven complete UTC observation days.','Candidate observation retention window exceeded; prepare a fresh candidate.'].includes(error.message))throw error;missing.push('seven-complete-observation-days');}}
 let proof,p;if(!missing.length){
  // Existing SDK-aware exporter runs without the GitHub token in its child environment.
  const manifest=JSON.parse(source.readSource(context.sourceCommit,'packages/dsh-zhen/package.json')),childEnv={};for(const[key,value]of Object.entries(process.env))if(['path','systemroot','windir','temp','tmp','lang','lc_all'].includes(key.toLowerCase()))childEnv[key]=value;
  execFileSync(process.execPath,[resolve(workspace,'scripts/release-input.mjs'),'export','--channel','stable-candidate','--tag','v'+manifest.version],{cwd:workspace,env:childEnv,windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:65536});
  p=readReleaseInput(workspace);proof=await collectPromotionProof(client,p,{source,runId:context.runId,canaryTag:record.tag,profileDigest:profile.profileSha256});requireFact(review.evidence.profileSha256===proof.profileSha256,'Reviewed promotion profile changed.');
  const directory=ownedSmokeDirectory(workspace,['.runtime','promotion-input'],{create:true});writeSmokeFiles(directory,new Map([['promotion.json',releaseJson(proof)]]));
 }
 const report={schemaVersion:1,state:missing.length?'blocked':'ready',sourceCommit:context.sourceCommit,canaryTag:record?.tag??context.tag,missing,published:false,modelRequests:0,nativeWrites:0,...(p?{archiveSha256:p.archive.sha256,snapshotCommit:p.snapshot.commit,packageFiles:p.archive.files.size}:{}),...(proof?{promotionSha256:promotionSummary(proof).sha256}:{})};
 const evidence=ownedSmokeDirectory(workspace,['.runtime','evidence'],{create:true});writeSingle(evidence,'promotion-preview.json',releaseJson(report));releaseOutput('ready',missing.length?'false':'true',env);console.log(JSON.stringify(report));requireFact(!context.publish||!missing.length,'Stable publication is blocked by missing reviewed evidence.');return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const token=process.env.GH_TOKEN;delete process.env.GH_TOKEN;const[command,...args]=process.argv.slice(2);
 try{requireFact(!args.length&&['capture-profile','prepare'].includes(command),'Usage: promotion-input.mjs capture-profile|prepare');if(command==='capture-profile')console.log(JSON.stringify(await capturePromotionProfile()));else await preparePromotion({api:releaseApi(token,{readOnly:true})});}catch{console.error('Stable promotion preparation refused; inspect the bounded preview and required evidence. No publication was attempted.');process.exitCode=1;}
}
