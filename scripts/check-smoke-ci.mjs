import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function requireGreenSmokeBase(runs,commit){
  const latest=Array.isArray(runs)?runs[0]:undefined;
  if(!/^[a-f0-9]{40}$/.test(commit??'')||!latest||latest.headSha!==commit||latest.name!=='Contracts and package checks'||latest.status!=='completed'||latest.conclusion!=='success'||latest.event!=='push'||latest.headBranch!=='main')throw new Error('Latest main push contracts must pass for this exact commit before the paid diagnostic.');
  return {commit,run:latest.databaseId};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='T8mars/Deepseek-Harness-Zhenzhen'||process.env.GITHUB_REF!=='refs/heads/main')throw new Error('Smoke CI identity refused.');
  const commit=process.env.GITHUB_SHA;
  const runs=JSON.parse(execFileSync('gh',['run','list','--repo','T8mars/Deepseek-Harness-Zhenzhen','--workflow','check.yml','--commit',commit,'--event','push','--branch','main','--limit','1','--json','databaseId,headSha,name,status,conclusion,event,headBranch'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:65536}));
  console.log(JSON.stringify(requireGreenSmokeBase(runs,commit)));
}
