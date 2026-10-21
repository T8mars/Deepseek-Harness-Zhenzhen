import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {Context} from '@deepseek-ai/cordis';
import Typert from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import Zhen from '../packages/dsh-zhen/lib/index.js';
import {TYPERT} from '../packages/dsh-zhen/lib/typert.js';
import {TYPERT_REMOTE} from '../packages/dsh-zhen/lib/remote.js';
import {canvasWorkflowFixture} from './fixtures/canvas-workflow.mjs';
const ready={known:true,installed:true,credentialReady:true,regionReady:true,available:true,executable:true,requiresRuntimeCheck:true,blockers:[]};
const model=kind=>({id:`${kind}:EXAMPLE_PROVIDER:EXAMPLE_${kind}_MODEL`,kind,provider:'EXAMPLE_PROVIDER',model:`EXAMPLE_${kind}_MODEL`,readiness:{...ready},parameters:{EXAMPLE_PRIVATE:'EXAMPLE_HIDDEN'},apiKey:'EXAMPLE_HIDDEN'});
const scope={projectId:'EXAMPLE_PROJECT',canvasId:'EXAMPLE_CANVAS'};

test('C49: published owner Gateway/Remote preserves native audio/model/output choice and independent structural approval with no Agent mutation',async()=>{
 const f=await canvasWorkflowFixture(),home=process.env.DSH_HOME,ctx=new Context(),life=new AbortController();process.env.DSH_HOME=join(f.base,'EXAMPLE_MODEL_HOST');let secrets=0;ctx.provide('credentials',{describe:async()=>({configured:false,writable:true}),resolve:async()=>{secrets++;throw Error('EXAMPLE_NO_SECRET');}});f.flowState.modelItems=[model('audio'),model('video')];
 try{
  await ctx.plugin(Typert);await ctx.plugin(Access);await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(Zhen);ctx.typert.register(TYPERT);await ctx.plugin(Gateway,{});const peer={id:'EXAMPLE_MODEL_OWNER',ctx,principal:{kind:'owner'},signal:life.signal,interactions:'none',dispose:async()=>{}};
  const call=async(method,args,principal=peer.principal)=>{const value=await ctx.typertGateway.invoke({namespace:'zhen',method,args:JSON.parse(JSON.stringify(args)),peer:{...peer,principal}});return TYPERT_REMOTE.methods['zhen/'+method].result.create().parse(value===undefined?undefined:JSON.parse(JSON.stringify(value)));};
  const config=f.config();await ctx.zhen.connectCanvas(config.root,'',config.digest);
  const query={...scope,kind:'audio'},catalog=await call('canvasWorkflowModels',{input:query});assert.equal(catalog.items.length,1);assert.equal(catalog.items[0].executable,true);assert.equal(catalog.items[0].requiresRuntimeCheck,true);assert.equal(JSON.stringify(catalog).includes('EXAMPLE_HIDDEN'),false);await assert.rejects(call('canvasWorkflowModels',{input:query},{kind:'anonymous'}));
  const plan=await call('canvasWorkflowPreview',{input:{...scope,kind:'audio',prompt:'EXAMPLE ONLY music concept',profile:'quality',candidates:2,modelChoices:{audio:{provider:'EXAMPLE_PROVIDER',model:'EXAMPLE_audio_MODEL'}}}});assert.equal(plan.candidates,2);assert.ok(plan.models.includes('EXAMPLE_PROVIDER / EXAMPLE_audio_MODEL'));assert.equal(plan.output.profile,'quality');assert.equal(f.flowState.lastInput.audioModel,'EXAMPLE_audio_MODEL');assert.equal(f.flowState.modelReads,2);
  await assert.rejects(call('canvasWorkflowApprove',{id:plan.id,confirmation:false}));assert.equal(f.flowState.requests,0);const pending=await call('canvasWorkflowApprove',{id:plan.id,confirmation:true});assert.equal(pending.phase,'pending');assert.equal((await call('canvasWorkflowComplete',{id:plan.id})).phase,'pending');assert.equal(f.flowState.mutations,0);f.windowApprove();assert.equal((await call('canvasWorkflowComplete',{id:plan.id})).phase,'applied');assert.equal(f.flowState.mutations,1);
  const tools=ctx.tools.schemas().filter(tool=>tool.name.startsWith('mcp__t8canvas__'));assert.equal(tools.length, 11);assert.ok(tools.every(tool=>!/apply|approve|execute|pair/.test(tool.name)));assert.equal(secrets,0);assert.ok(f.state.requests.every(request=>!/settings\/raw|run-start|run-retry|provider/.test(request.path)));
 }finally{life.abort();await ctx.fiber.dispose();if(home===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=home;await f.dispose();}
});

test('C49: new model readiness, late connection drift and silent native model/parameter substitution refuse before approval',async t=>{
 const f=await canvasWorkflowFixture();t.after(()=>f.dispose());f.flowState.modelItems=[model('video')];const input={...scope,kind:'video',prompt:'EXAMPLE ONLY video concept',profile:'balanced',candidates:3,ratio:'16:9',duration:8,modelChoices:{video:{provider:'EXAMPLE_PROVIDER',model:'EXAMPLE_video_MODEL'}}};
 const page=await f.workflow.models({...scope,kind:'video'});assert.equal(page.items[0].executable,true);f.flowState.modelItems[0].readiness={...ready,executable:false,blockers:[{code:'EXAMPLE_REVOKED'}]};await assert.rejects(f.workflow.preview(input),error=>error.code==='WORKFLOW_MODEL_UNAVAILABLE');assert.equal(f.flowState.plans,0);
 f.flowState.modelItems[0].readiness={...ready};for(const alter of [plan=>{plan.visibleAssumptions.models.video.model='EXAMPLE_DIFFERENT';},plan=>{plan.visibleAssumptions.ratio='9:16';},plan=>{plan.visibleAssumptions.durationSec=9;},plan=>{plan.brief.profile='economy';},plan=>{plan.candidateCount=1;}]){f.flowState.afterPlan=alter;await assert.rejects(f.workflow.preview(input),error=>error.code==='WORKFLOW_MODEL_MISMATCH');assert.equal(f.workflow.snapshot(),null);}
 f.flowState.afterPlan=undefined;const accepted=await f.workflow.preview(input);assert.equal(accepted.output.ratio,'16:9');assert.equal(accepted.output.durationSeconds,8);assert.equal(accepted.candidates,3);const previous=f.config();f.flowState.afterModels=()=>f.changeConfig(undefined);await assert.rejects(f.workflow.models({...scope,kind:'video'}),error=>error.code==='WORKFLOW_CONNECTION_CHANGED');f.changeConfig(previous);assert.equal(f.flowState.requests,0);assert.equal(f.flowState.mutations,0);
});
