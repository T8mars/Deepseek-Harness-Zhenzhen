// Source-checkout updates only. No upstream/profile/session/credential layouts.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync,lstatSync,readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync,renameSync,unlinkSync,rmdirSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {acquireRuntimeLease,assertRuntimeLease} from './runtime-lifecycle.mjs';
import {checkPaths} from './check-private.mjs';

export const SOURCE_REPOSITORY='https://github.com/T8mars/Deepseek-Harness-Zhenzhen';
const execute=promisify(execFile),revision=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
export class SourceUpdateError extends Error {
  constructor(code,message){super(message);this.name='SourceUpdateError';this.code=code;}
}
const refuse=(code,message)=>{throw new SourceUpdateError(code,message);};
function ordinary(file,limit){const info=lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||info.size>limit)refuse('LOCAL_STATE','更新记录不是有界普通文件，已保留原记录。');return JSON.parse(readFileSync(file,'utf8'));}
function runtime(root,create=false){const dir=join(root,'.runtime');if(existsSync(dir)){const info=lstatSync(dir);if(!info.isDirectory()||info.isSymbolicLink())refuse('LOCAL_STATE','运行目录不是普通目录，已停止更新。');}else if(create)mkdirSync(dir);return dir;}
export function sourceUpdateSettings(root){
  const file=join(runtime(root),'source-update.json');
  if(!existsSync(file))return {schemaVersion:1,automatic:false,checkedAt:'',current:'',candidate:'',previous:''};
  const value=ordinary(file,4096);
  if(value.schemaVersion!==1||typeof value.automatic!=='boolean'||typeof value.checkedAt!=='string'||(value.checkedAt&&!Number.isFinite(Date.parse(value.checkedAt)))||!['current','candidate','previous'].every(key=>typeof value[key]==='string'&&(!value[key]||revision.test(value[key]))))refuse('LOCAL_STATE','更新记录版本或字段不受支持，已保留原记录。');
  return {schemaVersion:1,automatic:value.automatic,checkedAt:value.checkedAt,current:value.current,candidate:value.candidate,previous:value.previous};
}
function save(root,change){
  const previous=sourceUpdateSettings(root),dir=runtime(root,true),file=join(dir,'source-update.json'),temporary=join(dir,'source-update-'+randomUUID()+'.tmp');
  try{writeFileSync(temporary,JSON.stringify({...previous,...change})+'\n',{flag:'wx',mode:0o600});renameSync(temporary,file);}finally{if(existsSync(temporary))unlinkSync(temporary);}
}
export function setSourceAutomatic(root,enabled){if(typeof enabled!=='boolean')refuse('ARGUMENT','自动更新开关无效。');save(realpathSync.native(root),{automatic:enabled,checkedAt:''});return sourceUpdateSettings(root);}
function gitEnvironment(){
  const env={...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never',GIT_MERGE_AUTOEDIT:'no'};
  for(const key of Object.keys(env))if(/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+)$/i.test(key))delete env[key];
  return env;
}
function safeRoot(root){
  root=realpathSync.native(root);
  const pkg=ordinary(join(root,'package.json'),1048576),meta=ordinary(join(root,'meta.json'),65536);
  if(pkg.name!=='dsh-zhen-workspace'||meta.name!=='DSH-zhen'||meta.repository!==SOURCE_REPOSITORY)refuse('REPOSITORY','此入口仅用于DSH-zhen源码目录。');
  return root;
}
function protectedPaths(paths){
  try{checkPaths(paths,'Candidate');}catch{refuse('PRIVATE_HISTORY','候选历史包含本地专用文件或资料目录，已停止更新。');}
  if(paths.some(path=>/(?:^|\/)(?:\.credentials\.yaml|sessions)(?:\/|$)/i.test(path)||/^(?:\.git|\.runtime|node_modules)(?:\/|$)/i.test(path)))refuse('PRIVATE_HISTORY','候选包含运行数据或保留目录，已停止更新。');
}
/** Test seams replace transport, never production authority or path checks. */
export async function updateSource({root,mode='check',expected='',port=5180,signal,gitRunner,now=()=>Date.now()}={}){
  if(!['check','apply','automatic'].includes(mode)||mode==='apply'&&!revision.test(expected))refuse('ARGUMENT','请先检查版本，再使用完整候选提交编号更新。');
  root=safeRoot(root);
  const state=sourceUpdateSettings(root);
  if(mode==='automatic'&&!state.automatic)return {state:'disabled',applied:false};
  if(mode==='automatic'&&state.checkedAt&&now()-Date.parse(state.checkedAt)>=0&&now()-Date.parse(state.checkedAt)<86400000)return {state:'not-due',applied:false};
  let lease,hooks,cleanupRef;
  const ref='refs/dsh-zhen/source-update/'+randomUUID();
  const base=realpathSync.native(tmpdir());
  try{
    // Reserve before fetch/apply; other cooperating launchers cannot start here.
    lease=await acquireRuntimeLease(runtime(root),port);
    hooks=realpathSync.native(mkdtempSync(join(base,'dsh-source-empty-hooks-EXAMPLE-')));
    const git=async(args,allowFailure=false,cleaning=false)=>{
      if(!cleaning)signal?.throwIfAborted();
      const argv=['--no-optional-locks','-c','core.hooksPath='+hooks,'-c','fetch.recurseSubmodules=false',...args];
      try{const result=gitRunner?await gitRunner(argv,{root,signal:cleaning?undefined:signal}):await execute('git',['-C',root,...argv],{encoding:'utf8',windowsHide:true,env:gitEnvironment(),signal:cleaning?undefined:signal,timeout:45000,maxBuffer:16*1024*1024});return {ok:true,text:typeof result==='string'?result:result.stdout};}
      catch(error){if(allowFailure&&typeof error.code==='number')return {ok:false,text:''};refuse('GIT','Git操作未完成，请检查Git安装、仓库访问或网络；没有输出凭据或远端错误原文。');}
    };
    cleanupRef=async()=>{const result=await git(['rev-parse','--verify',ref],true,true);if(result.ok){const value=result.text.trim();if(!revision.test(value))refuse('LOCAL_STATE','临时更新引用无效，已保留现场。');await git(['update-ref','-d',ref,value],false,true);}};
    const text=async args=>(await git(args)).text.trim();
    const identity=async()=>{
      const top=realpathSync.native(await text(['rev-parse','--show-toplevel']));
      if(top.toLowerCase()!==root.toLowerCase())refuse('REPOSITORY','源码目录与Git工作目录不一致。');
      const origin=await text(['remote','get-url','--all','origin']);
      if(![SOURCE_REPOSITORY,SOURCE_REPOSITORY+'.git'].includes(origin))refuse('ORIGIN','origin必须是本项目的GitHub HTTPS地址；未改写远端设置。');
      const branchResult=await git(['symbolic-ref','--quiet','HEAD'],true),branch=branchResult.text.trim();
      if(!branchResult.ok||!branch.startsWith('refs/heads/'))refuse('BRANCH','请先回到自己的工作分支；游离检出不会自动更新。');
      for(const name of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply']){const path=await text(['rev-parse','--git-path',name]);if(existsSync(resolve(root,path)))refuse('IN_PROGRESS','当前Git操作尚未结束，已保留现场。');}
      const tracked=(await git(['ls-files','-v','-z'])).text.split('\0').filter(Boolean);protectedPaths(tracked.map(entry=>entry.slice(2)));
      if(tracked.some(entry=>/^(?:[a-z]|S) /.test(entry)))refuse('LOCAL_CHANGES','存在隐藏工作树改动的索引标记，已跳过自动更新；不会覆盖文件。');
      if((await git(['status','--porcelain=v1','-z','--untracked-files=all'])).text)refuse('LOCAL_CHANGES','存在本地修改或未跟踪文件，已跳过更新；请先自行保存修改，不会自动暂存或覆盖。');
      const current=await text(['rev-parse','--verify','HEAD']);if(!revision.test(current))refuse('REPOSITORY','当前提交编号无效。');return {branch,current};
    };
    const before=await identity();
    // Do not update origin/main, tags or FETCH_HEAD before candidate validation.
    await git(['fetch','--no-tags','--no-write-fetch-head','--refmap=','origin','refs/heads/main:'+ref]);
    const candidate=await text(['rev-parse','--verify',ref+'^{commit}']);if(!revision.test(candidate))refuse('CANDIDATE','候选提交编号无效。');
    const stamp=new Date(now()).toISOString();
    if(candidate===before.current){save(root,{checkedAt:stamp,current:before.current,candidate});return {state:'current',applied:false,...before,candidate};}
    if((await git(['merge-base','--is-ancestor',candidate,before.current],true)).ok){save(root,{checkedAt:stamp,current:before.current,candidate});return {state:'local-ahead',applied:false,...before,candidate};}
    if(!(await git(['merge-base','--is-ancestor',before.current,candidate],true)).ok)refuse('DIVERGED','本地分支与main已分叉，停止自动更新；不会合并、变基或丢弃提交。');
    const commits=(await text(['rev-list','--max-count=1001',candidate])).split('\n').filter(Boolean);
    if(commits.length>1000)refuse('HISTORY_LIMIT','候选历史超出自动检查范围，请人工审阅后更新。');
    for(const commit of commits){
      const entries=(await git(['ls-tree','-r','-z',commit])).text.split('\0').filter(Boolean),paths=[];
      for(const entry of entries){const match=/^(100644|100755) blob [a-f0-9]+\t([\s\S]+)$/.exec(entry);if(!match)refuse('TREE','候选包含链接或嵌套仓库，停止自动更新。');paths.push(match[2]);}
      protectedPaths(paths);
    }
    const target=JSON.parse((await git(['show',candidate+':meta.json'])).text),pkg=JSON.parse((await git(['show',candidate+':package.json'])).text);
    if(target.name!=='DSH-zhen'||target.repository!==SOURCE_REPOSITORY||pkg.name!=='dsh-zhen-workspace')refuse('CANDIDATE','候选不是受支持的DSH-zhen源码。');
    const changedFiles=(await git(['diff','--name-only','-z',before.current,candidate])).text.split('\0').filter(Boolean).length;
    const plan={state:'available',applied:false,...before,candidate,changedFiles};
    if(mode==='check'){save(root,{checkedAt:stamp,current:before.current,candidate});return plan;}
    if(mode==='apply'&&candidate!==expected)refuse('CHANGED_CANDIDATE','main候选已变化，请重新检查后选择完整编号；未更新源码。');
    if(mode==='automatic'&&!sourceUpdateSettings(root).automatic)return {state:'disabled',applied:false};
    await assertRuntimeLease(lease,runtime(root),lease.port);
    const current=await identity();if(current.current!==before.current||current.branch!==before.branch)refuse('LOCAL_CHANGES','检查期间分支或提交变化，停止更新。');
    // Never autostash; ignored art/research/runtime files must not be overwritten.
    try{await git(['-c','merge.autoStash=false','merge','--ff-only','--no-autostash','--no-overwrite-ignore','--no-stat','--no-edit',candidate]);}
    catch{refuse('APPLY_FAILED','Git快进未完成，已停止启动并保留现场。请检查本地文件；不会自动reset、clean或重试。');}
    if(await text(['rev-parse','HEAD'])!==candidate)refuse('APPLY_FAILED','更新后的提交与候选不符，停止启动并保留现场。');
    save(root,{checkedAt:stamp,current:candidate,candidate,previous:before.current});
    return {...plan,state:'updated',applied:true};
  }finally{
    try{await cleanupRef?.();}finally{try{if(hooks){const part=relative(base,realpathSync.native(hooks));if(!part||isAbsolute(part)||part.startsWith('..')||part.includes('/')||part.includes('\\'))throw Error('Hook directory cleanup refused.');rmdirSync(hooks);}}finally{await lease?.release();}}
  }
}
