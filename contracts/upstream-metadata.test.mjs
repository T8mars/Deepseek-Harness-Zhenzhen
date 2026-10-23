import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
import {createUpstreamMetadataFetcher} from '../scripts/upstream-metadata.mjs';
import {releaseCommit,upgradeGuides} from '../scripts/upstream-inspect.mjs';

const base='https://api.github.com/repos/deepseek-ai/deepseek-harness';
const token='EXAMPLE_ONLY_READ_TOKEN';

test('C192: upstream metadata credentials reach only exact public upstream Git object reads, never registry requests',async()=>{
  const requests=[],fetcher=createUpstreamMetadataFetcher({token,fetcher:async(url,init)=>{requests.push({url,init});return Response.json({});}});
  const signal=new AbortController().signal;
  await fetcher(base+'/git/ref/tags/dsh-v0.2.1-rc.3',{signal,headers:{Accept:'application/json','User-Agent':'EXAMPLE_ONLY','aUtHoRiZaTiOn':'EXAMPLE_ONLY_WRONG','Cookie':'EXAMPLE_ONLY_COOKIE'}});
  await fetcher('https://registry.npmjs.org/@deepseek-ai%2Fdsh/next',{signal,headers:{Authorization:'EXAMPLE_ONLY_WRONG'}});
  assert.equal(requests.length,2);
  const git=new Headers(requests[0].init.headers),npm=new Headers(requests[1].init.headers);
  assert.equal(git.get('Authorization'),'Bearer '+token);assert.equal(git.get('Cookie'),null);
  assert.equal(npm.get('Authorization'),null);assert.equal(npm.get('Cookie'),null);
  for(const {init}of requests){assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.signal,signal);assert.equal(init.body,undefined);}
  let anonymous;
  await createUpstreamMetadataFetcher({fetcher:async(_url,init)=>{anonymous=init;return Response.json({});}})(base+'/git/trees/'+'a'.repeat(40));
  assert.equal(new Headers(anonymous.headers).get('Authorization'),null);
});

test('C192: credential routing rejects other repositories, mutable endpoints, URL credentials, queries and write requests before fetch',async()=>{
  let calls=0;const fetcher=createUpstreamMetadataFetcher({token,fetcher:async()=>{calls++;return Response.json({});}});
  for(const url of [
    'https://api.github.com/repos/T8mars/Deepseek-Harness-Zhenzhen/git/trees/'+'a'.repeat(40),
    base+'/contents/package.json',base+'/git/ref/heads/main',base+'/git/trees/main',
    base+'/git/trees/'+'a'.repeat(40)+'?recursive=1&EXAMPLE=1',base+'/git/tags/'+'a'.repeat(40)+'#EXAMPLE',
    'https://EXAMPLE_ONLY@api.github.com/repos/deepseek-ai/deepseek-harness/git/trees/'+'a'.repeat(40),
    'https://api.github.com:8443/repos/deepseek-ai/deepseek-harness/git/trees/'+'a'.repeat(40),
    'https://example.invalid/EXAMPLE_ONLY','https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/main/EXAMPLE_ONLY',
  ])await assert.rejects(fetcher(url),/metadata request refused/i);
  await assert.rejects(fetcher(base+'/git/tags/'+'a'.repeat(40),{method:'POST',body:'EXAMPLE_ONLY'}),/metadata request refused/i);
  assert.equal(calls,0);
});

test('C192: metadata refusals report safe endpoint and HTTP status, cancel bodies and never retry or expose provider diagnostics',async()=>{
  let calls=0,cancelled=0;
  const fetcher=createUpstreamMetadataFetcher({token,fetcher:async()=>{calls++;return new Response(new ReadableStream({cancel(){cancelled++;}}),{status:403});}});
  await assert.rejects(fetcher(base+'/git/ref/tags/dsh-v0.2.1-rc.3'),error=>{
    assert.match(error.message,/GitHub tag.*403/);assert.ok(!error.message.includes(token));assert.ok(!error.message.includes('https:'));return true;
  });assert.equal(calls,1);assert.equal(cancelled,1);
  const network=createUpstreamMetadataFetcher({token,fetcher:async()=>{calls++;throw Error('EXAMPLE_ONLY_NETWORK '+token);}});
  await assert.rejects(network(base+'/git/trees/'+'a'.repeat(40)),error=>{assert.match(error.message,/GitHub tree.*unavailable/);assert.ok(!error.message.includes(token));assert.ok(!error.message.includes('NETWORK'));return true;});
  assert.equal(calls,2);
  const aborted=new AbortController();aborted.abort();await assert.rejects(network(base+'/git/trees/'+'a'.repeat(40),{signal:aborted.signal}),{name:'AbortError'});assert.equal(calls,2);
});

test('C192: actual tag and bounded guide inspection retain exact identities through the scoped transport; workflow gives only prepare the read token',async()=>{
  const commit='a'.repeat(40),tag='b'.repeat(40),docs='c'.repeat(40),folder='d'.repeat(40),blob='e'.repeat(40),requests=[];
  const fetcher=createUpstreamMetadataFetcher({token,fetcher:async(url,init)=>{
    requests.push(url);assert.equal(new Headers(init.headers).get('Authorization'),'Bearer '+token);
    if(url.endsWith('/git/ref/tags/dsh-v0.2.1-rc.3'))return Response.json({ref:'refs/tags/dsh-v0.2.1-rc.3',object:{type:'tag',sha:tag}});
    if(url.endsWith('/git/tags/'+tag))return Response.json({object:{type:'commit',sha:commit}});
    if(url.endsWith('/git/trees/'+commit))return Response.json({truncated:false,tree:[{path:'docs',type:'tree',sha:docs}]});
    if(url.endsWith('/git/trees/'+docs))return Response.json({truncated:false,tree:[{path:'upgrade-guide',type:'tree',sha:folder}]});
    assert.equal(url,base+'/git/trees/'+folder+'?recursive=1');return Response.json({truncated:false,tree:[{path:'v0.2.1/EXAMPLE_ONLY/guide.md',type:'blob',sha:blob}]});
  }});
  assert.equal(await releaseCommit('0.2.1-rc.3',fetcher),commit);
  assert.deepEqual(await upgradeGuides(commit,fetcher),[{path:'docs/upgrade-guide/v0.2.1/EXAMPLE_ONLY/guide.md',sha:blob}]);assert.equal(requests.length,5);
  const workflow=parse(readFileSync('.github/workflows/upstream-watch.yml','utf8'));
  assert.deepEqual(workflow.on.schedule,[{cron:'17 2,8,14,20 * * *'}]);assert.deepEqual(workflow.jobs.prepare.permissions,{contents:'read'});
  const steps=workflow.jobs.prepare.steps,prepare=steps.find(row=>row.id==='prepare');
  assert.equal(prepare.env.UPSTREAM_METADATA_TOKEN,'${{ github.token }}');
  assert.equal(steps.filter(row=>row.env?.UPSTREAM_METADATA_TOKEN!==undefined).length,1);
  assert.equal(workflow.env?.UPSTREAM_METADATA_TOKEN,undefined);assert.equal(workflow.jobs.prepare.env?.UPSTREAM_METADATA_TOKEN,undefined);
  assert.equal(workflow.jobs.publish.steps.some(row=>/pr (review|merge)/.test(row.run??'')),false);
  const script=readFileSync('scripts/prepare-upstream.mjs','utf8');assert.match(script,/createUpstreamMetadataFetcher\(\{token:process\.env\.UPSTREAM_METADATA_TOKEN\}\)/);
  console.log(JSON.stringify({contract:'C192',exactPublicUpstreamCredentialBoundary:true,registryCredentialFree:true,safeHttpDiagnosis:true,noAutomaticRetry:true,annotatedTagAndGuideIdentityRetained:true,onlyReadonlyPrepareStepToken:true,sixHourCandidateCadence:true}));
});
