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
import {canvasReferencesFixture} from './fixtures/canvas-references.mjs';
const scope={projectId:'EXAMPLE_PROJECT',canvasId:'EXAMPLE_CANVAS'};
const keys=items=>items.map(item=>({assetId:item.id,contentRevision:item.contentRevision,contentHash:item.contentHash}));
test('C50: actual published owner Remote reads metadata and preserves ordered edit references through independent Native approval service',async()=>{
 const f=await canvasReferencesFixture(),home=process.env.DSH_HOME,ctx=new Context(),life=new AbortController();process.env.DSH_HOME=join(f.base,'EXAMPLE_REFERENCE_HOST');let secrets=0;ctx.provide('credentials',{describe:async()=>({configured:false,writable:true}),resolve:async()=>{secrets++;throw Error('EXAMPLE_NO_SECRET');}});
 try{await ctx.plugin(Typert);await ctx.plugin(Access);await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(Zhen);ctx.typert.register(TYPERT);await ctx.plugin(Gateway,{});const peer={id:'EXAMPLE_REFERENCE_OWNER',ctx,principal:{kind:'owner'},signal:life.signal,interactions:'none',dispose:async()=>{}};
  const call=async(method,args,principal=peer.principal)=>{const value=await ctx.typertGateway.invoke({namespace:'zhen',method,args:JSON.parse(JSON.stringify(args)),peer:{...peer,principal}});return TYPERT_REMOTE.methods['zhen/'+method].result.create().parse(JSON.parse(JSON.stringify(value)));};const config=f.config();await ctx.zhen.connectCanvas(config.root,'',config.digest);
  const query={...scope,kind:'image'},page=await call('canvasWorkflowAssets',{input:query});assert.equal(page.items.length,2);assert.equal(JSON.stringify(page).includes('EXAMPLE_HIDDEN'),false);await assert.rejects(call('canvasWorkflowAssets',{input:query},{kind:'anonymous'}));
  const ordered=[page.items[1],page.items[0]],view=await call('canvasWorkflowPreview',{input:{...scope,kind:'edit-image',prompt:'EXAMPLE ONLY edit lighting',references:keys(ordered)}});assert.deepEqual(view.references,ordered);assert.deepEqual(f.flowState.lastInput.assetIds,['EXAMPLE_REF_B','EXAMPLE_REF_A']);assert.equal('attachments' in f.flowState.lastInput,false);
  const pending=await call('canvasWorkflowApprove',{id:view.id,confirmation:true});assert.equal(pending.phase,'pending');assert.equal((await call('canvasWorkflowComplete',{id:view.id})).phase,'pending');assert.equal(f.flowState.mutations,0);f.windowApprove();assert.equal((await call('canvasWorkflowComplete',{id:view.id})).phase,'applied');assert.equal(f.flowState.mutations,1);assert.equal(secrets,0);assert.equal(ctx.tools.schemas().filter(tool=>tool.name.startsWith('mcp__t8canvas__')).length,10);assert.ok(f.state.requests.every(item=>!item.path.includes('/settings/raw')));
 }finally{life.abort();await ctx.fiber.dispose();if(home===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=home;await f.dispose();}
});
test('C50: missing, replaced, reordered or changed evidence cannot stage, request approval or apply',async t=>{
 const f=await canvasReferencesFixture();t.after(()=>f.dispose());const input={...scope,kind:'edit-image',prompt:'EXAMPLE ONLY edit',references:keys(f.refs.items)};
 for(const alter of [plan=>{delete plan.modelDecisionReceipt;},plan=>{plan.modelDecisionReceipt.schema='EXAMPLE_UNKNOWN';},plan=>{plan.modelDecisionReceipt.attachmentEvidenceDigest='0'.repeat(64);},plan=>{plan.brief.reuseAssetIds.reverse();},plan=>{plan.modelDecisionReceipt.providerCalls=1;}]){f.refs.alterPlan=alter;await assert.rejects(f.workflow.preview(input),error=>error.code==='WORKFLOW_REFERENCE_MISMATCH');assert.equal(f.workflow.snapshot(),null);}
 f.refs.alterPlan=plan=>{plan.modelDecisionReceipt.decisions[0].status='needs-configuration';};await assert.rejects(f.workflow.preview(input),error=>error.code==='WORKFLOW_MODEL_UNAVAILABLE');assert.equal(f.workflow.snapshot(),null);
 f.refs.alterPlan=()=>{f.refs.items[0].width++;};await assert.rejects(f.workflow.preview(input),error=>error.code==='WORKFLOW_REFERENCE_CHANGED');assert.equal(f.workflow.snapshot(),null);f.refs.items[0].width--;
 f.refs.alterPlan=undefined;const plan=await f.workflow.preview(input);f.refs.items[0].contentRevision++;await assert.rejects(f.workflow.approve(plan.id,true),error=>error.code==='WORKFLOW_REFERENCE_CHANGED');assert.equal(f.flowState.requests,0);f.refs.items[0].contentRevision--;
 await f.workflow.approve(plan.id,true);f.windowApprove();f.refs.items[0].contentHash='c'.repeat(64);await assert.rejects(f.workflow.complete(plan.id),error=>error.code==='WORKFLOW_REFERENCE_CHANGED');assert.equal(f.flowState.completes,0);assert.equal(f.flowState.mutations,0);
});
test('C50: late connection drift and unavailable reference refuse before planning',async t=>{
 const f=await canvasReferencesFixture();t.after(()=>f.dispose());const input={...scope,kind:'edit-image',prompt:'EXAMPLE ONLY edit',references:keys(f.refs.items)};f.refs.items[0].availability='missing';await assert.rejects(f.workflow.preview(input),error=>error.code==='WORKFLOW_REFERENCE_UNAVAILABLE');assert.equal(f.flowState.plans,0);f.refs.items[0].availability='available';f.refs.afterRead=()=>f.changeConfig(undefined);await assert.rejects(f.workflow.preview(input),error=>error.code==='WORKFLOW_CONNECTION_CHANGED');assert.equal(f.flowState.plans,0);
});
