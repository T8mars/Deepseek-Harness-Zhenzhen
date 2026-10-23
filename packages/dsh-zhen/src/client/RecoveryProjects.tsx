import React,{useEffect,useRef,useState} from 'react';
import type {RemoteResult} from '@deepseek-ai/dsh-typert-protocol';
import type {ZhenRemote,BackupJob,RecoveryProjects as ProjectPage,RecoveryProjectSelection} from 'dsh-zhen/remote';
import {recoveryProjectsSchema} from 'dsh-zhen/remote';
import {DirectoryChooser} from './DirectoryChooser.tsx';
import {useRemoteAction} from './useRemoteAction.ts';

const unwrap=<T,>(result:RemoteResult<T>):T=>{if(!result.ok)throw result.error;return result.value;};
type Review={api:ZhenRemote;id:string;root:BackupJob['output'];reviewKey:string;version:number};
export function RecoveryProjects({api,job,reviewKey='',disabled=false,onBusyChange,onApply,onInvalidate}:{api:ZhenRemote;job:BackupJob;reviewKey?:string;disabled?:boolean;onBusyChange?:(value:boolean)=>void;onApply?:(selection:RecoveryProjectSelection)=>void;onInvalidate?:()=>void}):React.ReactElement|null{
  const[applied,setApplied]=useState(false),[page,setPage]=useState<ProjectPage>(),[choices,setChoices]=useState<Record<string,string>>({}),[known,setKnown]=useState<Record<string,ProjectPage['items'][number]>>({});
  const[continuations,setContinuations]=useState(false),reviewed=useRef<Review|undefined>(undefined),continuationChoice=useRef<{review:Review;value:boolean}|undefined>(undefined);
  const scope=useRemoteAction(api,'项目目录暂时无法读取，请保留原备份后重试。'),epoch=useRef(0),alive=useRef(true),inspection=useRef<{api:ZhenRemote;id:string;version:number}|undefined>(undefined),current=useRef({api,id:job.id,root:job.output,reviewKey,disabled,onApply,onInvalidate,choices,known,canContinue:job.components.includes('workspaces')});current.current={api,id:job.id,root:job.output,reviewKey,disabled,onApply,onInvalidate,choices,known,canContinue:job.components.includes('workspaces')};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{epoch.current++;reviewed.current=undefined;continuationChoice.current=undefined;setContinuations(false);setApplied(false);setPage(undefined);setChoices({});setKnown({});current.current.choices={};current.current.known={};current.current.onInvalidate?.();return()=>{epoch.current++;const active=inspection.current;inspection.current=undefined;if(active)try{void active.api.backupCancel(active.id).catch(()=>{});}catch{/* A disconnected old API cannot update the current form. */}};},[api,job.id,job.output,reviewKey]);
  useEffect(()=>{onBusyChange?.(scope.busy);return()=>onBusyChange?.(false);},[onBusyChange,scope.busy]);
  async function load(cursor=''):Promise<void>{await scope.run(async accepted=>{const binding={api,id:job.id,root:job.output,reviewKey},version=++epoch.current;reviewed.current=undefined;const active={api,id:job.id,version};inspection.current=active;setApplied(false);setPage(undefined);current.current.onInvalidate?.();const matches=()=>accepted()&&alive.current&&epoch.current===version&&current.current.api===binding.api&&current.current.id===binding.id&&current.current.root===binding.root&&current.current.reviewKey===binding.reviewKey&&!current.current.disabled;
    try{const result=recoveryProjectsSchema.parse(unwrap(await api.backupCandidateProjects(job.id,cursor)));if(matches()){if(result.root!==job.output)throw Error('RECOVERY_PROJECT_REPLY_CHANGED');reviewed.current={...binding,version};setPage(result);const merged={...current.current.known,...Object.fromEntries(result.items.map(row=>[row.id,row]))};current.current.known=merged;setKnown(merged);}}
    catch{if(matches()){setChoices({});setKnown({});scope.setNotice('项目列表未读取或候选已变化。请保留原备份，重新校验后再选择。');}}
    finally{if(inspection.current===active)inspection.current=undefined;}
  });}
  const reviewMatches=()=>{const value=reviewed.current,now=current.current;return !!value&&alive.current&&!now.disabled&&value.api===now.api&&value.id===now.id&&value.root===now.root&&value.reviewKey===now.reviewKey&&value.version===epoch.current;};
  function choose(id:string,directory:string):void{const now=current.current;if(!reviewMatches()||now.api!==api||now.id!==job.id||now.root!==job.output||now.reviewKey!==reviewKey)return;setApplied(false);now.onInvalidate?.();const next={...now.choices};if(directory)next[id]=directory;else delete next[id];now.choices=next;setChoices(next);}
  const selected=Object.entries(choices).filter(([id,path])=>path&&known[id]),sessions=selected.reduce((total,[id])=>total+known[id].sessions,0),canRead=job.components.includes('sessions')&&job.components.includes('environment');
  if(typeof api.backupCandidateProjects!=='function')return null;
  return <div className="zhen-backup-component" aria-label="恢复项目目录">
    <div className="zhen-section-heading"><h3>选择恢复后的项目目录</h3><button type="button" className="zhen-secondary" disabled={disabled||scope.busy||!canRead} onClick={()=>void load()}>读取项目列表</button></div>
    <p className="zhen-muted">按会话的原始项目目录分组。选择并采用现有文件夹后，在恢复表单输入原备份密码，生成带这些目录的新候选。原候选和项目文件保留。</p>
    {job.components.includes('knowledge')&&<p className="zhen-muted">与原项目目录一致的知识库关联会一并更新，资料空间名称和引用保留；其他资料空间保留原目录，模型访问仍需审阅。</p>}
    {!canRead&&<p>这份候选需要同时包含应用配置与会话，才能关联恢复目录。</p>}
    {page&&<><p role="status">{page.status==='available'?`共 ${page.totalProjects} 个项目、${page.totalSessions} 个会话；本页显示 ${page.items.length} 个项目。`:page.status==='legacy'?'旧候选缺少项目目录明细，请从原备份重新生成。':'这份候选未选择会话。'}</p>
      {page.items.map(row=><div className="zhen-backup-component" key={row.id}><p className="zhen-source-path">{row.originalDirectory??'未记录原始项目目录'}</p><label className="zhen-label">恢复后工作目录（{row.sessions} 个会话）<input className="zhen-input" value={choices[row.id]??''} maxLength={4096} disabled={disabled||scope.busy} placeholder="选择现有项目文件夹" onChange={event=>choose(row.id,event.currentTarget.value)}/></label><DirectoryChooser api={api} value={choices[row.id]??''} scopeKey={job.id+':'+row.id+':'+reviewKey} onChoose={directory=>choose(row.id,directory)} disabled={disabled||scope.busy}/>{choices[row.id]&&<button type="button" className="zhen-link" disabled={disabled||scope.busy} onClick={()=>choose(row.id,'')}>保留此项目原目录</button>}</div>)}
      <div className="zhen-actions"><button type="button" className="zhen-secondary" disabled={disabled||scope.busy} onClick={()=>void load()}>项目首页</button>{page.nextCursor&&<button type="button" className="zhen-secondary" disabled={disabled||scope.busy} onClick={()=>void load(page.nextCursor!)}>下一页项目</button>}</div>
    </>}
    {selected.length>0&&<p role="status">已选择 {selected.length} 个项目，共 {sessions} 个会话。未选择的项目保留原目录。</p>}
    {job.components.includes('workspaces')&&selected.length>0&&<label className="zhen-label"><input type="checkbox" checked={continuations} disabled={disabled||scope.busy} onChange={event=>{const now=current.current;if(!reviewMatches()||now.api!==api||now.id!==job.id||now.root!==job.output||now.reviewKey!==reviewKey)return;const value=event.currentTarget.checked;continuationChoice.current={review:reviewed.current!,value};setContinuations(value);setApplied(false);now.onInvalidate?.();}}/>为新目录建立继续会话入口<span className="zhen-muted">原会话和历史保留；继续入口在恢复候选中准备，工作区和权限仍需审阅。</span></label>}
    <button type="button" className="zhen-secondary" disabled={disabled||scope.busy||!page||!selected.length||!onApply} onClick={()=>{const now=current.current;if(!reviewMatches()||!now.onApply||now.disabled||now.api!==api||now.id!==job.id||now.root!==job.output||now.reviewKey!==reviewKey||!page||page.root!==job.output)return;const directories=Object.entries(now.choices).filter(([id,path])=>path&&now.known[id]).map(([projectId,directory])=>({projectId,directory}));if(!directories.length)return;const choice=continuationChoice.current,continueSelected=now.canContinue&&choice?.value&&choice.review.api===now.api&&choice.review.id===now.id&&choice.review.root===now.root&&choice.review.reviewKey===now.reviewKey;now.onApply({candidateId:job.id,directories,...continueSelected?{continuations:true}:{}});setApplied(true);}}>采用这些目录</button>
    {applied&&<p role="status">目录已带入上方恢复表单。请核对原备份并输入密码，再生成新候选。<a href="#zhen-restore-form">前往恢复表单</a></p>}
    <p className="zhen-muted">目录选择不恢复文件访问权限，不会激活应用或继续旧生成任务。</p>
    {scope.busy&&<button type="button" className="zhen-link" onClick={()=>{void api.backupCancel(job.id).catch(()=>{});}}>取消读取项目</button>}
    {scope.notice&&<p role="status">{scope.notice}</p>}
  </div>;
}
