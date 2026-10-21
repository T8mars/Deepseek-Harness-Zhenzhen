import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {candidateWorkflowContext,candidateSourceLookup} from './prepare-candidate-smoke.mjs';
import {readSmokeCandidate,ownedSmokeDirectory,ordinarySmokeFile,writeSmokeFiles} from './candidate-smoke-input.mjs';
import {requireSuccessfulCandidateReceipt} from './promotion-policy.mjs';

export function exportCandidateObservation({workspace=process.cwd(),env=process.env,source}={}){
 const context=candidateWorkflowContext(env),lookup=source??candidateSourceLookup(workspace);
 if(lookup.head()!==context.commit||lookup.dirty())throw Error('Observation export source differs or is dirty.');
 const observer=readSmokeCandidate({...context,workspace}),evidence=ownedSmokeDirectory(workspace,['.runtime','evidence']);
 const bytes=ordinarySmokeFile(evidence,'real-gateway-smoke-'+context.runId+'.json',16384);let report;try{report=JSON.parse(bytes);}catch{throw Error('Candidate observation receipt is unavailable.');}
 requireSuccessfulCandidateReceipt(report,{candidate:observer.binding.identity,archive:observer.archive,commit:context.commit,runId:context.runId,readSource:lookup.readSource});
 const target=ownedSmokeDirectory(workspace,['.runtime','candidate-observation'],{create:true});
 writeSmokeFiles(target,new Map([['report.json',bytes],['bundle.tgz',observer.bytes]]));
 return{state:'exported',candidateTag:context.tag,runId:context.runId,observerArchiveSha256:observer.archive.sha256,files:2,paidRequests:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{if(process.argv.length!==2)throw Error('Observation export accepts no arguments.');console.log(JSON.stringify(exportCandidateObservation()));}catch{console.error('Candidate observation export refused or incomplete; existing request must not be resent.');process.exitCode=1;}
}
