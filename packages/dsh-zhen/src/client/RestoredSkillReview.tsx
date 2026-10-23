import React,{useEffect,useRef,useState} from 'react';
import type {RemoteResult} from '@deepseek-ai/dsh-typert-protocol';
import type {ZhenRemote,RestoredSkillConsentView} from 'dsh-zhen/remote';
import {RESTORED_SKILL_CONSENT_POLICY,restoredSkillConsentViewSchema} from 'dsh-zhen/remote';
import {useRemoteAction} from './useRemoteAction.ts';

const unwrap=<T,>(value:RemoteResult<T>):T=>{if(!value.ok)throw value.error;return value.value;};
export function RestoredSkillReview({api}:{api:ZhenRemote}):React.ReactElement|null{
  const [loaded,setLoaded]=useState<{api:ZhenRemote;value:RestoredSkillConsentView}>(),[accepted,setAccepted]=useState(false),[failed,setFailed]=useState(false);
  const version=useRef(0),scope=useRemoteAction(api,'恢复技能状态暂时无法读取，请重新检查。'),latest=useRef({api,loaded,accepted});latest.current={api,loaded,accepted};
  const value=loaded?.api===api?loaded.value:undefined;
  useEffect(()=>{
    const current=++version.current;setLoaded(undefined);setAccepted(false);setFailed(false);
    if(typeof api.restoredSkillConsent!=='function')return;
    void api.restoredSkillConsent(0).then(reply=>{const result=restoredSkillConsentViewSchema.parse(unwrap(reply));if(version.current===current){setLoaded({api,value:result});setFailed(false);}}).catch(()=>{if(version.current===current)setFailed(true);});
    return()=>{version.current++;};
  },[api]);
  async function load(page=0):Promise<void>{
    if(latest.current.api!==api)return;const expected=latest.current.loaded?.api===api?latest.current.loaded.value:undefined;
    await scope.run(async active=>{setAccepted(false);const current=++version.current;try{const result=restoredSkillConsentViewSchema.parse(unwrap(await api.restoredSkillConsent(page)));if(!active()||version.current!==current)return;if(result.page!==page||page>0&&(result.snapshot!==expected?.snapshot||result.profile!==expected?.profile)){setLoaded(undefined);setFailed(true);scope.setNotice('恢复来源已变化，请重新检查后审阅。');return;}setLoaded({api,value:result});setFailed(false);}catch{if(active()&&version.current===current){setLoaded(undefined);setFailed(true);scope.setNotice('恢复技能状态暂时无法读取，请重新检查。原备份保留。');}}});
  }
  async function change(action:'approve'|'revoke'):Promise<void>{
    const selected=latest.current.loaded;if(latest.current.api!==api||selected?.api!==api||selected.value.snapshot!==value?.snapshot||selected.value.profile!==value?.profile||!selected.value.available||!selected.value.snapshot||action==='approve'&&!latest.current.accepted)return;
    const source=selected.value;
    await scope.run(async active=>{
      setAccepted(false);const current=++version.current;setLoaded(undefined);
      try{const result=restoredSkillConsentViewSchema.parse(unwrap(await api.restoredSkillConsentChange({snapshot:source.snapshot!,action,confirmation:RESTORED_SKILL_CONSENT_POLICY})));if(!active()||version.current!==current)return;if(result.profile!==source.profile||!result.available||result.approved!==(action==='approve'))throw Error();setLoaded({api,value:result});setFailed(false);scope.setNotice(action==='approve'?'这些恢复技能已允许；项目技能按已关联的项目调用。':'这些恢复技能已暂停，已缓存的技能也会重新检查权限。');}
      catch{if(active()&&version.current===current){setFailed(true);scope.setNotice('操作结果尚未确认，请点击“检查恢复技能”读取当前状态。这里不会自动重试。');}}
    });
  }
  if(typeof api.restoredSkillConsent!=='function'||value&&!value.available&&!failed)return null;
  if(!value&&!failed&&!scope.busy&&!scope.notice)return null;
  return <section className="zhen-card" aria-label="恢复技能审阅">
    <div className="zhen-section-heading"><h2>恢复技能审阅</h2><span>{value?.approved?'已允许':'等待审阅'}</span></div>
    {value?.available&&<>
      <p>当前配置：<strong>{value.profile}</strong>。共有 {value.totalProviders} 个文件夹来源，其中 {value.enabledProviders} 个原来已启用，关联 {value.totalProjects} 个项目。</p>
      <p>允许后，技能可向会话提供提示词并读取自己的附带资源。全局来源保留原作用范围，项目技能仅在对应项目使用。原来禁用的来源继续停用，其他配置需要分别审阅。</p>
      <p className="zhen-muted">市场、本地导入和 GitHub 管理来源仍待审阅，自动更新保持暂停。目录访问、模型调用、画布审批与整个应用的激活分别处理。</p>
      <details><summary>查看来源与项目（第 {value.page+1} 页）</summary>
        {value.providers.map(row=><div key={row.id}><p><strong>{row.name}</strong> · {row.enabled?'原来已启用':'原来已停用'}</p>{row.roots.map((path,index)=><p className="zhen-source-path" key={index}>{path}</p>)}</div>)}
        {value.projects.map(row=><div key={row.directory}><p className="zhen-source-path">原项目：{row.originalDirectory}</p><p className="zhen-source-path">现在使用：{row.directory}</p></div>)}
      </details>
      <div className="zhen-actions zhen-wrap">
        <button type="button" className="zhen-secondary" disabled={scope.busy||value.page===0} onClick={()=>void load(value.page-1)}>上一页来源</button>
        <button type="button" className="zhen-secondary" disabled={scope.busy||value.nextPage===null} onClick={()=>value.nextPage!==null&&void load(value.nextPage)}>下一页来源</button>
      </div>
      {!value.approved&&<label className="zhen-label"><input type="checkbox" checked={accepted} disabled={scope.busy} onChange={event=>setAccepted(event.currentTarget.checked)}/>我已核对上述来源与项目范围，允许当前配置原来已启用的文件夹技能。</label>}
      <div className="zhen-actions zhen-wrap">
        {!value.approved&&<button type="button" className="zhen-primary" disabled={scope.busy||!accepted||!value.enabledProviders} onClick={()=>void change('approve')}>允许这些恢复技能</button>}
        {value.approved&&<button type="button" className="zhen-secondary" disabled={scope.busy} onClick={()=>void change('revoke')}>暂停这些恢复技能</button>}
      </div>
      <p className="zhen-muted">审阅后副本的文件基线会变化；原始备份和恢复组件保留。再次从备份恢复时需要重新审阅。</p>
    </>}
    <button type="button" className="zhen-secondary" disabled={scope.busy} onClick={()=>void load()}>检查恢复技能</button>
    {scope.notice&&<p role="status">{scope.notice}</p>}{failed&&!scope.notice&&<p role="status">恢复技能状态暂时无法读取，请重新检查。</p>}
  </section>;
}
