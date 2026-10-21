import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {join,relative,isAbsolute} from 'node:path';import {tmpdir} from 'node:os';import {buildSkillCatalog} from '../scripts/skill-catalog.mjs';

test('C75: a fresh autocrlf checkout stays clean after regenerating the reviewed public skill feed',async t=>{
  const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-clean-feed-EXAMPLE-'))),seed=join(root,'seed'),clone=join(root,'clone');mkdirSync(seed);
  t.after(()=>{const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-clean-feed-EXAMPLE-'));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  const git=(cwd,args)=>execFileSync('git',['-c','core.safecrlf=false','-C',cwd,...args],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
  const path='packages/dsh-zhen/skills/example-only',folder=join(seed,path);mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'SKILL.md'),'# EXAMPLE_ONLY\n\nExample text.\n');writeFileSync(join(folder,'manifest.json'),JSON.stringify({id:'example-only',version:'1.0.0',source:'bundled'}));writeFileSync(join(seed,'.gitattributes'),readFileSync('.gitattributes'));
  await buildSkillCatalog(join(seed,'packages/dsh-zhen'));git(seed,['init','.']);git(seed,['config','core.autocrlf','true']);git(seed,['add','--','.gitattributes','packages','market']);git(seed,['-c','user.name=EXAMPLE automation','-c','user.email=example@dsh-zhen.invalid','commit','-m','EXAMPLE_ONLY']);
  git(root,['-c','core.autocrlf=true','clone','--quiet','--no-hardlinks',seed,clone]);git(clone,['config','core.autocrlf','true']);assert.equal(git(clone,['status','--porcelain','--untracked-files=all']),'');
  await buildSkillCatalog(join(clone,'packages/dsh-zhen'));
  // Do not run git diff first: it refreshes the conversion state and can hide
  // the false modification observed by the publisher's first status check.
  assert.equal(git(clone,['status','--porcelain','--untracked-files=all']),'');
  assert.equal(readFileSync(join(clone,'market/skills.v1.json')).includes(Buffer.from('\r\n')),false);
});
