import {promotionInvocation,readPromotionInput} from './promotion-input.mjs';
import {promotionSource} from './promotion-source.mjs';
import {releaseApi,uploadStableSnapshot,publishDistributionFeed} from './publish-release-core.mjs';
import {releaseOutput} from './release-input.mjs';
import {verifyPromotionProof,checkPromotionEvidence} from './promotion-gates.mjs';
import {publishStableRelease,stableChannelGate} from './publish-stable-core.mjs';

const token=process.env.GH_TOKEN;delete process.env.GH_TOKEN;
const[command,...args]=process.argv.slice(2);if(args.length||!['snapshot','finalize'].includes(command))throw Error('Usage: publish-promotion.mjs snapshot|finalize');
const context=promotionInvocation(),source=promotionSource();if(!context.publish||source.head()!==context.sourceCommit||source.dirty())throw Error('Stable publication requires an explicitly enabled exact clean main dispatch.');
const p=readPromotionInput();if(p.meta.sourceCommit!==context.sourceCommit||p.proof.promotionRun.runId!==context.runId)throw Error('Promotion artifact belongs to another workflow.');
const api=releaseApi(token),verifyProof=proof=>verifyPromotionProof(api,p,proof,{source});await verifyProof(p.proof);
await stableChannelGate(p,api,p.proof);
const evidence=await checkPromotionEvidence(api,{...context,requiredJobs:command==='snapshot'?['build']:['build','snapshot','verify']});
if(command==='snapshot'){
 const result=await uploadStableSnapshot(p,api,token);releaseOutput('snapshot_commit',result.commit);console.log(JSON.stringify({...result,releasePublished:false}));
}else{
 const result=await publishStableRelease(p,api,p.proof,evidence,{verifyProof}),feed=await publishDistributionFeed(api,result.record);releaseOutput('feed_commit',feed.commit);console.log(JSON.stringify({state:'published-stable',tag:p.meta.tag,releaseId:result.release.id,sourceCommit:p.meta.sourceCommit,snapshotCommit:p.snapshot.commit,feedCommit:feed.commit,pagesDeployed:false}));
}
