import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,writeFile,readFile,rm} from 'node:fs/promises';
import {existsSync,lstatSync,rmdirSync,symlinkSync,unlinkSync,realpathSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {prepareRestoredApplication,BackupError} from '../packages/dsh-zhen/lib/backup.js';
const anchor=createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json');

for(const mode of ['missing-cancel','link-cancel','missing-error'])test('C219: application cleanup '+({
  'missing-cancel':'preserves cancellation after a nested stage has already removed its directory',
  'link-cancel':'refuses a replacement link and preserves its external target',
  'missing-error':'retains the original typed failure after nested cleanup',
}[mode]),async t=>{
  const replaceWithLink=mode==='link-cancel';
  const base=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(base,'dsh-application-cleanup-EXAMPLE-'))),candidate=join(root,'candidate'),home=join(candidate,'home'),agents=join(candidate,'agents'),records=join(candidate,'records'),outside=join(root,'EXAMPLE_outside_candidate'),dataRoot=join(home,'dsh-zhen');
  for(const folder of[candidate,home,agents,records,outside])await mkdir(folder);
  const keep=join(outside,'EXAMPLE_KEEP.txt');await writeFile(keep,'EXAMPLE retained target');
  t.after(async()=>{if(existsSync(dataRoot)&&lstatSync(dataRoot).isSymbolicLink())unlinkSync(dataRoot);const exact=await realpath(root),part=relative(base,exact);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-application-cleanup-EXAMPLE-'));await rm(exact,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
  const layouts=[{kind:'environment',root:candidate,details:true,locations:[{role:'home',path:home,type:'directory'},{role:'agents',path:agents,type:'directory'}],profiles:[],externalPackages:0},{kind:'records',root:records,details:true,locations:[{role:'ownData',path:records,type:'directory'}],profiles:[],externalPackages:0}];
  const controller=new AbortController(),reason=mode==='missing-error'?new BackupError('BACKUP_SOURCE_CHANGED'):Error('EXAMPLE_APPLICATION_CANCEL_AFTER_NESTED_CLEANUP');let changed=false;
  const removeNested=()=>{assert.equal(realpathSync.native(dataRoot),dataRoot);assert.equal(relative(candidate,dataRoot),join('home','dsh-zhen'));rmdirSync(dataRoot);if(replaceWithLink)symlinkSync(outside,dataRoot,process.platform==='win32'?'junction':'dir');changed=true;};
  const parts={};if(mode==='missing-error')Object.defineProperty(parts,'knowledge',{get(){removeNested();throw reason;}});
  else Object.defineProperty(controller.signal,'throwIfAborted',{value(){if(!changed&&existsSync(dataRoot)){removeNested();controller.abort(reason);}AbortSignal.prototype.throwIfAborted.call(this);}});
  await assert.rejects(prepareRestoredApplication(candidate,layouts,{installAnchor:anchor},mode==='missing-error'?undefined:controller.signal,parts),replaceWithLink?{code:'BACKUP_TEMP_BOUNDARY'}:error=>error===reason);
  assert.equal(changed,true);assert.equal(await readFile(keep,'utf8'),'EXAMPLE retained target');
  if(!replaceWithLink)assert.equal(existsSync(dataRoot),false);
});
