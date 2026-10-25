import React,{useEffect,useRef,useState} from 'react';
import type {ConfigForm,ConfigFormSnapshot,SettingsOnboardingOwnerProps} from '@deepseek-ai/dsh-client-ui-settings/client';
import {BrandMark} from './Art.tsx';

export const COMMUNITY_NOTICE_VERSION='dsh-zhen-2026-10-26.1';
type NoticeSettings={welcomeNoticeVersion?:string};
export type CommunityWelcomeProps=SettingsOnboardingOwnerProps&{form:ConfigForm<NoticeSettings>};

/** Replace only the documented welcome-notice cell. Acknowledgement is an explicit public settings write. */
export function CommunityWelcome({form,complete,explicit=false}:CommunityWelcomeProps):React.ReactElement|null{
  const [loaded,setLoaded]=useState<{form:ConfigForm<NoticeSettings>;snapshot:ConfigFormSnapshot<NoticeSettings>}>(()=>({form,snapshot:form.getSnapshot()}));
  const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false),version=useRef(0),working=useRef(false),surface=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),latest=useRef({form,complete});latest.current={form,complete};
  const snapshot=loaded.form===form?loaded.snapshot:form.getSnapshot();
  const acknowledged=snapshot.status==='ready'&&snapshot.value?.welcomeNoticeVersion===COMMUNITY_NOTICE_VERSION;
  const visible=snapshot.status!=='loading'&&(!acknowledged||explicit);
  useEffect(()=>{
    const epoch=++version.current;working.current=false;setBusy(false);setFailed(false);
    const sync=()=>{if(version.current===epoch)setLoaded({form,snapshot:form.getSnapshot()});};sync();const dispose=form.subscribe(sync);
    return()=>{version.current++;dispose();};
  },[form]);
  useEffect(()=>{if(acknowledged&&!explicit)complete();},[acknowledged,explicit,complete]);
  useEffect(()=>{
    if(!visible)return;const dialog=surface.current;if(!dialog)return;
    if(!dialog.open)dialog.showModal();heading.current?.focus();
    return()=>{if(dialog.open)dialog.close();};
  },[visible]);
  async function acknowledge():Promise<void>{
    if(explicit&&acknowledged){complete();return;}
    if(working.current||snapshot.status!=='ready'||!snapshot.writable)return;
    working.current=true;setBusy(true);setFailed(false);const epoch=version.current;
    try{
      const accepted=await form.set('welcomeNoticeVersion',COMMUNITY_NOTICE_VERSION);
      if(epoch!==version.current||latest.current.form!==form)return;
      const current=form.getSnapshot();setLoaded({form,snapshot:current});
      if(!accepted||current.status!=='ready'||current.value?.welcomeNoticeVersion!==COMMUNITY_NOTICE_VERSION)setFailed(true);
      else if(explicit)latest.current.complete();
    }catch{if(epoch===version.current&&latest.current.form===form)setFailed(true);}
    finally{if(epoch===version.current&&latest.current.form===form){working.current=false;setBusy(false);}}
  }
  if(!visible)return null;
  return <dialog className="zhen-workspace zhen-card zhen-welcome-dialog" aria-labelledby="zhen-welcome-title" aria-describedby="zhen-welcome-copy" ref={surface} onCancel={event=>{event.preventDefault();if(!busy)complete();}}>
    <div className="zhen-section-heading"><h2 id="zhen-welcome-title" ref={heading} tabIndex={-1}><BrandMark size={24}/> 欢迎来到 DSH-zhen</h2><span>社区预览版</span></div>
    <div id="zhen-welcome-copy"><p>把创作想法、技能和资料放在一个工作空间。默认使用 Seedance 网关的 DeepSeek V4.1 Flash，可连接 T8 贞贞无限画布。</p>
      <p>当前仍在完善中。升级前可以备份；恢复后的资料和版本选择会保留，技能与画布连接需要按提示重新审阅。</p>
      <p>模型调用和画布生成可能产生费用。请在生成前核对方案、模型与费用提示；画布操作由画布窗口确认。</p>
      <p className="zhen-muted">非官方社区修改版，与 DeepSeek 无隶属关系。基于 DeepSeek Harness（DSH）构建，保留上游 MIT 声明。</p></div>
    {(failed||snapshot.status==='unavailable'||!snapshot.writable)&&<p className="zhen-notice" role="status">暂时无法保存已读状态。可以稍后继续；下次打开仍会显示这份说明。</p>}
    <div className="zhen-actions zhen-wrap"><button type="button" className="zhen-secondary" disabled={busy} onClick={()=>complete()}>稍后提醒</button><button type="button" className="zhen-primary" disabled={busy||snapshot.status!=='ready'||!snapshot.writable} onClick={()=>void acknowledge()}>{busy?'正在保存…':'我已了解，开始创作'}</button></div>
  </dialog>;
}
