import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {guideChanges,profileFacts,profileChanges,pendingReviews,readCompatibility,upgradedManifests,compatibilitySource,canonicalVersion,newerVersion} from '../scripts/upstream-policy.mjs';
import {inspectUpgrade} from '../scripts/upstream-inspect.mjs';
import {validateProposal,collectProposal} from '../scripts/update-proposal.mjs';
import {SkillMarket,readBundledCatalog} from '../packages/dsh-zhen/lib/market.js';
import {proposalFixture,publication,integrity,OLD,NEXT} from './fixtures/upstream.mjs';

test('upstream package discovery fixes tag/commit and every required publication before preparing pins',async()=>{
  const fixture=proposalFixture();let mode='good';const requests=[];
  const fetcher=async(url,options)=>{
    requests.push(url);assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);
    if(url.includes('registry.npmjs.org')){
      const name=decodeURIComponent(new URL(url).pathname.slice(1).split('/')[0]);const data=publication(name);
      if(mode==='wrong-source'&&name.endsWith('dsh-tools'))data.repository.url='git+https://example.invalid/EXAMPLE_ONLY.git';
      if(mode==='wrong-override')data.dependencies['@deepseek-ai/cordis']='^999.0.0';
      return Response.json(data);
    }
    if(url.includes('/git/ref/tags/'))return Response.json({ref:`refs/tags/dsh-v${NEXT}`,object:{type:'commit',sha:fixture.target.commit}});
    if(url.includes('/git/trees/'+fixture.target.commit))return Response.json({truncated:false,tree:[{path:'docs',type:'tree',sha:'d'.repeat(40)}]});
    if(url.includes('/git/trees/'+'d'.repeat(40)))return Response.json({truncated:false,tree:[{path:'upgrade-guide',type:'tree',sha:'e'.repeat(40)}]});
    return Response.json({truncated:false,tree:[{path:`v${NEXT}/EXAMPLE_NEW/guide.md`,type:'blob',sha:'b'.repeat(40)}]});
  };
  const plan=await inspectUpgrade(fixture.root,fixture.plugin,fixture.lock,fixture.baseline,fetcher);
  assert.equal(plan.target.commit,fixture.target.commit);assert.equal(plan.packages.length,3);assert.equal(plan.guideChanges.length,2);
  assert.ok(requests.some(url=>url.endsWith('/next')));assert.ok(requests.every(url=>!url.endsWith('/latest')));
  await assert.rejects(inspectUpgrade(fixture.root,fixture.plugin,fixture.lock,fixture.baseline,fetcher,undefined,OLD),/changed identity/);
  mode='wrong-source';await assert.rejects(inspectUpgrade(fixture.root,fixture.plugin,fixture.lock,fixture.baseline,fetcher),/identity/);
  mode='wrong-override';await assert.rejects(inspectUpgrade(fixture.root,fixture.plugin,fixture.lock,fixture.baseline,fetcher),/override/);
  assert.equal(fixture.root.dependencies['@deepseek-ai/dsh'],OLD);
});

test('publisher version precedence rejects downgrades, malformed prereleases and equivalent versions without loading dependencies',()=>{
  const sequence=['1.0.0-alpha','1.0.0-alpha.1','1.0.0-alpha.beta','1.0.0-beta','1.0.0-beta.2','1.0.0-beta.11','1.0.0-rc.1','1.0.0','1.0.1','1.1.0','2.0.0'];
  for(let index=1;index<sequence.length;index++){assert.ok(newerVersion(sequence[index],sequence[index-1]));assert.equal(newerVersion(sequence[index-1],sequence[index]),false);assert.equal(newerVersion(sequence[index],sequence[index]),false);}
  for(const value of ['01.2.3','1.2.3-01','1.2.3-rc..1','1.2.3-.','1.2.3+EXAMPLE'])assert.equal(canonicalVersion(value),false);
  assert.ok(newerVersion('1.0.0-rc.9007199254740993','1.0.0-rc.9007199254740992'));
});

test('guide and profile changes remain blocked until reviews bind exact source hashes and target commit',()=>{
  const {plan,target}=proposalFixture();const required=pendingReviews(plan,[]);assert.equal(required.length,2);
  const acknowledgments=required.map(item=>({...item,targetCommit:target.commit,decision:'not-applicable',rationale:'EXAMPLE ONLY: isolated fixture confirms this does not affect the selected extension surface.'}));
  assert.deepEqual(pendingReviews(plan,acknowledgments),[]);
  assert.equal(pendingReviews({...plan,target:{...target,commit:'9'.repeat(40)}},acknowledgments).length,2);
  assert.equal(pendingReviews(plan,acknowledgments.map(item=>({...item,digest:'0'.repeat(40)}))).length,2);
  const changed=profileChanges([{id:'EXAMPLE_OLD',name:'example',keys:['config']}],[{id:'EXAMPLE_RENAMED',name:'example',keys:['config']}]);assert.equal(changed.length,2);assert.ok(changed.some(item=>item.kind==='removed'));
  assert.equal(guideChanges(plan.guides,[]).length,2);
  const oldFacts=profileFacts([{id:'EXAMPLE',config:{enabled:false,options:{second:2,first:1}}}]);
  const reordered=profileFacts([{id:'EXAMPLE',config:{options:{first:1,second:2},enabled:false}}]);
  assert.deepEqual(oldFacts,reordered);
  const changedValue=profileFacts([{id:'EXAMPLE',config:{enabled:true,options:{second:2,first:1}}}]);
  assert.deepEqual(oldFacts[0].keys,changedValue[0].keys);assert.equal(profileChanges(oldFacts,changedValue).length,1);
});

test('pure publisher permits only reviewed pin fields and rejects source edits, private files, lock origins and omitted drift',()=>{
  const {proposal,readBase}=proposalFixture();assert.equal(validateProposal(proposal,readBase).files.size,9);
  const mutate=(path,change)=>{const copy=structuredClone(proposal),file=copy.files.find(item=>item.path===path);file.content=JSON.stringify(change(JSON.parse(file.content)));return copy;};
  assert.throws(()=>validateProposal(mutate('package.json',value=>({...value,scripts:{test:'EXAMPLE_ONLY_UNTRUSTED_COMMAND'}})),readBase),/Only exact/);
  for(const path of ['skill.md','roadmap.md','AGENTS.md','anents.md','packages/dsh-zhen/src/index.ts']){const copy=structuredClone(proposal);copy.files.push({path,before:'',content:'EXAMPLE_ONLY'});assert.throws(()=>validateProposal(copy,readBase),/path|envelope/);}
  assert.throws(()=>validateProposal(mutate('package-lock.json',value=>{value.packages['node_modules/@deepseek-ai/dsh'].resolved='https://example.invalid/EXAMPLE_ONLY.tgz';return value;}),readBase),/integrity/);
  assert.throws(()=>validateProposal(mutate('package-lock.json',value=>{value.packages['node_modules/EXAMPLE_LINK']={link:true,resolved:'../../EXAMPLE_ONLY'};return value;}),readBase),/workspace link/);
  assert.throws(()=>validateProposal(mutate('UPSTREAM.prepared.json',value=>({...value,guideChanges:[]})),readBase),/omitted/);
  assert.throws(()=>validateProposal(proposal,path=>path==='package.json'?'EXAMPLE_ONLY_CHANGED_BASE':readBase(path)),/base changed/);
});

test('new instruction transport lineage preserves installed personal instructions without rewriting immutable skill releases',async()=>{
  const root=mkdtempSync(join(tmpdir(),'dsh-zhen-lineage-')),file=join(root,'skills.sqlite'),catalog=readBundledCatalog();
  let market=new SkillMarket(file,catalog);
  try{
    const item=catalog[0];market.select(item.manifest.id,item.manifest.digest,item.manifest.version);
    const personal=market.fork(item.manifest.id,item.manifest.digest,'# EXAMPLE ONLY personal workflow\n\nPreserve my custom creative instructions across the tested Host transition.',item.manifest.version);
    market.select(personal,market.list().find(item=>item.manifest.id===personal).manifest.digest);
    const before=market.versions(personal);market.close();market=undefined;
    const output=join(root,'candidate-market.mjs');
    await build({entryPoints:[resolve('packages/dsh-zhen/src/market.ts')],outfile:output,bundle:true,platform:'node',format:'esm',target:'node22',plugins:[{name:'EXAMPLE_ONLY_HOST_PIN',setup(builder){builder.onLoad({filter:/[\\/]compatibility\.ts$/},()=>({contents:compatibilitySource(NEXT,[OLD,NEXT]),loader:'ts'}));}}]});
    const upgraded=await import(pathToFileURL(output).href);market=new upgraded.SkillMarket(file,catalog);
    assert.deepEqual(market.versions(personal),before);
    const provider=market.provider(),options={signal:new AbortController().signal},candidate=(await provider.list(options)).find(item=>item.name===personal);
    assert.ok(candidate);assert.match((await provider.get(candidate,options)).content,/Preserve my custom creative instructions/);
    const next=upgradedManifests(proposalFixture().root,proposalFixture().plugin,proposalFixture().lock,{version:OLD,hosts:[OLD]},proposalFixture().target);
    assert.deepEqual(readCompatibility(next.compatibility).hosts,[OLD,NEXT]);
  }finally{market?.close();const absolute=realpathSync.native(root),rel=relative(realpathSync.native(tmpdir()),absolute);if(rel&&!isAbsolute(rel)&&!rel.startsWith('..')&&!rel.includes('/')&&!rel.includes('\\'))rmSync(absolute,{recursive:true,force:true});}
});

test('proposal collection uses an exact Git base and failed validation exports only discovery without staging research',()=>{
  const root=mkdtempSync(join(realpathSync.native(tmpdir()),'dsh-zhen-upgrade-publication-')),{base,proposal}=proposalFixture();
  const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const write=(path,text)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),text);};
  try{
    for(const [path,text]of base)write(path,text);write('.gitignore','.runtime/\n');
    git(['init']);git(['config','user.name','EXAMPLE_ONLY_TEST']);git(['config','user.email','example-only@example.invalid']);git(['add','--','.gitignore',...base.keys()]);git(['commit','-m','EXAMPLE_ONLY baseline']);
    for(const file of proposal.files)write(file.path,file.content);
    assert.equal(collectProposal(root,proposal.validation).files.length,9);
    const rootManifest=JSON.parse(proposal.files.find(item=>item.path==='package.json').content);rootManifest.scripts.test='EXAMPLE_ONLY_UNAPPROVED_SCRIPT';write('package.json',JSON.stringify(rootManifest));
    const fallback=collectProposal(root,proposal.validation);assert.deepEqual(fallback.files.map(file=>file.path),['UPSTREAM.candidate.json']);
    write('roadmap.md','EXAMPLE ONLY private-name fixture, no real research.');
    assert.throws(()=>collectProposal(root,proposal.validation),/Unexpected change/);
    assert.equal(git(['diff','--cached','--name-only']).trim(),'');
  }finally{const absolute=realpathSync.native(root),rel=relative(realpathSync.native(tmpdir()),absolute);if(rel&&!isAbsolute(rel)&&!rel.startsWith('..')&&!rel.includes('/')&&!rel.includes('\\'))rmSync(absolute,{recursive:true,force:true});}
});
