import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,readFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {parse} from 'yaml';
import {runGatewaySmoke,smokeTransport,smokeInvocation,SMOKE_MODEL,SMOKE_PROMPT} from '../scripts/gateway-smoke-core.mjs';
import {requireGreenSmokeBase} from '../scripts/check-smoke-ci.mjs';
import {failureIssuePlan,existingFailureIssue,notificationIdentity} from '../scripts/report-gateway-smoke.mjs';
const commit='1'.repeat(40),key='EXAMPLE_ONLY_CI_CREDENTIAL',repo='T8mars/Deepseek-Harness-Zhenzhen';
function workspace(t){const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-smoke-contract-EXAMPLE-')));t.after(()=>{const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});return root;}
const delta=(content,finish_reason=null,usage)=>JSON.stringify({choices:[{index:0,delta:content===null?{}:{content},finish_reason}],...(usage?{usage}:{})});
function sse(text='OK',finish='stop'){return new Response([delta(text),delta(null,finish,{prompt_tokens:7,completion_tokens:2,total_tokens:9}),'[DONE]'].map(x=>'data: '+x+'\n\n').join(''),{status:200,headers:{'content-type':'text/event-stream'}});}
const options=root=>({workspace:root,mode:'ci',runId:'example-1',commit,credentialValue:key});

test('C71: real published adapter diagnostic uses only the fixed route/message and saves safe counts',async t=>{
 const root=workspace(t);let requests=0;
 const result=await runGatewaySmoke({...options(root),fetcher:async(input,init)=>{requests++;assert.equal(init.redirect,'error');const headers=new Headers(init.headers??(input instanceof Request?input.headers:undefined));assert.equal(headers.get('authorization'),'Bearer '+key);const body=JSON.parse(init.body);assert.equal(body.model,SMOKE_MODEL);assert.equal(body.max_tokens,512);assert.equal(body.messages.length,1);return sse();}});
 assert.equal(requests,1);assert.equal(result.requests,1);assert.equal(result.outcome,'passed');assert.equal(result.visibleTextMatched,true);assert.equal(result.temporaryCleaned,true);assert.equal(result.inputTokens,7);assert.equal(result.outputTokens,2);assert.equal(JSON.stringify(result).includes(key),false);assert.equal('text' in result,false);assert.equal('messages' in result,false);assert.equal(result.userSessionsAccessed,false);
 const stored=readFileSync(join(root,'.runtime/evidence/real-gateway-smoke-example-1.json'),'utf8');assert.equal(stored.includes(key),false);assert.equal(stored.includes(SMOKE_PROMPT),false);
});

test('C71: authentication failure stays one dispatched request and contains no raw gateway body',async t=>{
 let calls=0;const result=await runGatewaySmoke({...options(workspace(t)),fetcher:async()=>{calls++;return Response.json({error:{message:key+' EXAMPLE_PRIVATE_ERROR'}},{status:401});}});
 assert.equal(calls,1);assert.equal(result.requests,1);assert.equal(result.outcome,'failed');assert.equal(result.code,'AUTH');assert.equal(JSON.stringify(result).includes(key),false);assert.equal(JSON.stringify(result).includes('EXAMPLE_PRIVATE_ERROR'),false);
});

test('C71: transport exception is sanitized and never retried',async t=>{
 let calls=0;const result=await runGatewaySmoke({...options(workspace(t)),fetcher:async()=>{calls++;throw Error('EXAMPLE_PRIVATE_URL_AND_'+key);}});
 assert.equal(calls,1);assert.equal(result.outcome,'failed');assert.equal(result.requests,1);assert.equal(JSON.stringify(result).includes(key),false);assert.equal(result.temporaryCleaned,true);
});

test('C71: token exhaustion is incomplete rather than a passing empty answer',async t=>{
 const result=await runGatewaySmoke({...options(workspace(t)),fetcher:async()=>sse('', 'length')});
 assert.equal(result.outcome,'incomplete');assert.equal(result.visibleTextMatched,false);assert.equal(result.finishKind,'max-tokens');assert.equal(result.requests,1);
});

test('C71: fixed transport rejects offsite or second dispatch and forces redirect refusal',async()=>{
 let calls=0;const h=smokeTransport(async(_input,init)=>{calls++;assert.equal(init.redirect,'error');return sse();}),init={method:'POST',body:JSON.stringify({model:SMOKE_MODEL,max_tokens:512,stream:true,messages:[{role:'user',content:SMOKE_PROMPT}]})};
 await assert.rejects(h.fetch('https://example.invalid/v1/chat/completions',init));assert.equal(calls,0);
 await h.fetch('https://api.seedance.nz/v1/chat/completions',init);await assert.rejects(h.fetch('https://api.seedance.nz/v1/chat/completions',init));assert.equal(calls,1);assert.equal(h.facts.blockedRequests,2);
});

test('C71: CI invocation requires own main, allowed event and explicit paid authority',()=>{
 const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:repo,GITHUB_REF:'refs/heads/main',GITHUB_SHA:commit,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_NAME:'workflow_dispatch',DSH_SMOKE_CONFIRM:'true'};
 assert.deepEqual(smokeInvocation(['--ci'],env),{mode:'ci',commit,runId:'123-1'});
 for(const patch of [{GITHUB_REPOSITORY:'EXAMPLE_FORK/EXAMPLE_REPOSITORY'},{GITHUB_REF:'refs/pull/1/merge'},{GITHUB_EVENT_NAME:'pull_request'},{DSH_SMOKE_CONFIRM:'false'},{GITHUB_SHA:'EXAMPLE_NOT_A_COMMIT'}])assert.throws(()=>smokeInvocation(['--ci'],{...env,...patch}));
 assert.throws(()=>smokeInvocation(['--local','--id','example'],env));
 assert.throws(()=>smokeInvocation(['--ci'],{...env,GITHUB_EVENT_NAME:'schedule',DSH_SMOKE_SCHEDULE_ENABLED:'false'}));
 assert.equal(smokeInvocation(['--ci'],{...env,GITHUB_EVENT_NAME:'schedule',DSH_SMOKE_SCHEDULE_ENABLED:'true'}).mode,'ci');
});

test('C71: a spent attempt cannot resend or overwrite its previous receipt',async t=>{
 const root=workspace(t);let calls=0;const o={...options(root),fetcher:async()=>{calls++;return sse();}};
 await runGatewaySmoke(o);const path=join(root,'.runtime/evidence/real-gateway-smoke-example-1.json'),before=readFileSync(path,'utf8');
 await assert.rejects(runGatewaySmoke(o),error=>error.code==='EEXIST');assert.equal(calls,1);assert.equal(readFileSync(path,'utf8'),before);
});

test('C71: missing credential records not-run with zero HTTP dispatches',async t=>{
 let calls=0;const result=await runGatewaySmoke({...options(workspace(t)),credentialValue:undefined,fetcher:async()=>{calls++;return sse();}});
 assert.equal(result.outcome,'not-run');assert.equal(result.code,'MISSING_CREDENTIAL');assert.equal(calls,0);assert.equal(result.requests,0);assert.equal(result.temporaryCleaned,true);
});

test('C71: smoke CI gate demands the latest successful exact main push checks',()=>{
 const good={databaseId:123,headSha:commit,name:'Contracts and package checks',status:'completed',conclusion:'success',event:'push',headBranch:'main'};
 assert.deepEqual(requireGreenSmokeBase([good],commit),{commit,run:123});
 for(const patch of [{headSha:'2'.repeat(40)},{status:'in_progress'},{conclusion:'failure'},{event:'pull_request'},{headBranch:'EXAMPLE_BRANCH'}])assert.throws(()=>requireGreenSmokeBase([{...good,...patch},good],commit));
 assert.throws(()=>requireGreenSmokeBase([],commit));
});

test('C71: workflow isolates the secret to the paid step and keeps schedules opt-in',()=>{
 const workflows=join(import.meta.dirname,'../.github/workflows'),w=parse(readFileSync(join(workflows,'real-gateway-smoke.yml'),'utf8'));
 assert.deepEqual(Object.keys(w.on).sort(),['schedule','workflow_dispatch']);assert.equal(w.on.workflow_dispatch.inputs.confirm_paid_check.default,false);assert.match(w.jobs.smoke.if,/REAL_GATEWAY_SMOKE_ENABLED == 'true'/);assert.match(w.jobs.smoke.if,/refs\/heads\/main/);assert.equal(w.concurrency['cancel-in-progress'],false);assert.equal(w.jobs.smoke.permissions.contents,'read');
 const secretSteps=w.jobs.smoke.steps.filter(step=>step.env?.SEEDANCE_API_KEY);assert.equal(secretSteps.length,1);assert.equal(secretSteps[0].run,'node scripts/real-gateway-smoke.mjs --ci');
 for(const name of readdirSync(workflows).filter(x=>x.endsWith('.yml')&&x!=='real-gateway-smoke.yml'))assert.equal(readFileSync(join(workflows,name),'utf8').includes('secrets.SEEDANCE_API_KEY'),false);
 assert.ok(w.jobs.smoke.steps.some(step=>step.run==='node scripts/check-smoke-ci.mjs'));
 assert.equal(w.jobs.smoke.steps.at(-1).with.path,'.runtime/evidence/real-gateway-smoke-${{ github.run_id }}-${{ github.run_attempt }}.json');
 assert.equal(w.jobs.notify.permissions.issues,'write');assert.match(w.jobs.notify.if,/REAL_GATEWAY_SMOKE_REPORT_FAILURE == 'true'/);assert.equal(JSON.stringify(w.jobs.notify).includes('SEEDANCE_API_KEY'),false);
});

test('C71: failure issue text uses validated counts and never gateway error fields',()=>{
 const identity={commit,runId:'123',attempt:'1'},receipt={schemaVersion:1,mode:'ci',repository:repo,commit,runId:'123-1',policy:'default-flash-single-512-v1',provider:'seedance',model:SMOKE_MODEL,maxTokens:512,sourceDirty:false,outcome:'failed',code:'AUTH',requests:1,httpStatus:401,error:key};
 const plan=failureIssuePlan(receipt,identity);assert.equal(JSON.stringify(plan).includes(key),false);assert.ok(plan.body.includes('Dispatched requests: 1'));assert.ok(plan.body.includes('/actions/runs/123'));
 for(const patch of [{commit:'2'.repeat(40)},{mode:'local'},{sourceDirty:true},{outcome:'passed'},{code:key},{requests:2}])assert.throws(()=>failureIssuePlan({...receipt,...patch},identity));
 const unknown=failureIssuePlan(undefined,identity);assert.ok(unknown.body.includes('Gateway acceptance is unknown'));assert.ok(unknown.body.includes('requests: unknown'));
});

test('C71: issue deduplication and notification authority fail closed',()=>{
 const plan=failureIssuePlan(undefined,{commit,runId:'123',attempt:'1'});
 assert.equal(existingFailureIssue([{title:plan.title,state:'open',number:7}],plan),7);assert.equal(existingFailureIssue([],plan),undefined);assert.throws(()=>existingFailureIssue(Array.from({length:100},()=>({title:'EXAMPLE_OTHER',state:'open'})),plan));
 const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:repo,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'schedule',DSH_SMOKE_REPORT_FAILURE:'true',GITHUB_SHA:commit,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'};
 assert.deepEqual(notificationIdentity(env),{commit,runId:'123',attempt:'1'});assert.throws(()=>notificationIdentity({...env,DSH_SMOKE_REPORT_FAILURE:'false'}));assert.throws(()=>notificationIdentity({...env,GITHUB_REPOSITORY:'EXAMPLE_FORK/EXAMPLE_REPO'}));assert.throws(()=>notificationIdentity({...env,GITHUB_RUN_ID:'../EXAMPLE_OTHER'}));
});
