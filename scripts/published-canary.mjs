import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {FEED_REF,readDistributionFeed,checkReleaseEvidence,releaseJson} from './publish-release-core.mjs';
import {readReleaseArchive} from './release-archive.mjs';
import {releaseSnapshot,releaseDocuments} from './release-snapshot.mjs';
import {candidateIdentity} from './promotion-policy.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const requireFact=(ok,message)=>{if(!ok)throw Error(message);};
/** Re-read immutable release assets and original server evidence; no SDK or candidate execution. */
export async function readPublishedCanary(api,tag,{readSource,sourceTimestamp}={}){
 requireFact(/^v\d+\.\d+\.\d+-canary\.[1-9]\d*$/.test(tag??''),'An explicit fixed canary tag is required.');
 const ref=await api.request('/git/ref/'+FEED_REF,{optional:true});
 requireFact(ref?.object?.type==='commit','No published canary distribution is available.');
 const feed=await readDistributionFeed(api,ref.object.sha),record=feed.state.canary.find(r=>r.tag===tag);
 requireFact(record,'The requested canary is not in the verified distribution ledger.');
 const identity=candidateIdentity(record),release=await api.request('/releases/tags/'+tag);
 requireFact(release?.id===identity.releaseId&&release.tag_name===tag&&release.target_commitish===identity.sourceCommit&&release.draft===false&&release.prerelease===true&&Number.isFinite(Date.parse(release.published_at))&&Math.floor(Date.parse(release.published_at)/1000)===identity.publishTimestamp,'Published canary release identity differs.');
 const archiveFile=`dsh-zhen-${identity.version}-${identity.archiveSha256.slice(0,16)}.tgz`,names=[archiveFile,'compat.json','provenance.json','SHA256SUMS'];
 const assets=await api.request('/releases/'+release.id+'/assets?per_page=100');
 requireFact(Array.isArray(assets)&&assets.length===names.length&&new Set(assets.map(a=>a.name)).size===names.length&&new Set(assets.map(a=>a.id)).size===names.length&&assets.every(a=>names.includes(a.name)&&Number.isSafeInteger(a.id)&&a.id>0&&a.state==='uploaded'&&Number.isSafeInteger(a.size)&&a.size>0&&a.size<=(a.name===archiveFile?8*1024*1024:65536)),'Published canary assets are incomplete or unexpected.');
 const contents=new Map();for(const name of names){const asset=assets.find(a=>a.name===name),bytes=await api.asset(asset.id,name===archiveFile?8*1024*1024:65536);requireFact(Buffer.isBuffer(bytes)&&bytes.length===asset.size,'Published canary asset size differs.');contents.set(name,bytes);}
 const bytes=contents.get(archiveFile),archive=readReleaseArchive(bytes);
 requireFact(archive.sha256===identity.archiveSha256&&archive.payloadSha256===identity.payloadSha256&&archive.manifest.version===identity.version,'Published canary archive identity differs.');
 requireFact(typeof readSource==='function'&&typeof sourceTimestamp==='function','Trusted source lookup is required.');
 let manifest,lock;try{manifest=JSON.parse(readSource(identity.sourceCommit,'packages/dsh-zhen/package.json'));lock=JSON.parse(readSource(identity.sourceCommit,'UPSTREAM.lock.json'));}catch{throw Error('Published canary source metadata is unavailable.');}
 requireFact(isDeepStrictEqual(manifest,archive.manifest)&&isDeepStrictEqual({version:lock.dsh?.version,commit:lock.dsh?.commit},identity.upstream),'Published canary differs from its source manifest or upstream pin.');
 const timestamp=sourceTimestamp(identity.sourceCommit),snapshot=releaseSnapshot(archive,{sourceCommit:identity.sourceCommit,timestamp});
 requireFact(snapshot.commit===identity.snapshotCommit,'Published canary snapshot differs from deterministic source provenance.');
 const tagRef=await api.request('/git/ref/tags/'+tag),snapshotRef=await api.request('/git/ref/heads/codex/distribution-snapshots/'+tag);
 requireFact(tagRef?.object?.type==='commit'&&tagRef.object.sha===identity.sourceCommit&&snapshotRef?.object?.type==='commit'&&snapshotRef.object.sha===identity.snapshotCommit,'Published canary source or snapshot reference differs.');
 const runtime=await checkReleaseEvidence(api,{...record.runtimeEvidence,requiredJobs:['build','snapshot','verify']});
 requireFact(isDeepStrictEqual(runtime,record.runtimeEvidence),'Original canary runtime evidence differs.');
 const docs=releaseDocuments(archive,snapshot,{channel:'canary',tag,upstream:identity.upstream,publishTimestamp:timestamp});
 const expected=new Map([[archiveFile,bytes],['compat.json',releaseJson({...docs.compat,state:'verified-canary',runtimeEvidence:runtime})],['provenance.json',releaseJson(snapshot.provenance)]]);
 expected.set('SHA256SUMS',Buffer.from([...expected].map(([name,data])=>sha(data)+'  '+name).join('\n')+'\n'));
 for(const[name,data]of expected)requireFact(data.equals(contents.get(name)),'Published canary asset content differs from its original proof.');
 return{identity,record,archive,bytes,snapshot,release,feedCommit:ref.object.sha};
}
