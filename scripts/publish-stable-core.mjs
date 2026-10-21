import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {releaseJson,stableSnapshotRef,FEED_REF,readDistributionFeed} from './publish-release-core.mjs';
import {newerVersion} from './upstream-policy.mjs';
import {releaseDocuments} from './release-snapshot.mjs';
import {requireStablePublication,validateStableRecord} from './stable-release-policy.mjs';
import {requireStablePayload} from './promotion-policy.mjs';
import {promotionSummary,checkPromotionEvidence} from './promotion-gates.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),requireFact=(ok,message)=>{if(!ok)throw Error(message);};
export async function stableChannelGate(p,api,proof){
 const main=await api.request('/git/ref/heads/main');requireFact(main?.object?.type==='commit'&&main.object.sha===p.meta.sourceCommit,'Main advanced or changed identity; inspect and prepare the current source before publishing.');
 const ref=await api.request('/git/ref/'+FEED_REF);requireFact(ref?.object?.type==='commit','Published candidate channel is missing.');const feed=await readDistributionFeed(api,ref.object.sha);
 requireFact(feed.state.canary.some(({runtimeEvidence,...identity})=>isDeepStrictEqual(identity,proof.candidate)),'Fixed canary identity changed in the distribution channel.');
 for(const record of feed.state.stable){if(record.version===p.archive.manifest.version)requireFact(record.sourceCommit===p.meta.sourceCommit&&record.snapshotCommit===p.snapshot.commit&&record.archiveSha256===p.archive.sha256&&record.payloadSha256===p.archive.payloadSha256&&isDeepStrictEqual(record.upstream,p.meta.upstream),'Stable version already identifies another source or artifact.');else requireFact(newerVersion(p.archive.manifest.version,record.version),'Stable channel downgrade or out-of-order publication refused.');}
 return feed.state.stable.find(record=>record.version===p.archive.manifest.version);
}
export function stablePublishedRecord(p,release,runtimeEvidence,proof){
 requireStablePublication(p);const ms=Date.parse(release?.published_at);requireFact(Number.isSafeInteger(release?.id)&&release.id>0&&release.tag_name===p.meta.tag&&release.target_commitish===p.meta.sourceCommit&&release.draft===false&&release.prerelease===false&&Number.isFinite(ms)&&ms>=0,'Published stable release identity refused.');
 return validateStableRecord({version:p.archive.manifest.version,tag:p.meta.tag,sourceCommit:p.meta.sourceCommit,snapshotCommit:p.snapshot.commit,archiveSha256:p.archive.sha256,payloadSha256:p.archive.payloadSha256,upstream:p.meta.upstream,publishTimestamp:Math.floor(ms/1000),releaseId:release.id,runtimeEvidence,promotion:promotionSummary(proof)});
}
/** Trusted builtin publisher; verifier rechecks the original server run and raw evidence on every recovery. */
export async function publishStableRelease(p,api,proof,evidence,{verifyProof}={}){
 requireStablePublication(p);requireStablePayload(p,proof?.candidate);requireFact(typeof verifyProof==='function','Fresh promotion verification is required.');requireFact(isDeepStrictEqual(await verifyProof(proof),proof),'Current promotion proof was not independently verified.');
 const initialSummary=promotionSummary(proof);validateStableRecord({version:p.archive.manifest.version,tag:p.meta.tag,sourceCommit:p.meta.sourceCommit,snapshotCommit:p.snapshot.commit,archiveSha256:p.archive.sha256,payloadSha256:p.archive.payloadSha256,upstream:p.meta.upstream,publishTimestamp:Math.ceil(Date.parse(initialSummary.asOf)/1000),releaseId:1,runtimeEvidence:evidence,promotion:initialSummary});
 const previous=await stableChannelGate(p,api,proof);
 const snapshot=await api.request('/git/ref/'+stableSnapshotRef(p).slice(5));requireFact(snapshot?.object?.type==='commit'&&snapshot.object.sha===p.snapshot.commit,'Stable snapshot reference differs.');
 const tag=await api.request('/git/ref/tags/'+p.meta.tag,{optional:true});requireFact(!tag||tag.object?.type==='commit'&&tag.object.sha===p.meta.sourceCommit,'Stable tag has another identity; refusing replacement.');
 const body='DSH-zhen verified stable\n\nSource: '+p.meta.sourceCommit+'\nSnapshot: '+p.snapshot.commit+'\nArchive-SHA256: '+p.archive.sha256+'\nCanary: '+proof.candidate.tag+'\n';
 let release=await api.request('/releases/tags/'+p.meta.tag,{optional:true});
 if(previous)requireFact(release?.id===previous.releaseId,'Published stable version is missing or replaced; refusing to recreate it.');
 if(release)requireFact(Number.isSafeInteger(release.id)&&release.id>0&&release.tag_name===p.meta.tag&&release.target_commitish===p.meta.sourceCommit&&release.body===body&&release.prerelease===false,'Existing stable release differs.');
 if(release)requireFact(tag,'Existing stable release tag is missing; inspect before restoring it.');
 // All known release conflicts are checked before the first mutation.
 if(!tag)await api.request('/git/refs',{method:'POST',body:{ref:'refs/tags/'+p.meta.tag,sha:p.meta.sourceCommit}});
 if(!release)release=await api.request('/releases',{method:'POST',body:{tag_name:p.meta.tag,target_commitish:p.meta.sourceCommit,name:'DSH-zhen '+p.archive.manifest.version,body,draft:true,prerelease:false,make_latest:'false'}});
 requireFact(Number.isSafeInteger(release.id)&&release.id>0&&release.tag_name===p.meta.tag&&release.target_commitish===p.meta.sourceCommit&&release.body===body&&release.prerelease===false,'Stable draft creation identity differs.');
 const assets=await api.request('/releases/'+release.id+'/assets?per_page=100');requireFact(Array.isArray(assets)&&assets.length<100&&new Set(assets.map(a=>a.name)).size===assets.length,'Stable asset list is incomplete or duplicated.');
 const names=[p.meta.archiveFile,'compat.json','provenance.json','promotion.json','SHA256SUMS'];requireFact(assets.every(a=>names.includes(a.name)),'Unexpected stable release asset; refusing mutation.');
 let runtime=evidence,originalProof=proof;const compatAsset=assets.find(a=>a.name==='compat.json');
 if(compatAsset){
  let compat;try{compat=JSON.parse(await api.asset(compatAsset.id,65536));}catch{throw Error('Existing stable compatibility proof is invalid.');}
  runtime=compat.runtimeEvidence;requireFact(runtime?.workflow==='promote.yml'&&runtime.sourceCommit===p.meta.sourceCommit,'Existing stable runtime proof differs.');const verified=await checkPromotionEvidence(api,{...runtime,requiredJobs:['build','snapshot','verify']});requireFact(isDeepStrictEqual(runtime,verified),'Existing stable runtime evidence changed.');
  const proofAsset=assets.find(a=>a.name==='promotion.json');if(proofAsset){try{originalProof=JSON.parse(await api.asset(proofAsset.id,512*1024));}catch{throw Error('Original stable promotion proof is invalid.');}}
  requireFact(isDeepStrictEqual(originalProof.candidate,proof.candidate)&&originalProof.sourceCommit===p.meta.sourceCommit&&isDeepStrictEqual(promotionSummary(originalProof),compat.promotion),'Original promotion proof is missing or differs; resume the original run without replacing assets.');
  requireFact(isDeepStrictEqual(await verifyProof(originalProof),originalProof),'Original published promotion proof no longer verifies.');
 }
 // Syntactic ledger validation also runs before any asset is uploaded or a release is made public.
 const summary=promotionSummary(originalProof);validateStableRecord({version:p.archive.manifest.version,tag:p.meta.tag,sourceCommit:p.meta.sourceCommit,snapshotCommit:p.snapshot.commit,archiveSha256:p.archive.sha256,payloadSha256:p.archive.payloadSha256,upstream:p.meta.upstream,publishTimestamp:Math.ceil(Date.parse(summary.asOf)/1000),releaseId:release.id,runtimeEvidence:runtime,promotion:summary});
 const docs=releaseDocuments(p.archive,p.snapshot,{channel:'stable-candidate',tag:p.meta.tag,upstream:p.meta.upstream,publishTimestamp:p.meta.timestamp}),compat={...docs.compat,state:'verified-stable',runtimeEvidence:runtime,promotion:summary};
 const payload=new Map([[p.meta.archiveFile,p.bytes],['compat.json',releaseJson(compat)],['provenance.json',releaseJson(p.snapshot.provenance)],['promotion.json',releaseJson(originalProof)]]);payload.set('SHA256SUMS',Buffer.from([...payload].map(([name,bytes])=>sha(bytes)+'  '+name).join('\n')+'\n'));
 for(const[name,bytes]of payload){const asset=assets.find(a=>a.name===name);if(asset)requireFact(asset.state==='uploaded'&&asset.size===bytes.length&&bytes.equals(await api.asset(asset.id,name==='promotion.json'?512*1024:8*1024*1024)),'Existing stable asset differs; refusing replacement.');else{requireFact(release.draft===true,'Published stable release is incomplete; late asset modification refused.');await api.request('/releases/'+release.id+'/assets?name='+encodeURIComponent(name),{method:'POST',bytes});}}
 const uploaded=await api.request('/releases/'+release.id+'/assets?per_page=100');requireFact(Array.isArray(uploaded)&&uploaded.length===payload.size,'Stable asset readback is incomplete.');for(const[name,bytes]of payload){const matches=uploaded.filter(a=>a.name===name);requireFact(matches.length===1&&matches[0].state==='uploaded'&&matches[0].size===bytes.length&&bytes.equals(await api.asset(matches[0].id,name==='promotion.json'?512*1024:8*1024*1024)),'Stable asset readback differs.');}
 if(release.draft)await api.request('/releases/'+release.id,{method:'PATCH',body:{draft:false,prerelease:false,make_latest:'true'}});
 release=await api.request('/releases/'+release.id);return{release,record:stablePublishedRecord(p,release,runtime,originalProof)};
}
