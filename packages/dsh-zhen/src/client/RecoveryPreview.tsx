import React,{useEffect,useRef,useState} from 'react';
import type {RemoteResult} from '@deepseek-ai/dsh-typert-protocol';
import type {ZhenRemote,BackupJob,RecoveryPreview as Preview} from 'dsh-zhen/remote';
import {backupLabels,backupJobSchema,recoveryPreviewSchema,recoveryFactLabels,recoveryWarningLabels} from 'dsh-zhen/remote';
import {useRemoteAction} from './useRemoteAction.ts';

const unwrap=<T,>(value:RemoteResult<T>):T=>{if(!value.ok)throw value.error;return value.value;};
const labels:Record<Preview['integrity'],string>={'at-creation':'以下为候选创建时的校验记录，尚未复核当前文件。',unchanged:'候选文件与创建时一致，仍未激活。',changed:'候选内容已变化，请保留原备份并重新生成候选。',unavailable:'当前无法读取完整候选，请检查目录和文件权限。'};
export function RecoveryPreview({api,job,onBusyChange,onJob}:{api:ZhenRemote;job:BackupJob;onBusyChange?:(busy:boolean)=>void;onJob?:(job:BackupJob)=>void}):React.ReactElement{
  const[preview,setPreview]=useState<Preview>(),scope=useRemoteAction(api,'候选明细暂时无法读取，请保留原备份。'),inspecting=useRef<{api:ZhenRemote;id:string}|undefined>(undefined),generation=useRef(0);
  useEffect(()=>{let alive=true;const version=++generation.current;setPreview(undefined);if(typeof api.backupCandidateSnapshot==='function')void api.backupCandidateSnapshot(job.id).then(value=>{const parsed=recoveryPreviewSchema.parse(unwrap(value));if(alive&&generation.current===version&&parsed.root===job.output)setPreview(parsed);}).catch(()=>{if(alive&&generation.current===version)scope.setNotice('候选明细暂时无法读取，可稍后再次校验。');});return()=>{alive=false;generation.current++;if(inspecting.current?.api===api&&inspecting.current.id===job.id)try{void api.backupCancel(job.id).catch(()=>{});}catch{/* An old disconnected API cannot alter this view. */}};},[api,job.id,job.output]);
  useEffect(()=>{onBusyChange?.(scope.busy);return()=>onBusyChange?.(false);},[onBusyChange,scope.busy]);
  async function verify():Promise<void>{await scope.run(async current=>{const binding={api,id:job.id},version=++generation.current;inspecting.current=binding;try{const value=recoveryPreviewSchema.parse(unwrap(await api.backupCandidateVerify(job.id)));if(current()&&generation.current===version&&value.root===job.output)setPreview(value);}catch{if(current()&&generation.current===version)scope.setNotice('本次校验未完成或已取消，可稍后重新校验；没有切换应用或重做任务。');}finally{if(inspecting.current===binding)inspecting.current=undefined;}});}
  return <section className="zhen-card" aria-label="恢复候选预览">
    <div className="zhen-section-heading"><h2>恢复候选预览</h2><button type="button" className="zhen-secondary" disabled={scope.busy||typeof api.backupCandidateVerify!=='function'} onClick={()=>void verify()}>{scope.busy?'正在校验候选…':'校验当前候选'}</button></div>
    {preview&&<><p role="status">{labels[preview.integrity]}</p><p className="zhen-muted">创建时共有 {preview.files} 个文件、{(preview.bytes/1024**2).toFixed(1)} MB。{preview.checkedAt?'最近校验：'+new Date(preview.checkedAt).toLocaleString():'创建时间：'+new Date(preview.createdAt).toLocaleString()}</p>
      {preview.components.map(row=><div className="zhen-backup-component" key={row.kind}><h3>{backupLabels[row.kind]}</h3><dl className="zhen-backup-facts">{Object.entries(row.counts).map(([key,value])=><div key={key}><dt>{recoveryFactLabels[key as keyof typeof recoveryFactLabels]}</dt><dd>{value}</dd></div>)}</dl>{row.warnings.length>0&&<ul>{row.warnings.map(reason=><li key={reason}>{recoveryWarningLabels[reason]}</li>)}</ul>}</div>)}
      <p className="zhen-muted">目录关联、权限和应用环境仍需统一处理；文件一致不代表已经可以完整恢复应用。此处不切换应用，不启用旧授权或提交生成任务。</p>
    </>}
    {!preview&&<p>这里将显示恢复数量、缺失项与需要处理的目录和权限。</p>}
    {job.error==='BACKUP_CANDIDATE_CATALOG_FAILED'&&<><p role="status">候选文件已生成，恢复记录尚未保存。请保留上方路径和原备份。</p><button type="button" className="zhen-secondary" disabled={scope.busy} onClick={()=>void scope.run(async current=>{const version=++generation.current;try{const value=backupJobSchema.parse(unwrap(await api.backupCandidateRegister(job.id)));if(current()&&generation.current===version&&value.id===job.id&&value.output===job.output)onJob?.(value);}catch{if(current()&&generation.current===version)scope.setNotice('保存记录未完成。请保留此候选路径和原备份，稍后再试。');}})}>重试保存记录</button></>}
    {scope.busy&&<button type="button" className="zhen-link" onClick={()=>{void api.backupCancel(job.id).catch(()=>{});}}>取消本次校验</button>}
    {scope.notice&&<p role="status">{scope.notice}</p>}
  </section>;
}
