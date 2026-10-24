import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {isAbsolute,resolve} from 'node:path';

/** Ask npm for this process's effective cache, without emitting configuration.
 * Install children receive this directory only, never the parent's auth/env. */
export function npmCacheDirectory(npm,{cwd=process.cwd(),env=process.env,flags=[]}={}){
 let value;try{value=execFileSync(process.execPath,[npm,'config','get','cache','--offline','--no-update-notifier',...flags],{cwd,env,windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000,maxBuffer:65536}).trim();}catch{throw Error('EXAMPLE_NPM_CACHE_LOOKUP_FAILED');}
 assert.ok(value.length>0&&value.length<=4096&&isAbsolute(value)&&!/[\u0000-\u001f\u007f]/.test(value),'EXAMPLE_NPM_CACHE_DIRECTORY_INVALID');return value;
}
export function sameNpmCache(a,b){const first=resolve(a),second=resolve(b);return process.platform==='win32'?first.toLowerCase()===second.toLowerCase():first===second;}
