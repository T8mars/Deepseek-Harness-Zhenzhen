import {execFileSync} from 'node:child_process';
import {realpathSync} from 'node:fs';

const fixed=new Set(['package.json','package-lock.json','packages/dsh-zhen/package.json','packages/dsh-zhen/cordis.patch.yml','packages/dsh-zhen/src/compatibility.ts','UPSTREAM.lock.json','UPSTREAM.prepared.json','contracts/upstream-baseline.json','contracts/upstream-bootstrap-review.json','scripts/check-smoke-ci.mjs','scripts/gateway-smoke-core.mjs','scripts/real-gateway-smoke.mjs']);
const commit=value=>{if(!/^[a-f0-9]{40}$/.test(value??''))throw Error('Promotion source commit refused.');};
const allowed=path=>fixed.has(path)||/^contracts\/ack\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}\.json$/.test(path??'');
/** Read public tracked metadata only, never an installed profile, session or credential layout. */
export function promotionSource(workspace=process.cwd()){
 const root=realpathSync.native(workspace),git=args=>execFileSync('git',['--no-replace-objects','-C',root,...args],{windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:2*1024*1024});
 function listSource(sha,directory){commit(sha);if(directory!=='contracts/ack')throw Error('Promotion source directory refused.');const entries=git(['ls-tree','-r','-z',sha,'--',directory]).toString().split('\0').filter(Boolean);if(entries.length>1000)throw Error('Too many upstream acknowledgments.');return entries.map(entry=>{const match=/^100644 blob [a-f0-9]{40}\t(.+)$/.exec(entry);if(!match||!allowed(match[1])||!match[1].startsWith(directory+'/'))throw Error('Upstream acknowledgment must be an ordinary tracked JSON file.');return match[1];}).sort();}
 function readSource(sha,path,{optional=false}={}){commit(sha);if(!allowed(path))throw Error('Promotion source path refused.');const tree=git(['ls-tree','-z',sha,'--',path]).toString();if(!tree){if(optional)return undefined;throw Error('Required promotion source file is missing.');}if(!tree.startsWith('100644 blob ')||tree.split('\0').filter(Boolean).length!==1)throw Error('Promotion metadata must be an ordinary tracked file.');return git(['show',sha+':'+path]);}
 return{root,readSource,listSource,head:()=>git(['rev-parse','HEAD']).toString().trim(),dirty:()=>!!git(['status','--porcelain','--untracked-files=normal']).toString().trim(),sourceTimestamp:sha=>{commit(sha);return Number(git(['show','-s','--format=%ct',sha]).toString().trim());},isAncestor:(before,after)=>{commit(before);commit(after);try{git(['merge-base','--is-ancestor',before,after]);return true;}catch(error){if(error.status===1)return false;throw Error('Promotion source lineage is unavailable.');}}};
}
