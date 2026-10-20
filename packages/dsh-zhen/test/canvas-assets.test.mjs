import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasAssetView,canvasAssetsView,nativeAttachmentDigest} from '../lib/canvas-assets.js';
import {canvasWorkflowInput} from '../lib/canvas-workflow-schema.js';
import {referenceAssets,referenceVectors} from '../../../contracts/fixtures/canvas-references.mjs';
const scope={projectId:'EXAMPLE_PROJECT',canvasId:'EXAMPLE_CANVAS',kind:'image'},assets=referenceAssets.map(item=>canvasAssetView(scope.projectId,item));
test('C50: ordered attachment evidence agrees with independent original Native v1 vectors',()=>{
 for(const [items,digest] of [[[],referenceVectors.empty],[[assets[0]],referenceVectors.a],[assets,referenceVectors.ab],[[assets[1],assets[0]],referenceVectors.ba]])assert.equal(nativeAttachmentDigest(items),digest);
 assert.notEqual(nativeAttachmentDigest([{...assets[0],width:17}]),referenceVectors.a);
});
test('C50: asset metadata projection removes locators and refuses scope/type/pagination corruption',()=>{
 const page={...scope,canvasRevision:7,catalogRevision:3,offset:0,limit:25,total:2,items:referenceAssets.map(item=>({...item,managedPath:'EXAMPLE_HIDDEN',remoteUrl:'EXAMPLE_HIDDEN',metadata:{prompt:'EXAMPLE_HIDDEN'}}))};
 const value=canvasAssetsView(scope,page);assert.equal(value.items.length,2);assert.equal(value.nextOffset,null);assert.equal(JSON.stringify(value).includes('EXAMPLE_HIDDEN'),false);
 for(const bad of [{...page,canvasId:'EXAMPLE_OTHER'},{...page,total:1},{...page,items:[referenceAssets[0],referenceAssets[0]]},{...page,items:[{...referenceAssets[0],kind:'video'}]},{...page,items:[]}])assert.throws(()=>canvasAssetsView(scope,bad));
 assert.throws(()=>canvasAssetView('EXAMPLE_OTHER',referenceAssets[0]));assert.equal(canvasAssetView(scope.projectId,{...referenceAssets[0],availability:'missing'}).selectable,false);
 const persisted=canvasAssetView(scope.projectId,{...referenceAssets[0],sizeBytes:undefined,metadata:{size:68}});assert.equal(persisted.size,0);assert.equal(persisted.selectable,true);
});
test('C50: explicit editing references require unique ordered stable revisions and max sixteen assets',()=>{
 const references=assets.map(item=>({assetId:item.id,contentRevision:item.contentRevision,contentHash:item.contentHash})),input={...scope,kind:'edit-image',prompt:'EXAMPLE change light',references};assert.equal(canvasWorkflowInput.safeParse(input).success,true);
 for(const bad of [{...input,references:[]},{...input,references:[references[0],references[0]]},{...input,kind:'video'},{...input,kind:'script'},{...input,references:Array.from({length:17},(_,i)=>({...references[0],assetId:'EXAMPLE_'+i}))},{...input,references:[{...references[0],contentRevision:0}]},{...input,references:[{...references[0],url:'EXAMPLE_HIDDEN'}]}])assert.equal(canvasWorkflowInput.safeParse(bad).success,false);
 assert.equal(canvasWorkflowInput.safeParse({...input,kind:'edit-video'}).success,true);
 assert.equal(canvasWorkflowInput.safeParse({...input,modelChoices:{llm:{provider:'EXAMPLE_PROVIDER',model:'EXAMPLE_VISION'}}}).success,true);
});
