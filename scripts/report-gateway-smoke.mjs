import {existsSync,readFileSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const repository='T8mars/Deepseek-Harness-Zhenzhen';
const codes=new Set(['AUTH','MISSING_CREDENTIAL','RATE_LIMIT','TIMEOUT','SERVER','PI_AI_ERROR','NO_ADAPTER','CANCELLED','INCOMPLETE','RESPONSE_LIMIT','UNAVAILABLE','OUTBOUND_REFUSED','ROUTE_REFUSED','UNEXPECTED_TEXT','SETUP','CLEANUP']);
export function failureIssuePlan(report,{commit,runId,attempt}){
  if(!/^[a-f0-9]{40}$/.test(commit??'')||!/^\d{1,20}$/.test(runId??'')||!/^\d{1,5}$/.test(attempt??''))throw Error('Diagnostic issue identity refused.');
  let outcome='untracked',code='UNTRACKED',requests=null,status=null;
  if(report!==undefined){
    if(report.schemaVersion!==1||report.mode!=='ci'||report.repository!==repository||report.commit!==commit||report.runId!==runId+'-'+attempt||report.policy!=='default-flash-single-512-v1'||report.provider!=='seedance'||report.model!=='deepseek/deepseek-v4.1-flash'||report.maxTokens!==512||report.sourceDirty!==false||!['failed','incomplete','not-run'].includes(report.outcome)||!codes.has(report.code)||![0,1].includes(report.requests)||!(report.httpStatus===null||Number.isInteger(report.httpStatus)&&report.httpStatus>=100&&report.httpStatus<=599))throw Error('Diagnostic failure receipt refused.');
    ({outcome,code,requests,httpStatus:status}=report);
  }
  return {title:`[Gateway smoke] ${commit} ${code}`,body:[
    'The isolated default Flash diagnostic did not pass.',
    '',`Commit: \`${commit}\``, `Outcome: ${outcome}`, `Code: ${code}`,`Dispatched requests: ${requests===null?'unknown':requests}`,`HTTP status: ${status===null?'unknown':status}`,
    '',report===undefined?'A final receipt is unavailable. Gateway acceptance is unknown; do not automatically resend.':'No automatic retry was performed. This result is separate from PR contract checks.',
    '',`[Workflow run](https://github.com/${repository}/actions/runs/${runId})`,
  ].join('\n')};
}
export function existingFailureIssue(issues,plan){
  if(!Array.isArray(issues)||issues.length>100)throw Error('Issue lookup incomplete.');
  const found=issues.find(issue=>!issue.pull_request&&issue.state==='open'&&issue.title===plan.title);
  if(found){if(!Number.isSafeInteger(found.number)||found.number<=0)throw Error('Issue identity refused.');return found.number;}
  if(issues.length===100)throw Error('Issue lookup may be truncated; refusing duplicate publication.');
  return undefined;
}
export function notificationIdentity(env){
  if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!==repository||env.GITHUB_REF!=='refs/heads/main'||!['schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||env.DSH_SMOKE_REPORT_FAILURE!=='true')throw Error('Failure notification is not enabled for this workflow.');
  const identity={commit:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT};
  failureIssuePlan(undefined,identity); // Validate before constructing a receipt path.
  return identity;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    if(process.argv.slice(2).join(' ')!=='--publish')throw Error('Explicit CI publication mode required.');
    const identity=notificationIdentity(process.env),file=resolve('.runtime/ci-gateway-report',`real-gateway-smoke-${identity.runId}-${identity.attempt}.json`);
    let report;if(existsSync(file)){const text=readFileSync(file,'utf8');if(text.length>16384)throw Error('Receipt too large.');report=JSON.parse(text);}
    const plan=failureIssuePlan(report,identity);
    const issues=JSON.parse(execFileSync('gh',['api','--method','GET',`repos/${repository}/issues?state=open&per_page=100`],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:2*1024*1024}));
    const existing=existingFailureIssue(issues,plan);
    if(existing)console.log(JSON.stringify({existingIssue:existing,created:false}));
    else{
      const result=spawnSync('gh',['api','--method','POST',`repos/${repository}/issues`,'--input','-'],{input:JSON.stringify(plan),encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],maxBuffer:65536});
      if(result.status!==0)throw Error('Issue publication unavailable.');
      const created=JSON.parse(result.stdout);if(!Number.isSafeInteger(created.number)||created.number<=0)throw Error('Issue response refused.');
      console.log(JSON.stringify({createdIssue:created.number,created:true}));
    }
  }catch{console.error('Diagnostic issue reporting refused or unavailable; private details withheld.');process.exitCode=1;}
}
