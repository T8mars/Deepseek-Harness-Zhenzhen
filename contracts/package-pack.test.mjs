import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, realpathSync, existsSync, copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve, relative, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {checkPackList} from '../scripts/check-private.mjs';
import {ownedTempCleanup,withOwnedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

test('C63: the actual pack command restores a legacy CRLF checkout to the full canonical archive without rewriting its inputs', {timeout: 120000}, async t => {
 const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
 const npm = [process.env.npm_execpath, resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')].find(path => path && existsSync(path));
 assert.ok(npm, 'Run through npm test to supply its CLI.');
 const base = realpathSync.native(tmpdir()), root = realpathSync.native(mkdtempSync(join(base, 'dsh-package-npm-EXAMPLE-')));
 const pkg = join(root, 'packages/dsh-zhen');
 let operation=0;
 const run = (tool, args, cwd = root, extra = {}) => {const started=performance.now(),step=++operation;try{return execFileSync(tool,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:16*1024*1024,...extra});}catch(error){t.diagnostic(JSON.stringify({contract:'C63_OPERATION_FAILURE',step,elapsedMs:Math.round(performance.now()-started),code:error.code??null,status:error.status??null,signal:error.signal??null}));throw error;}};
 const hash = bytes => createHash('sha256').update(bytes).digest('hex');
 await withOwnedTempCleanup(ownedTempCleanup(base,root,'dsh-package-npm-EXAMPLE-'),async()=>{
  const preview = JSON.parse(run(process.execPath, [npm, 'pack', './packages/dsh-zhen', '--ignore-scripts', '--offline', '--json', '--dry-run'], workspace).toString('utf8'))[0];
  checkPackList(preview.files);
  assert.ok(preview.files.length >= 100, 'Exercise the complete built bundle, not a minimal substitute package.');
  for (const file of preview.files) {
   assert.ok(file.path && !file.path.includes('\\') && !isAbsolute(file.path) && !file.path.split('/').some(part => !part || part === '.' || part === '..'));
   const target = join(pkg, file.path);
   mkdirSync(dirname(target), {recursive: true});
   let bytes = readFileSync(join(workspace, 'packages/dsh-zhen', file.path));
   if (file.path === 'LICENSE' || /\.(?:md|json|yml)$/.test(file.path)) bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
   writeFileSync(target, bytes);
   const declaration = /^lib\/(?:types|client-types)\/(.+)\.d\.ts$/.exec(file.path);
   if (declaration) {
    const source = ['.ts', '.tsx'].map(ext => 'packages/dsh-zhen/src/' + declaration[1] + ext).find(path => existsSync(join(workspace, path)));
    assert.ok(source, 'Retain actual sources for the ordinary declaration guard.');
    mkdirSync(dirname(join(root, source)), {recursive: true});
    copyFileSync(join(workspace, source), join(root, source));
   }
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify({name: 'example-packer-contract', version: '0.0.0', private: true, type: 'module'}));
  mkdirSync(join(root, 'scripts'));
  for (const file of ['pack.mjs', 'package-stage.mjs', 'package-policy.mjs', 'check-private.mjs', 'declaration-output.mjs']) copyFileSync(join(workspace, 'scripts', file), join(root, 'scripts', file));
  const archive = folder => {
   const output = join(root, folder);
   mkdirSync(output);
   const packed = JSON.parse(run(process.execPath, [npm, 'pack', pkg, '--ignore-scripts', '--offline', '--json', '--pack-destination', output]).toString('utf8'))[0];
   return readFileSync(join(output, packed.filename));
  };
  const reference = hash(archive('EXAMPLE_CANONICAL'));
  for (const path of ['LICENSE', 'cordis.patch.yml', 'skills/zhen-knowledge-writing/SKILL.md']) {
   const file = join(pkg, path), text = readFileSync(file, 'utf8');
   assert.ok(text.includes('\n'));
   writeFileSync(file, text.replace(/\n/g, '\r\n'));
  }
  const before = new Map(preview.files.map(file => [file.path, hash(readFileSync(join(pkg, file.path)))]));
  const legacyRawSha256 = hash(archive('EXAMPLE_RAW_CRLF'));
  assert.notEqual(legacyRawSha256, reference, 'The fixture must reproduce a full archive difference.');
  run('git', ['init', '--quiet']);
  run('git', ['-c', 'core.autocrlf=false', 'add', '--all']);
  run(process.execPath, [join(root, 'scripts/pack.mjs')], root, {env: {...process.env, npm_execpath: npm}});
  const result = JSON.parse(readFileSync(join(root, '.runtime/package-artifact.json'), 'utf8'));
  assert.equal(result.sha256, reference);
  assert.equal(hash(readFileSync(join(root, '.runtime/packages', result.file))), reference);
  for (const [path, digest] of before) assert.equal(hash(readFileSync(join(pkg, path))), digest, 'Keep existing checkout bytes: ' + path);
  t.diagnostic(JSON.stringify({contract: 'C63', packageFiles: preview.files.length, canonicalSha256: reference, legacyRawSha256, actualPackSha256: result.sha256, inputsUnchanged: true}));
 });
});

function cleanupFixture(){const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-cleanup-EXAMPLE-')));return{base,root,lease:options=>ownedTempCleanup(base,root,'dsh-cleanup-EXAMPLE-',options)};}
test('C191: a transient TEMP lock is retried within its budget and the exact owned root is removed',async()=>{const f=cleanupFixture();let at=0,tries=0;try{const lease=f.lease({now:()=>at,wait:async ms=>{at+=ms;},remove:async path=>{assert.equal(path,f.root);if(++tries<4)throw Object.assign(Error('EXAMPLE_BUSY'),{code:'EBUSY'});await f.lease().cleanup();}});await lease.cleanup();assert.equal(tries,4);assert.equal(existsSync(f.root),false);await lease.cleanup();assert.equal(tries,4);}finally{if(existsSync(f.root))await f.lease().cleanup();}});
test('C191: retry rechecks identity and preserves a replacement directory',async()=>{const f=cleanupFixture(),retained=join(f.base,'dsh-cleanup-EXAMPLE-'+randomUUID());let calls=0,moved=false;try{const lease=f.lease({remove:async()=>{calls++;throw Object.assign(Error('EXAMPLE_BUSY'),{code:'EBUSY'});},wait:async()=>{const part=relative(f.base,retained);assert.ok(part&&!isAbsolute(part)&&!/[\\/]/.test(part)&&part.startsWith('dsh-cleanup-EXAMPLE-'));assert.equal(existsSync(retained),false);renameSync(f.root,retained);moved=true;mkdirSync(f.root);writeFileSync(join(f.root,'EXAMPLE_KEEP'),'EXAMPLE replacement retained');}});await assert.rejects(lease.cleanup(),/Owned TEMP root changed/);assert.equal(calls,1);assert.equal(readFileSync(join(f.root,'EXAMPLE_KEEP'),'utf8'),'EXAMPLE replacement retained');}finally{if(existsSync(f.root))await f.lease().cleanup();if(moved&&existsSync(retained))await ownedTempCleanup(f.base,retained,'dsh-cleanup-EXAMPLE-').cleanup();}});
test('C191: cleanup never hides a primary error and a cleanup-only failure cannot report success',async()=>{const f=cleanupFixture(),primary=Error('EXAMPLE_PRIMARY'),busy=Object.assign(Error('EXAMPLE_BUSY'),{code:'EBUSY'});try{const lease=f.lease({budgetMs:0,remove:async()=>{throw busy;}});await assert.rejects(withOwnedTempCleanup(lease,()=>{throw primary;}),error=>{assert.ok(error instanceof AggregateError);assert.deepEqual(error.errors,[primary,busy]);return true;});await assert.rejects(withOwnedTempCleanup(lease,()=>42),error=>error===busy);assert.ok(existsSync(f.root));}finally{await f.lease().cleanup();}});
test('C191: cleanup waits for an owned child holding its TEMP working directory and leaves no child behind',async()=>{
 const f=cleanupFixture(),lease=f.lease(),child=spawn(process.execPath,['-e',"process.send('EXAMPLE_READY');setInterval(()=>{},1000)"],{cwd:f.root,windowsHide:true,env:{SystemRoot:process.env.SystemRoot??'',WINDIR:process.env.WINDIR??''},stdio:['ignore','ignore','ignore','ipc']}),exited=once(child,'exit');let timer;
 await withOwnedTempCleanup(lease,async()=>{try{
  await Promise.race([once(child,'message'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('EXAMPLE_CHILD_READY_TIMEOUT')),5000);})]);clearTimeout(timer);timer=setTimeout(()=>child.kill(),100);await lease.cleanup();assert.equal(existsSync(f.root),false);
 }finally{clearTimeout(timer);if(child.exitCode===null)child.kill();await exited;}});
 console.log(JSON.stringify({contract:'C191',ownedTempBoundaryVerified:true,transientLockBudgeted:true,identityRecheckedBeforeRetry:true,replacementPreserved:true,primaryAndCleanupFailuresPreserved:true,realOwnedChildReaped:true,packageAssertionsUnchanged:true,nativeRequests:0,modelRequests:0}));
});
