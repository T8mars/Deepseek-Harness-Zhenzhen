import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {updateSource,SourceUpdateError} from './source-update.mjs';

const skipped=new Set(['LOCAL_CHANGES','DIVERGED','ORIGIN','BRANCH','IN_PROGRESS','GIT','HISTORY_LIMIT','PRIVATE_HISTORY','TREE','CANDIDATE']);
function freshStart(root,flags){
  return new Promise((done,reject)=>{
    const child=spawn(process.execPath,[resolve(root,'scripts/start-local.mjs'),'--skip-source-update',...flags],{cwd:root,windowsHide:true,stdio:'inherit'});
    // The inherited terminal delivers Ctrl+C to both processes. Let the current
    // launcher stop its own Host; do not force-kill a Windows child and orphan it.
    const stop=()=>{};process.on('SIGINT',stop);
    child.once('error',()=>{process.off('SIGINT',stop);reject(new Error('源码已更新，但新启动进程未建立。请重新运行启动入口。'));});
    child.once('close',code=>{process.off('SIGINT',stop);if(code===0)done();else reject(new Error('启动未完成；保留源码和应用资料，请查看本窗口的错误信息。'));});
  });
}
/** After source replacement, use a fresh Node process; never run cached modules. */
export async function sourceAwareStart({root,flags,start,update=updateSource,restart=freshStart,signal}={}){
  if(!Array.isArray(flags)||flags.some(flag=>!['--check','--no-open','--repair','--skip-source-update'].includes(flag)))throw Error('Usage: node scripts/start-local.mjs [--check] [--no-open] [--repair] [--skip-source-update]');
  const clean=flags.filter(flag=>flag!=='--skip-source-update');
  if(!flags.includes('--skip-source-update')){
    let result;const controller=new AbortController(),stop=()=>controller.abort(new Error('启动已取消；保留当前源码和资料，不会自动重试。'));
    process.on('SIGINT',stop);process.on('SIGTERM',stop);signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
    try{try{result=await update({root,mode:'automatic',signal:controller.signal});}catch(error){if(!(error instanceof SourceUpdateError)||!skipped.has(error.code))throw error;console.log('本次源码更新已跳过：'+error.message);}controller.signal.throwIfAborted();}
    finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);signal?.removeEventListener('abort',stop);}
    if(result?.applied){console.log('DSH-zhen源码已快进更新，正在重新启动并校验扩展包。');return restart(root,clean);}
  }
  signal?.throwIfAborted();
  return start({root,flags:clean});
}
