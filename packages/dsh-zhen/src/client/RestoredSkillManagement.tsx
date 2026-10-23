import React,{useEffect,useRef,useState} from 'react';
import type {RemoteResult} from '@deepseek-ai/dsh-typert-protocol';
import type {ZhenRemote,RestoredManagedRuntimeView} from 'dsh-zhen/remote';
import {RESTORED_MANAGED_RUNTIME_POLICY,restoredManagedRuntimeView} from 'dsh-zhen/remote';
import {RestoredManagedSkills} from './RestoredManagedSkills.tsx';
import {useRemoteAction} from './useRemoteAction.ts';
const unwrap=<T,>(value:RemoteResult<T>):T=>{if(!value.ok)throw value.error;return value.value;},labels={market:'技能市场',local:'本地导入',github:'GitHub 来源'};

export function RestoredManagedRuntimeCard({api,onChanged}:{api:ZhenRemote;onChanged?:()=>void}):React.ReactElement|null{
  const [loaded,setLoaded]=useState<{api:ZhenRemote;value:RestoredManagedRuntimeView}>(),[confirmed,setConfirmed]=useState(''),[failed,setFailed]=useState(false),scope=useRemoteAction(api),revision=useRef(0),value=loaded?.api===api?loaded.value:undefined,latest=useRef({api,value,confirmed});latest.current={api,value,confirmed};
  useEffect(()=>{const current=++revision.current;setLoaded(undefined);setConfirmed('');setFailed(false);if(typeof api.restoredManagedRuntimeStatus!=='function')return;void api.restoredManagedRuntimeStatus(0).then(reply=>{const result=restoredManagedRuntimeView.parse(unwrap(reply));if(result.page!==0)throw Error();if(current===revision.current)setLoaded({api,value:result});}).catch(()=>{if(current===revision.current)setFailed(true);});return()=>{revision.current++;};},[api]);
  async function load(page=0):Promise<void>{
    if(latest.current.api!==api)return;const expected=latest.current.value;await scope.run(async active=>{const current=++revision.current;setConfirmed('');try{const result=restoredManagedRuntimeView.parse(unwrap(await api.restoredManagedRuntimeStatus(page)));if(!active()||revision.current!==current)return;if(result.page!==page||page>0&&(result.snapshot!==expected?.snapshot||result.profile!==expected?.profile))throw Error();setLoaded({api,value:result});setFailed(false);if(!expected||expected.active!==result.active||expected.paused!==result.paused)onChanged?.();}catch{if(active()&&revision.current===current){setLoaded(undefined);setFailed(true);scope.setNotice('管理状态暂时不可用或来源已变化。请重新检查，原恢复资料继续保留。');}}});
  }
  async function change(action:'enable'|'pause'):Promise<void>{
    const selected=latest.current.value;if(latest.current.api!==api||!selected?.snapshot||selected.snapshot!==value?.snapshot||selected.profile!==value?.profile||action==='enable'&&latest.current.confirmed!==selected.snapshot||action==='pause'&&(!selected.active||selected.paused))return;
    await scope.run(async active=>{const current=++revision.current;setConfirmed('');setLoaded(undefined);try{const result=restoredManagedRuntimeView.parse(unwrap(await api.restoredManagedRuntimeChange({snapshot:selected.snapshot!,action,confirmation:RESTORED_MANAGED_RUNTIME_POLICY})));if(!active()||revision.current!==current)return;if(!result.available||result.profile!==selected.profile||!result.active||result.page!==0||result.paused!==(action==='pause')||action==='enable'&&result.repairRequired)throw Error();setLoaded({api,value:result});setFailed(false);onChanged?.();scope.setNotice(action==='enable'?'技能管理已启用。原活动版本可继续使用，待更新版本需重新确认；自动检查与自动更新请按需另行开启。':'管理与自动检查已暂停，当前技能、个人副本和待更新记录继续保留。');}catch{if(active()&&revision.current===current){setFailed(true);scope.setNotice('操作结果尚未确认。请点击“检查管理状态”读取实际结果；不会自动再次创建副本或重复提交。');}}});
  }
  if(typeof api.restoredManagedRuntimeStatus!=='function'||value?.reason==='not-restored')return null;
  if(!value&&!failed&&!scope.busy&&!scope.notice)return null;
  return <section className="zhen-card" aria-label="恢复后的技能管理" aria-busy={scope.busy}>
    <div className="zhen-section-heading"><h2>恢复后的技能管理</h2><span>{value?.repairRequired?'需要重新审阅':value?.active?(value.paused?'管理已暂停':'管理已启用'):'等待核对'}</span></div>
    {value?.reason==='profile-unavailable'&&<p role="status">当前窗口缺少恢复配置入口。请在对应的完整恢复应用中继续，原始备份保留。</p>}
    {value?.available&&<>
      <p>当前配置：<strong>{value.profile}</strong>。共 {value.total} 个来源、{value.pending} 条保留的待更新记录。</p>
      <p>恢复应用中的配置共用一份独立技能库，保留所有版本、个人副本、停用选择和待更新记录，原恢复资料继续保留。启用后可在下方安装、修改和更新技能，无需手填目录或重启来启用管理。技能修改会同步到其他配置，并完整进入备份。</p>
      <p className="zhen-muted">此操作允许当前配置中已启用的市场、本地导入及 GitHub 技能与附带资源用于会话，并允许日常管理。其他配置仍需分别授权。本地导入延续所列目录及后续修改的信任范围。自动检查、自动更新需在当前配置重新开启；附带程序不会因此执行，模型、画布和知识库权限分别处理。</p>
      {value.originalAutomatic&&!value.active&&<p>备份中的自动偏好已保留，首次启用管理时仍保持关闭。</p>}
      {value.repairRequired&&<p role="status">更新授权记录暂时不可用。当前技能和原资料保留；重新审阅管理会清空旧的更新授权，待更新版本需要重新确认。</p>}
      {value.paused&&<p>当前技能仍可使用。重新启用管理后，待更新记录需重新确认，自动开关保持关闭。</p>}
      <details><summary>查看来源（共 {value.total} 项）</summary>{value.items.map(row=><div className="zhen-card" key={row.key}><p><strong>{row.name}</strong> · {labels[row.kind]} · {row.enabled?'已启用':'已停用'}</p>{row.version&&<p className="zhen-source-path">{value.active?'当前版本':'原活动版本'}：{row.version}</p>}{row.location&&<p className="zhen-source-path">来源位置：{row.location}</p>}</div>)}<div className="zhen-actions zhen-wrap"><button type="button" className="zhen-secondary" disabled={scope.busy||value.page===0} onClick={()=>void load(value.page-1)}>上一页管理范围</button><span>第 {value.page+1} 页</span><button type="button" className="zhen-secondary" disabled={scope.busy||value.nextPage===null} onClick={()=>value.nextPage!==null&&void load(value.nextPage)}>下一页管理范围</button></div></details>
      {(!value.active||value.paused||value.repairRequired)&&<><label className="zhen-label"><input type="checkbox" disabled={scope.busy} checked={confirmed===value.snapshot} onChange={event=>setConfirmed(event.currentTarget.checked?value.snapshot!:'')}/>我已核对上述完整管理范围，允许当前配置使用和管理共享技能库，了解修改会同步到其他配置。</label><button type="button" className="zhen-primary" disabled={scope.busy||confirmed!==value.snapshot} onClick={()=>void change('enable')}>{value.repairRequired?'重新审阅管理':value.paused?'重新启用管理':'启用技能管理'}</button></>}
      {value.active&&!value.paused&&<button type="button" className="zhen-secondary" disabled={scope.busy} onClick={()=>void change('pause')}>暂停管理</button>}
    </>}
    {scope.busy&&<p role="status">正在核对并处理管理副本，请稍候。操作只提交一次。</p>}
    <button type="button" className="zhen-secondary" disabled={scope.busy} onClick={()=>void load()}>检查管理状态</button>
    {scope.notice&&<p role="status">{scope.notice}</p>}{failed&&!scope.notice&&<p role="status">管理状态暂时不可用，请重新检查。原始备份保留。</p>}
  </section>;
}

export function RestoredSkillManagement({api,onChanged}:{api:ZhenRemote;onChanged?:()=>void}):React.ReactElement{
  const [revision,setRevision]=useState(0);return <><RestoredManagedRuntimeCard api={api} onChanged={()=>{setRevision(value=>value+1);onChanged?.();}}/><RestoredManagedSkills key={revision} api={api}/></>;
}
