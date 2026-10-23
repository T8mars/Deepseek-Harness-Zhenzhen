import assert from 'node:assert/strict';
import {lstatSync,realpathSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {isAbsolute,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';

const same=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const identity=stat=>stat.dev+':'+stat.ino;
/** Test-only capability for one newly created direct child of system TEMP. */
export function ownedTempCleanup(base,root,prefix,{remove=path=>rm(path,{recursive:true,force:false}),wait=delay,now=()=>performance.now(),budgetMs=10000}={}){
 assert.ok(isAbsolute(base)&&isAbsolute(root)&&same(realpathSync.native(tmpdir()),base));assert.match(prefix,/^dsh-[a-z0-9-]+-EXAMPLE-$/);
 const part=relative(base,root);assert.ok(part&&!isAbsolute(part)&&!/[\\/]/.test(part)&&part.startsWith(prefix));assert.ok(Number.isInteger(budgetMs)&&budgetMs>=0&&budgetMs<=30000);
 const parent=lstatSync(base,{bigint:true}),original=lstatSync(root,{bigint:true});assert.ok(parent.isDirectory()&&!parent.isSymbolicLink()&&original.isDirectory()&&!original.isSymbolicLink()&&same(realpathSync.native(root),root));
 function current(){const parentNow=lstatSync(base,{bigint:true});assert.ok(!parentNow.isSymbolicLink()&&parentNow.isDirectory()&&identity(parentNow)===identity(parent)&&same(realpathSync.native(base),base));let stat;try{stat=lstatSync(root,{bigint:true});}catch(error){if(error.code==='ENOENT')return false;throw error;}assert.ok(!stat.isSymbolicLink()&&stat.isDirectory()&&identity(stat)===identity(original)&&same(realpathSync.native(root),root),'Owned TEMP root changed; refusing recursive cleanup.');return true;}
 return {async cleanup(){const started=now();let pause=100;for(;;){if(!current())return;try{await remove(root);return;}catch(error){if(error.code==='ENOENT'&&!current())return;if(!['EBUSY','EPERM','ENOTEMPTY'].includes(error.code)||now()-started>=budgetMs)throw error;}await wait(Math.min(pause,Math.max(0,budgetMs-(now()-started))));pause=Math.min(pause*2,1000);}}};
}

/** Cleanup failures remain failures and cannot replace the original exception. */
export async function withOwnedTempCleanup(lease,work){let failed=false,primary;try{return await work();}catch(error){failed=true;primary=error;throw error;}finally{try{await lease.cleanup();}catch(error){if(failed)throw new AggregateError([primary,error],'Test operation and owned TEMP cleanup both failed.');throw error;}}}
