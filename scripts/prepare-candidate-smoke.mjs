import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {releaseApi,RELEASE_REPO} from './publish-release-core.mjs';
import {readPublishedCanary} from './published-canary.mjs';
import {bindSmokeCandidate} from './candidate-smoke-input.mjs';

export function candidateWorkflowContext(env=process.env){
 const authorized=env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.DSH_SMOKE_CONFIRM==='true'||env.GITHUB_EVENT_NAME==='schedule'&&env.DSH_SMOKE_SCHEDULE_ENABLED==='true';
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!==RELEASE_REPO||env.GITHUB_REF!=='refs/heads/main'||!authorized||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||!/^[1-9]\d{0,19}$/.test(env.GITHUB_RUN_ID??'')||env.GITHUB_RUN_ATTEMPT!=='1'||!/^v\d+\.\d+\.\d+-canary\.[1-9]\d*$/.test(env.DSH_SMOKE_CANARY??''))throw Error('Candidate observation requires an authorized first main CI attempt.');
 return{mode:'ci',commit:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID+'-1',tag:env.DSH_SMOKE_CANARY};
}
export function candidateSourceLookup(workspace=process.cwd()){
 const git=args=>execFileSync('git',['--no-replace-objects','-C',workspace,...args],{windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:2*1024*1024});
 const safe=(commit,path)=>{if(!/^[a-f0-9]{40}$/.test(commit??'')||!['packages/dsh-zhen/package.json','UPSTREAM.lock.json','scripts/check-smoke-ci.mjs','scripts/gateway-smoke-core.mjs','scripts/real-gateway-smoke.mjs'].includes(path))throw Error('Candidate source lookup refused.');};
 return{readSource:(commit,path)=>{safe(commit,path);return git(['show',commit+':'+path]);},sourceTimestamp:commit=>{safe(commit,'UPSTREAM.lock.json');return Number(git(['show','-s','--format=%ct',commit]).toString().trim());},head:()=>git(['rev-parse','HEAD']).toString().trim(),dirty:()=>!!git(['status','--porcelain','--untracked-files=normal']).toString().trim()};
}
export async function prepareCandidateSmoke({workspace=process.cwd(),env=process.env,api,source}={}){
 const context=candidateWorkflowContext(env),lookup=source??candidateSourceLookup(workspace);
 if(lookup.head()!==context.commit||lookup.dirty())throw Error('Candidate observation checkout differs or is dirty.');
 const candidate=await readPublishedCanary(api??releaseApi(env.GH_TOKEN,{readOnly:true}),context.tag,lookup);
 const result=bindSmokeCandidate(workspace,candidate.identity,context.commit);
 return{state:'bound',candidateTag:context.tag,observerCommit:context.commit,observerArchiveSha256:result.archive.sha256,paidRequests:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length!==2)throw Error('Candidate preparation accepts no arguments.');
 prepareCandidateSmoke().then(value=>console.log(JSON.stringify(value))).catch(()=>{console.error('Published candidate binding refused or unavailable; no gateway request was sent.');process.exitCode=1;});
}
