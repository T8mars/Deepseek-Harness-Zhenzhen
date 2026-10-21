import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function main(args=process.argv.slice(2)){
  // Remove the CI secret before loading any adapter/dependency code or child.
  const credentialValue=process.env.SEEDANCE_API_KEY;delete process.env.SEEDANCE_API_KEY;
  const {smokeInvocation,runGatewaySmoke}=await import('./gateway-smoke-core.mjs');
  const invocation=smokeInvocation(args);
  const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
  if(invocation.commit&&invocation.commit!==commit)throw new Error('Checkout identity refused.');
  const sourceDirty=!!execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
  if(invocation.mode==='ci'&&sourceDirty)throw new Error('Dirty checkout refused.');
  const report=await runGatewaySmoke({...invocation,commit,sourceDirty,credentialValue});
  console.log(JSON.stringify(report));
  return report.outcome==='passed'?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().then(code=>{process.exitCode=code;}).catch(()=>{console.error('Gateway smoke refused or unavailable; private details withheld.');process.exitCode=1;});
