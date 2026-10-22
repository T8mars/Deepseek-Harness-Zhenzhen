import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {RemoteResult} from '@deepseek-ai/dsh-typert-protocol';
import type {ZhenRemote,BackupJob,RecoveryCatalogView} from 'dsh-zhen/remote';
import {recoveryCatalogSchema,backupLabels} from 'dsh-zhen/remote';
import {useRemoteAction} from './useRemoteAction.ts';

const unwrap=<T,>(value:RemoteResult<T>):T=>{if(!value.ok)throw value.error;return value.value;};
export function RecoveryHistory({api,disabled,revision,onSelect,onForget}:{api:ZhenRemote;disabled:boolean;revision:string;onSelect:(job:BackupJob)=>void;onForget:(id:string)=>void}):React.ReactElement{
  const[cursor,setCursor]=useState(''),[view,setView]=useState<RecoveryCatalogView>(),scope=useRemoteAction(api,'恢复记录暂时无法读取。'),generation=useRef(0);
  useLayoutEffect(()=>{generation.current++;return()=>{generation.current++;};},[api,cursor,revision,disabled]);
  useEffect(()=>{setCursor('');setView(undefined);},[api]);
  useEffect(()=>{let alive=true;const version=++generation.current;setView(undefined);scope.setNotice('');if(typeof api.backupCandidateList==='function')void api.backupCandidateList(cursor).then(value=>{const parsed=recoveryCatalogSchema.parse(unwrap(value));if(alive&&generation.current===version)setView(parsed);}).catch(()=>{if(alive&&generation.current===version)scope.setNotice('恢复记录暂时无法读取，可稍后刷新。');});return()=>{alive=false;};},[api,cursor,revision,disabled]);
  async function refresh():Promise<void>{if(disabled)return;await scope.run(async current=>{const version=++generation.current;try{const value=recoveryCatalogSchema.parse(unwrap(await api.backupCandidateList(cursor)));if(current()&&generation.current===version)setView(value);}catch{if(current()&&generation.current===version)scope.setNotice('恢复记录暂时无法读取，可稍后刷新。');}});}
  function select(row:RecoveryCatalogView['items'][number]):void{if(disabled||scope.busy)return;onSelect({id:row.id,operation:'restore',phase:'succeeded',component:null,completed:row.components.length,total:row.components.length,components:row.components,output:row.root,bytes:null,sha256:null,error:row.persisted?null:'BACKUP_CANDIDATE_CATALOG_FAILED',activated:false,wholeApplicationRestore:false});}
  async function forget(id:string):Promise<void>{if(disabled)return;await scope.run(async current=>{const version=++generation.current;try{unwrap(await api.backupCandidateForget(id));if(!current()||generation.current!==version)return;onForget(id);const value=recoveryCatalogSchema.parse(unwrap(await api.backupCandidateList(cursor)));if(current()&&generation.current===version)setView(value);}catch{if(current()&&generation.current===version)scope.setNotice('移除记录未完成，请刷新后查看；候选目录和备份文件保留。');}});}
  return <section className="zhen-card" aria-label="恢复候选记录">
    <div className="zhen-section-heading"><h2>恢复候选记录</h2><button type="button" className="zhen-secondary" disabled={disabled||scope.busy||typeof api.backupCandidateList!=='function'} onClick={()=>void refresh()}>刷新记录</button></div>
    <p className="zhen-muted">选择已有候选可继续查看和校验。移除记录会保留候选目录和备份文件。</p>
    {view?.catalog==='unavailable'&&<p role="status">已保存的记录暂不可读，以下仅为当前进程保留的候选。</p>}
    {view?.catalog==='memory-only'&&<p role="status">当前服务仅保留内存记录，重启后需要从原备份重新生成候选。</p>}
    {view?.items.map(row=><div className="zhen-backup-component" key={row.id}><h3>{new Date(row.createdAt).toLocaleString()} · {row.persisted?'已保存记录':'尚未保存记录'}</h3><p>{row.components.map(id=>backupLabels[id]).join('、')}</p><p className="zhen-source-path">{row.root}</p><div className="zhen-actions zhen-wrap"><button type="button" className="zhen-secondary" disabled={disabled||scope.busy} onClick={()=>select(row)}>查看此候选</button><button type="button" className="zhen-link" disabled={disabled||scope.busy} onClick={()=>void forget(row.id)}>移除此记录</button></div></div>)}
    {view&&!view.items.length&&<p>{cursor?'这一页没有记录，可以返回首页。':'还没有恢复候选。完成一次恢复后，记录会出现在这里。'}</p>}
    <div className="zhen-actions zhen-wrap">{cursor&&<button type="button" className="zhen-secondary" disabled={disabled||scope.busy} onClick={()=>{if(!disabled&&!scope.busy)setCursor('');}}>记录首页</button>}{view?.nextCursor&&<button type="button" className="zhen-secondary" disabled={disabled||scope.busy} onClick={()=>{if(!disabled&&!scope.busy)setCursor(view.nextCursor!);}}>下一页记录</button>}</div>
    {scope.notice&&<p role="status">{scope.notice}</p>}
  </section>;
}
