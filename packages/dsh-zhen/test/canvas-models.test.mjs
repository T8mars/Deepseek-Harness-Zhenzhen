import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasModelsView} from '../lib/canvas-models.js';
import {canvasWorkflowInput} from '../lib/canvas-workflow-schema.js';
const scope={projectId:'EXAMPLE_PROJECT',canvasId:'EXAMPLE_CANVAS',kind:'audio'},ready={known:true,installed:true,credentialReady:true,regionReady:true,available:true,executable:true,requiresRuntimeCheck:true,blockers:[]},item={id:'audio:EXAMPLE_PROVIDER:EXAMPLE_MODEL',kind:'audio',provider:'EXAMPLE_PROVIDER',model:'EXAMPLE_MODEL',readiness:ready};
test('native executable=true can retain requiresRuntimeCheck=true; projection removes settings and arbitrary parameters',()=>{
 const result=canvasModelsView(scope,{items:[{...item,parameters:{EXAMPLE_PRIVATE_FIELD:'EXAMPLE_HIDDEN'},apiKey:'EXAMPLE_HIDDEN'}],total:1,settings:'EXAMPLE_HIDDEN'});assert.equal(result.items[0].executable,true);assert.equal(result.items[0].requiresRuntimeCheck,true);assert.equal(JSON.stringify(result).includes('EXAMPLE_HIDDEN'),false);assert.equal(result.truncated,false);
});
test('unknown, nullable or contradictory native readiness stays visible but cannot be selected as executable',()=>{
 for(const readiness of [undefined,{...ready,installed:null,credentialReady:null,executable:false},{...ready,credentialReady:false},{...ready,blockers:[{code:'EXAMPLE_BLOCKED',message:'EXAMPLE_HIDDEN'}]},{...ready,known:false}]){const value=canvasModelsView(scope,{items:[{...item,readiness}],total:2});assert.equal(value.items[0].executable,false);assert.equal(value.truncated,true);assert.equal(JSON.stringify(value).includes('EXAMPLE_HIDDEN'),false);}
});
test('duplicate, wrong-kind, oversize or inconsistent model catalogs are rejected',()=>{
 for(const value of [{items:[item,item],total:2},{items:[{...item,kind:'image'}],total:1},{items:[item],total:0},{items:Array.from({length:501},(_,i)=>({...item,id:'EXAMPLE_'+i})),total:501}])assert.throws(()=>canvasModelsView(scope,value),error=>error.code==='WORKFLOW_MODELS_INVALID');
});
test('legacy workflow inputs retain their shape and explicit choices/output settings are strictly bound to creative kind',()=>{
 const legacy={projectId:scope.projectId,canvasId:scope.canvasId,kind:'image',prompt:'EXAMPLE goal'};assert.deepEqual(canvasWorkflowInput.parse(legacy),legacy);
 assert.equal(canvasWorkflowInput.safeParse({...legacy,kind:'audio',modelChoices:{audio:{provider:'EXAMPLE_PROVIDER',model:'EXAMPLE_MODEL'}},candidates:8,profile:'quality'}).success,true);
 for(const input of [{...legacy,modelChoices:{audio:{provider:'EXAMPLE_PROVIDER',model:'EXAMPLE_MODEL'}}},{...legacy,kind:'audio',ratio:'16:9'},{...legacy,kind:'script',duration:8},{...legacy,candidates:9},{...legacy,kind:'video',duration:0},{...legacy,modelChoices:{image:{provider:'EXAMPLE_PROVIDER',model:'EXAMPLE_MODEL',token:'EXAMPLE_HIDDEN'}}}])assert.equal(canvasWorkflowInput.safeParse(input).success,false);
});
