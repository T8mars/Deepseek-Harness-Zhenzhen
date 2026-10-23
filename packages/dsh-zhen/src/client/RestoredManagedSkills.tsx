import React,{useEffect,useRef,useState} from 'react';
import type {RemoteResult} from '@deepseek-ai/dsh-typert-protocol';
import type {ZhenRemote,RestoredManagedSkillView} from 'dsh-zhen/remote';
import {RESTORED_MANAGED_SKILL_POLICY,restoredManagedSkillView} from 'dsh-zhen/remote';
import {useRemoteAction} from './useRemoteAction.ts';
const unwrap=<T,>(result:RemoteResult<T>):T=>{if(!result.ok)throw result.error;return result.value;};
const labels={market:'技能市场',local:'本地导入',github:'GitHub 来源'};
export function RestoredManagedSkills({api}:{api:ZhenRemote}):React.ReactElement|null{
  const [loaded,setLoaded]=useState<{api:ZhenRemote;value:RestoredManagedSkillView}>(),[confirmed,setConfirmed]=useState(''),[failed,setFailed]=useState(false);
  const scope=useRemoteAction(api),version=useRef(0),value=loaded?.api===api?loaded.value:undefined,latest=useRef({api,value,confirmed});latest.current={api,value,confirmed};
  useEffect(()=>{const current=++version.current;setLoaded(undefined);setConfirmed('');setFailed(false);if(typeof api.restoredManagedSkillConsent!=='function')return;void api.restoredManagedSkillConsent(0).then(reply=>{const result=restoredManagedSkillView.parse(unwrap(reply));if(version.current===current)setLoaded({api,value:result});}).catch(()=>{if(version.current===current)setFailed(true);});return()=>{version.current++;};},[api]);
  async function load(page=0):Promise<void>{if(latest.current.api!==api)return;const expected=latest.current.value;await scope.run(async active=>{const current=++version.current;setConfirmed('');try{const result=restoredManagedSkillView.parse(unwrap(await api.restoredManagedSkillConsent(page)));if(!active()||version.current!==current)return;if(result.page!==page||page>0&&(result.snapshot!==expected?.snapshot||result.profile!==expected?.profile))throw Error();setLoaded({api,value:result});setFailed(false);}catch{if(active()&&version.current===current){setLoaded(undefined);setFailed(true);scope.setNotice('恢复来源暂时不可用或已经变化。请重新检查；必要时重新打开对应恢复应用，原始备份保留。');}}});}
  async function change(key:string,action:'approve'|'revoke'):Promise<void>{
    const selected=latest.current.value,row=selected?.items.find(row=>row.key===key);if(latest.current.api!==api||selected?.snapshot!==value?.snapshot||selected?.profile!==value?.profile||!selected?.snapshot||!row||action==='approve'&&(!row.eligible||latest.current.confirmed!==key))return;
    await scope.run(async active=>{const current=++version.current;setConfirmed('');setLoaded(undefined);try{const result=restoredManagedSkillView.parse(unwrap(await api.restoredManagedSkillConsentChange({snapshot:selected.snapshot!,key,action,confirmation:RESTORED_MANAGED_SKILL_POLICY})));if(!active()||version.current!==current)return;if(result.profile!==selected.profile||!result.available||result.items.find(item=>item.key===key)?.approved!==(action==='approve'))throw Error();setLoaded({api,value:result});setFailed(false);scope.setNotice(action==='approve'?'此来源的原有技能已允许调用，自动更新仍暂停。':'此来源已暂停，缓存与正在读取的技能都会重新检查。');}catch{if(active()&&version.current===current){setFailed(true);scope.setNotice('本次结果尚未确认，请点击“检查管理来源”读取实际状态；不会自动重复提交。');}}});
  }
  if(typeof api.restoredManagedSkillConsent!=='function'||value?.reason==='not-restored')return null;
  if(!value&&!failed&&!scope.busy&&!scope.notice)return null;
  return <section className="zhen-card" aria-label="恢复管理来源审阅">
    <div className="zhen-section-heading"><h2>恢复来源审阅</h2><span>市场 · 本地导入 · GitHub</span></div>
    {value?.reason==='profile-unavailable'&&<p role="status">当前窗口缺少恢复配置入口。请在对应的完整恢复应用中审阅，原始备份保留。</p>}
    {value?.available&&<>
      <p>当前配置：<strong>{value.profile}</strong>，共 {value.total} 个管理来源。每次明确允许一个来源的原有版本，原来停用的项继续停用。</p>
      <p className="zhen-muted">技能可以向会话提供提示词和读取附带资源；本地导入延续原目录及后续修改的信任范围。待更新版本、下载和自动更新继续暂停；程序、模型、画布审批与整个应用的激活分别处理。</p>
      {!value.total&&<p>这份恢复副本没有管理来源，无需放行。</p>}
      {value.items.map(row=><div className="zhen-card" key={row.key}>
        <p><strong>{row.name}</strong> · {labels[row.kind]} · {row.approved?'已允许':row.eligible?'等待审阅':row.enabled?'没有原活动版本':'原来已停用'}</p>
        {row.version&&<p className="zhen-source-path">原活动版本：{row.version}</p>}{row.location&&<p className="zhen-source-path">来源位置：{row.location}</p>}
        {!row.approved&&row.eligible&&<label className="zhen-label"><input type="checkbox" checked={confirmed===row.key} disabled={scope.busy} onChange={event=>setConfirmed(event.currentTarget.checked?row.key:'')}/>我已核对此来源，允许它的原有技能与附带资源在当前配置中使用。</label>}
        <button type="button" className={row.approved?'zhen-secondary':'zhen-primary'} disabled={scope.busy||!row.approved&&(!row.eligible||confirmed!==row.key)} onClick={()=>void change(row.key,row.approved?'revoke':'approve')}>{row.approved?'暂停此来源':'允许此来源'}</button>
      </div>)}
      <div className="zhen-actions zhen-wrap"><button type="button" className="zhen-secondary" disabled={scope.busy||value.page===0} onClick={()=>void load(value.page-1)}>上一页管理来源</button><span>第 {value.page+1} 页</span><button type="button" className="zhen-secondary" disabled={scope.busy||value.nextPage===null} onClick={()=>value.nextPage!==null&&void load(value.nextPage)}>下一页管理来源</button></div>
    </>}
    <button type="button" className="zhen-secondary" disabled={scope.busy} onClick={()=>void load()}>检查管理来源</button>
    {scope.notice&&<p role="status">{scope.notice}</p>}{failed&&!scope.notice&&<p role="status">恢复来源状态暂时不可用，请重新检查。原始备份保留。</p>}
  </section>;
}
