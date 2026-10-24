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

/** Trusted package installers need the runner's proxy/CA routing. Do not pass
 * registry tokens, application secrets or this environment to SDK app boots. */
export function npmInstallEnvironment(base,parent=process.env){
 const environment={...base},transportKeys=[];
 for(const[name,value]of Object.entries(parent))if(/^(?:https?_proxy|all_proxy|no_proxy|node_extra_ca_certs|ssl_cert_file|ssl_cert_dir)$/i.test(name)&&value!==undefined){environment[name]=value;transportKeys.push(name);}
 return{environment,transportKeys:transportKeys.sort()};
}
