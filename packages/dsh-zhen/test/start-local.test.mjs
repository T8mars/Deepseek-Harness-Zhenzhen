import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,realpathSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {startLocal,checkNodeVersion} from '../../../scripts/start-local.mjs';
import {acquireRuntimeLease,assertRuntimeLease} from '../../../scripts/runtime-lifecycle.mjs';

function fixture(t) {
  const root=realpathSync.native(mkdtempSync(join(tmpdir(),'dsh-start-EXAMPLE-')));mkdirSync(join(root,'packages/dsh-zhen'),{recursive:true});
  writeFileSync(join(root,'package.json'),JSON.stringify({name:'dsh-zhen-workspace'}));writeFileSync(join(root,'package-lock.json'),JSON.stringify({name:'dsh-zhen-workspace',lockfileVersion:3}));writeFileSync(join(root,'packages/dsh-zhen/package.json'),JSON.stringify({name:'dsh-zhen'}));
  t.after(()=>{const rel=relative(realpathSync.native(tmpdir()),root);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));rmSync(root,{recursive:true,force:true});});
  const calls=[],fixturePackages=['@deepseek-ai/dsh/lib/bin.js','yaml/package.json','typescript/bin/tsc','esbuild/package.json','zod/package.json'];
  async function run(args) {calls.push(args);if(args[0]==='ci')for(const item of fixturePackages){const file=join(root,'node_modules',item);mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,'EXAMPLE fixture only');}}
  let launches=0;
  const loadLauncher=async()=>({launch:async(lease,flags)=>{launches++;await assertRuntimeLease(lease,join(root,'.runtime'),lease.port);assert.deepEqual(flags.filter(flag=>flag==='--repair'),[]);}});
  return {root,calls,run,loadLauncher,get launches(){return launches;}};
}
test('bootstrap checks Node minimum and refuses unknown CLI options or another project before preparation',async t=>{
  for(const version of ['22.19.0','22.20.1','24.0.0'])assert.doesNotThrow(()=>checkNodeVersion(version));
  for(const version of ['20.19.0','22.18.9','EXAMPLE_VERSION'])assert.throws(()=>checkNodeVersion(version));
  const f=fixture(t);await assert.rejects(startLocal({...f,port:0,flags:['--EXAMPLE_UNKNOWN'],handleSignals:false}));assert.equal(existsSync(join(f.root,'.runtime')),false);
  writeFileSync(join(f.root,'package.json'),JSON.stringify({name:'EXAMPLE_OTHER_PROJECT'}));await assert.rejects(startLocal({...f,port:0,flags:[],handleSignals:false}));assert.deepEqual(f.calls,[]);
});
test('fresh setup installs without lifecycle scripts, caches dependency identity and passes its still-reserved lease',async t=>{
  const f=fixture(t),cwd=process.cwd(),options={root:f.root,run:f.run,loadLauncher:f.loadLauncher,port:0,flags:['--check','--no-open'],handleSignals:false};
  await startLocal(options);assert.deepEqual(f.calls,[['ci','--ignore-scripts','--no-audit','--no-fund'],['run','build'],['run','typecheck:clean'],['run','pack:bundle']]);assert.equal(f.launches,1);assert.equal(process.cwd(),cwd);assert.equal(existsSync(join(f.root,'.runtime/launch-lock.json')),false);
  f.calls.length=0;writeFileSync(join(f.root,'package.json'),JSON.stringify({name:'dsh-zhen-workspace',scripts:{EXAMPLE_ONLY:'EXAMPLE_COMMAND'}}));await startLocal(options);assert.deepEqual(f.calls,[['run','build'],['run','typecheck:clean'],['run','pack:bundle']]);
  f.calls.length=0;await startLocal({...options,flags:['--check','--repair']});assert.equal(f.calls[0][0],'ci');
  f.calls.length=0;writeFileSync(join(f.root,'package-lock.json'),JSON.stringify({name:'dsh-zhen-workspace',lockfileVersion:3,EXAMPLE_CHANGED:true}));await startLocal(options);assert.equal(f.calls[0][0],'ci');
});
test('a busy port prevents dependency replacement and creates no runtime state',async t=>{
  const f=fixture(t),server=createServer();await new Promise(done=>server.listen(0,'127.0.0.1',done));
  try{await assert.rejects(startLocal({root:f.root,flags:[],port:server.address().port,run:f.run,loadLauncher:f.loadLauncher,handleSignals:false}),/already in use/);assert.deepEqual(f.calls,[]);assert.equal(f.launches,0);assert.equal(existsSync(join(f.root,'.runtime')),false);}finally{await new Promise(done=>server.close(done));}
});
test('failed setup or cancellation retains prior artifact and holds the lease until the active command settles',async t=>{
  const f=fixture(t);mkdirSync(join(f.root,'.runtime'));writeFileSync(join(f.root,'.runtime/package-artifact.json'),'EXAMPLE_PREVIOUS_ARTIFACT');const abort=new AbortController();let release,arrive;
  const started=new Promise(done=>arrive=done),pending=startLocal({root:f.root,flags:[],port:0,handleSignals:false,signal:abort.signal,run:async()=>{arrive();await new Promise(done=>release=done);},loadLauncher:f.loadLauncher});
  await started;abort.abort();assert.equal(existsSync(join(f.root,'.runtime/launch-lock.json')),true);release();await assert.rejects(pending,/已停止/);assert.equal(f.launches,0);assert.equal(existsSync(join(f.root,'.runtime/setup-state.json')),false);assert.equal(readFileSync(join(f.root,'.runtime/package-artifact.json'),'utf8'),'EXAMPLE_PREVIOUS_ARTIFACT');
  await assert.rejects(startLocal({root:f.root,flags:[],port:0,handleSignals:false,run:async()=>{throw Error('EXAMPLE_INSTALL_FAILED');},loadLauncher:f.loadLauncher}),/EXAMPLE_INSTALL_FAILED/);assert.equal(existsSync(join(f.root,'.runtime/launch-lock.json')),false);
});
test('a forged, transferred-to-another-directory or released lease cannot authorize startup',async t=>{
  const f=fixture(t),runtime=join(f.root,'.runtime'),lease=await acquireRuntimeLease(runtime,0);
  try {await assert.rejects(assertRuntimeLease({port:lease.port},runtime,lease.port));await assert.rejects(assertRuntimeLease(lease,join(f.root,'EXAMPLE_OTHER'),lease.port));await assertRuntimeLease(lease,runtime,lease.port);await lease.releasePort();await assert.rejects(assertRuntimeLease(lease,runtime,lease.port));}finally{await lease.release();}
});
