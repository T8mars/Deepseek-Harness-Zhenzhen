import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

test('C46: genuine Git checkout preserves native approval source and license bytes under core.autocrlf=true',()=>{
 const workspace=dirname(dirname(fileURLToPath(import.meta.url))),base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-fixture-checkout-EXAMPLE-'))),repo=join(root,'EXAMPLE_REPOSITORY'),location='contracts/fixtures/canvas-approval/',sha=b=>createHash('sha256').update(b).digest('hex');mkdirSync(repo);
 const git=(cwd,args)=>execFileSync('git',['-c','core.autocrlf=true','-c','core.safecrlf=false',...args],{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:15000});
 try{
  const metadata=JSON.parse(readFileSync(join(workspace,location,'source.json'),'utf8'));assert.deepEqual(metadata.files.map(x=>x.file),['approvals.cjs','LICENSE']);git(repo,['init','--quiet']);mkdirSync(join(repo,location),{recursive:true});
  for(const file of metadata.files){const bytes=git(workspace,['show','HEAD:'+location+file.file]);assert.equal(sha(bytes),file.sha256);writeFileSync(join(repo,location,file.file),bytes);}
  // Reproduce the runner's default conversion in an independent repository.
  // Do not change this workspace's Git configuration, index or fixture bytes.
  writeFileSync(join(repo,'.gitattributes'),'* text=auto\n');git(repo,['add','--','.gitattributes',...metadata.files.map(x=>location+x.file)]);
  const checkout=(name)=>{const target=join(root,name);mkdirSync(target);git(repo,['checkout-index','--force','--prefix='+target.replaceAll('\\','/')+'/',...metadata.files.map(x=>location+x.file)]);return target;};
  const before=checkout('EXAMPLE_BEFORE');for(const file of metadata.files){const bytes=readFileSync(join(before,location,file.file));assert.notEqual(sha(bytes),file.sha256,'The baseline must reproduce a real byte change.');assert.ok(bytes.includes(Buffer.from('\r\n')));}
  writeFileSync(join(repo,'.gitattributes'),readFileSync(join(workspace,'.gitattributes')));git(repo,['add','--','.gitattributes']);const after=checkout('EXAMPLE_AFTER');
  for(const file of metadata.files)assert.equal(sha(readFileSync(join(after,location,file.file))),file.sha256,'Reviewed source and MIT license must retain their original bytes.');
 }finally{
  const absolute=realpathSync.native(root),part=relative(base,absolute);assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!part.includes('/')&&!part.includes('\\')&&part.startsWith('dsh-fixture-checkout-EXAMPLE-'));rmSync(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
});
