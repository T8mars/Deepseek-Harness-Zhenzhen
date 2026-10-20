import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,realpathSync,rmSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {updateSource,setSourceAutomatic,sourceUpdateSettings,SOURCE_REPOSITORY,SourceUpdateError} from '../../../scripts/source-update.mjs';
import {sourceAwareStart} from '../../../scripts/source-start.mjs';
import {sourceUpdateCommand} from '../../../scripts/update-local.mjs';

const run=(root,args)=>execFileSync('git',['-C',root,'-c','user.name=EXAMPLE_USER','-c','user.email=EXAMPLE@example.invalid','-c','core.autocrlf=false',...args],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:15000});
function fixture(t){
  const home=realpathSync.native(mkdtempSync(join(realpathSync.native(tmpdir()),'dsh-source-update-EXAMPLE-'))),publisher=join(home,'publisher'),root=join(home,'checkout');mkdirSync(publisher);
  run(publisher,['init','-b','main']);writeFileSync(join(publisher,'package.json'),JSON.stringify({name:'dsh-zhen-workspace'}));writeFileSync(join(publisher,'meta.json'),JSON.stringify({name:'DSH-zhen',repository:SOURCE_REPOSITORY}));writeFileSync(join(publisher,'.gitignore'),'.runtime/\nlocal-art/\n');writeFileSync(join(publisher,'EXAMPLE.txt'),'EXAMPLE_BEFORE');run(publisher,['add','.']);run(publisher,['commit','-m','EXAMPLE baseline']);run(home,['clone','--no-local',publisher,root]);run(root,['remote','set-url','origin',SOURCE_REPOSITORY+'.git']);
  const before=run(root,['rev-parse','HEAD']).trim(),calls=[];
  const transport=async argv=>{calls.push(argv);const args=[...argv],fetch=args.indexOf('fetch');if(fetch>=0){const origin=args.indexOf('origin',fetch+1);assert.ok(origin>fetch);args[origin]=publisher;}return promisify(execFile)('git',['-C',root,...args],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:16*1024*1024});};
  const advance=(files={'EXAMPLE.txt':'EXAMPLE_AFTER'})=>{for(const [path,body]of Object.entries(files)){mkdirSync(join(publisher,path,'..'),{recursive:true});writeFileSync(join(publisher,path),body);}run(publisher,['add','.']);run(publisher,['commit','-m','EXAMPLE next']);return run(publisher,['rev-parse','HEAD']).trim();};
  const options={root,port:0,gitRunner:transport};
  t.after(()=>{const part=relative(realpathSync.native(tmpdir()),home);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\'));rmSync(home,{recursive:true,force:true});});
  return {home,publisher,root,before,calls,advance,options};
}
const rejects=(promise,code)=>assert.rejects(promise,error=>error instanceof SourceUpdateError&&error.code===code);

test('source update previews then fast-forwards genuine Git objects, retaining private local data, old revision and suppressing hooks',async t=>{
  const f=fixture(t),tip=f.advance();mkdirSync(join(f.root,'.runtime/dsh-home'),{recursive:true});writeFileSync(join(f.root,'.runtime/dsh-home/EXAMPLE_DATA'),'EXAMPLE_PRIVATE_DATA');
  const names=['roadmap.md','skill.md','AGENTS.md','anents.md'];writeFileSync(join(f.root,'.git/info/exclude'),names.join('\n')+'\n');for(const name of names)writeFileSync(join(f.root,name),'EXAMPLE_LOCAL_ONLY');
  const hooks=join(f.home,'hooks');mkdirSync(hooks);writeFileSync(join(hooks,'post-merge'),'#!/bin/sh\nprintf EXAMPLE_HOOK_RAN > .runtime/EXAMPLE_HOOK_RAN\n',{mode:0o755});run(f.root,['config','core.hooksPath',hooks]);
  const plan=await updateSource(f.options);assert.equal(plan.state,'available');assert.equal(plan.candidate,tip);assert.equal(run(f.root,['rev-parse','HEAD']).trim(),f.before);assert.equal(readFileSync(join(f.root,'EXAMPLE.txt'),'utf8'),'EXAMPLE_BEFORE');
  const result=await updateSource({...f.options,mode:'apply',expected:tip});assert.equal(result.applied,true);assert.equal(run(f.root,['rev-parse','HEAD']).trim(),tip);assert.equal(readFileSync(join(f.root,'EXAMPLE.txt'),'utf8'),'EXAMPLE_AFTER');assert.equal(sourceUpdateSettings(f.root).previous,f.before);run(f.root,['cat-file','-e',f.before]);
  for(const name of names)assert.equal(readFileSync(join(f.root,name),'utf8'),'EXAMPLE_LOCAL_ONLY');assert.equal(readFileSync(join(f.root,'.runtime/dsh-home/EXAMPLE_DATA'),'utf8'),'EXAMPLE_PRIVATE_DATA');assert.equal(existsSync(join(f.root,'.runtime/EXAMPLE_HOOK_RAN')),false);assert.equal(existsSync(join(f.root,'.runtime/launch-lock.json')),false);
  assert.equal((await updateSource(f.options)).state,'current');assert.ok(f.calls.some(args=>args.includes('--no-overwrite-ignore')));
});

test('source update refuses dirty, staged, untracked and hidden-index changes before fetching',async t=>{
  for(const kind of ['dirty','staged','untracked','assume-unchanged','skip-worktree'])await t.test(kind,async t=>{
    const f=fixture(t);f.advance();
    if(kind==='assume-unchanged'||kind==='skip-worktree')run(f.root,['update-index','--'+kind,'EXAMPLE.txt']);
    writeFileSync(join(f.root,kind==='untracked'?'EXAMPLE_NEW.txt':'EXAMPLE.txt'),'EXAMPLE_PERSONAL_EDIT');if(kind==='staged')run(f.root,['add','EXAMPLE.txt']);
    await rejects(updateSource({...f.options,mode:'apply',expected:f.before}),'LOCAL_CHANGES');assert.equal(f.calls.some(args=>args.includes('fetch')),false);assert.equal(run(f.root,['rev-parse','HEAD']).trim(),f.before);assert.equal(readFileSync(join(f.root,kind==='untracked'?'EXAMPLE_NEW.txt':'EXAMPLE.txt'),'utf8'),'EXAMPLE_PERSONAL_EDIT');
  });
});

test('source update rejects wrong origins, detached state, divergence and changed reviewed candidates',async t=>{
  await t.test('origin',async t=>{const f=fixture(t);run(f.root,['remote','set-url','origin','https://example.invalid/EXAMPLE_REPO']);await rejects(updateSource(f.options),'ORIGIN');assert.equal(f.calls.some(args=>args.includes('fetch')),false);});
  await t.test('detached',async t=>{const f=fixture(t);run(f.root,['checkout','--detach']);await rejects(updateSource(f.options),'BRANCH');});
  await t.test('diverged',async t=>{const f=fixture(t);f.advance();writeFileSync(join(f.root,'EXAMPLE_LOCAL.txt'),'EXAMPLE_LOCAL_COMMIT');run(f.root,['add','.']);run(f.root,['commit','-m','EXAMPLE local']);const previous=run(f.root,['rev-parse','HEAD']).trim();await rejects(updateSource(f.options),'DIVERGED');assert.equal(run(f.root,['rev-parse','HEAD']).trim(),previous);});
  await t.test('changed candidate',async t=>{const f=fixture(t),old=f.advance();f.advance({'EXAMPLE.txt':'EXAMPLE_CHANGED_AGAIN'});await rejects(updateSource({...f.options,mode:'apply',expected:old}),'CHANGED_CANDIDATE');assert.equal(run(f.root,['rev-parse','HEAD']).trim(),f.before);});
});

test('source update checks intermediate trees for fake local-only files and rejects symlink trees',async t=>{
  await t.test('private intermediate',async t=>{const f=fixture(t);f.advance({'AnEnTs.Md':'EXAMPLE_FAKE_GUARD_FIXTURE_ONLY'});run(f.publisher,['rm','AnEnTs.Md']);run(f.publisher,['commit','-m','EXAMPLE remove fake private path']);await rejects(updateSource(f.options),'PRIVATE_HISTORY');assert.equal(run(f.root,['rev-parse','HEAD']).trim(),f.before);assert.equal(existsSync(join(f.root,'AnEnTs.Md')),false);assert.equal(run(f.root,['for-each-ref','--format=%(refname)','refs/dsh-zhen/source-update']).trim(),'');assert.equal(run(f.root,['rev-parse','origin/main']).trim(),f.before);});
  await t.test('link mode',async t=>{const f=fixture(t);const blob=run(f.publisher,['hash-object','-w','EXAMPLE.txt']).trim();run(f.publisher,['update-index','--add','--cacheinfo','120000,'+blob+',EXAMPLE_LINK']);run(f.publisher,['commit','-m','EXAMPLE link fixture']);await rejects(updateSource(f.options),'TREE');});
});

test('source update never overwrites ignored artwork or retries a failed fast-forward',async t=>{
  const f=fixture(t);mkdirSync(join(f.root,'local-art'));writeFileSync(join(f.root,'local-art/EXAMPLE.txt'),'EXAMPLE_PERSONAL_ART');const tip=f.advance({'.gitignore':'.runtime/\n','local-art/EXAMPLE.txt':'EXAMPLE_INCOMING_ART'});
  await rejects(updateSource({...f.options,mode:'apply',expected:tip}),'APPLY_FAILED');assert.equal(run(f.root,['rev-parse','HEAD']).trim(),f.before);assert.equal(readFileSync(join(f.root,'local-art/EXAMPLE.txt'),'utf8'),'EXAMPLE_PERSONAL_ART');assert.equal(f.calls.filter(args=>args.includes('merge')&&args.includes('--ff-only')).length,1);assert.equal(existsSync(join(f.root,'.runtime/launch-lock.json')),false);
});

test('source update refuses a busy Host and checks origin again immediately before applying',async t=>{
  const f=fixture(t),tip=f.advance(),server=createServer();await new Promise(done=>server.listen(0,'127.0.0.1',done));
  try{await assert.rejects(updateSource({...f.options,port:server.address().port,mode:'apply',expected:tip}),/already in use/);assert.equal(f.calls.length,0);}finally{await new Promise(done=>server.close(done));}
  const original=f.options.gitRunner;let origins=0;const changed=async args=>{if(args.includes('get-url')&&++origins===2)run(f.root,['remote','set-url','origin','https://example.invalid/EXAMPLE_CHANGED']);return original(args);};
  await rejects(updateSource({...f.options,gitRunner:changed,mode:'apply',expected:tip}),'ORIGIN');assert.equal(run(f.root,['rev-parse','HEAD']).trim(),f.before);
});

test('source automatic policy defaults off, explicitly enables first-party main, checks daily and keeps local commits',async t=>{
  const f=fixture(t);let clock=Date.parse('2026-01-01T00:00:00Z');const options={...f.options,mode:'automatic',now:()=>clock};
  assert.equal((await updateSource(options)).state,'disabled');assert.equal(f.calls.length,0);setSourceAutomatic(f.root,true);const tip=f.advance();assert.equal((await updateSource(options)).candidate,tip);assert.equal(run(f.root,['rev-parse','HEAD']).trim(),tip);
  f.calls.length=0;assert.equal((await updateSource(options)).state,'not-due');assert.equal(f.calls.length,0);clock+=86400001;assert.equal((await updateSource(options)).state,'current');
  writeFileSync(join(f.root,'EXAMPLE_LOCAL.txt'),'EXAMPLE_LOCAL');run(f.root,['add','.']);run(f.root,['commit','-m','EXAMPLE local ahead']);clock+=86400001;assert.equal((await updateSource(options)).state,'local-ahead');setSourceAutomatic(f.root,false);assert.equal((await updateSource(options)).state,'disabled');
});

test('source fetch cancellation removes its temporary ref and lease and never continues into startup',async t=>{
  const f=fixture(t);f.advance();const controller=new AbortController(),original=f.options.gitRunner;
  const interrupted=async args=>{const result=await original(args);if(args.includes('fetch')){controller.abort();throw Object.assign(Error('EXAMPLE_ABORT'),{code:'ABORT_ERR'});}return result;};
  await rejects(updateSource({...f.options,signal:controller.signal,gitRunner:interrupted}),'GIT');assert.equal(run(f.root,['for-each-ref','--format=%(refname)','refs/dsh-zhen/source-update']).trim(),'');assert.equal(run(f.root,['rev-parse','HEAD']).trim(),f.before);assert.equal(existsSync(join(f.root,'.runtime/launch-lock.json')),false);
  const stopped=new AbortController();let starts=0;await assert.rejects(sourceAwareStart({root:f.root,flags:['--no-open'],signal:stopped.signal,start:async()=>{starts++;},update:async()=>{stopped.abort();return {applied:false};}}),/已取消/);assert.equal(starts,0);
});

test('source-aware startup uses a fresh process after update, strips only its own flag and stops on uncertain apply',async t=>{
  let starts=0,restarts=0,updates=0;const root=process.cwd(),base={root,flags:['--no-open'],start:async args=>{starts++;assert.deepEqual(args.flags,['--no-open']);},update:async()=>{updates++;return {applied:false};},restart:async(_root,flags)=>{restarts++;assert.deepEqual(flags,['--no-open']);}};
  await sourceAwareStart(base);assert.equal(starts,1);await sourceAwareStart({...base,update:async()=>({applied:true})});assert.equal(restarts,1);assert.equal(starts,1);
  await sourceAwareStart({...base,flags:['--skip-source-update','--no-open']});assert.equal(updates,1);assert.equal(starts,2);
  await sourceAwareStart({...base,update:async()=>{throw new SourceUpdateError('LOCAL_CHANGES','EXAMPLE local changes');}});assert.equal(starts,3);
  await assert.rejects(sourceAwareStart({...base,update:async()=>{throw new SourceUpdateError('APPLY_FAILED','EXAMPLE uncertain state');}}));assert.equal(starts,3);await assert.rejects(sourceAwareStart({...base,flags:['--EXAMPLE_UNKNOWN']}));
  const f=fixture(t);mkdirSync(join(f.root,'scripts'));writeFileSync(join(f.root,'scripts/start-local.mjs'),"import{writeFileSync}from'node:fs';writeFileSync('EXAMPLE_FRESH.json',JSON.stringify(process.argv.slice(2)));\n");
  await sourceAwareStart({root:f.root,flags:['--check','--no-open'],start:async()=>assert.fail('cached launcher ran'),update:async()=>({applied:true})});assert.deepEqual(JSON.parse(readFileSync(join(f.root,'EXAMPLE_FRESH.json'),'utf8')),['--skip-source-update','--check','--no-open']);
});

test('source update command reviews an exact candidate, cancels without applying and exposes an explicit automatic switch',async()=>{
  const candidate='a'.repeat(40),calls=[],messages=[],update=async options=>{calls.push(options);return {state:options.mode==='apply'?'updated':'available',current:'b'.repeat(40),candidate,changedFiles:1};};
  await sourceUpdateCommand(['--review'],{update,write:line=>messages.push(line),confirm:async()=>false});assert.equal(calls.length,1);
  await sourceUpdateCommand(['--review'],{update,write:()=>{},confirm:async()=>true});assert.equal(calls.at(-1).mode,'apply');assert.equal(calls.at(-1).expected,candidate);
  let enabled;await sourceUpdateCommand(['--automatic','on'],{configure:(_root,value)=>{enabled=value;},write:()=>{}});assert.equal(enabled,true);await assert.rejects(sourceUpdateCommand(['--force'],{update}));
});
