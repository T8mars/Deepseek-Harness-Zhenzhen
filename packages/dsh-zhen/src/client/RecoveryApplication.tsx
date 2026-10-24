import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {RemoteResult} from '@deepseek-ai/dsh-typert-protocol';
import type {ZhenRemote,RecoveryApplicationReview,RecoveryApplicationStatus} from 'dsh-zhen/remote';
import {recoveryApplicationReviewSchema,recoveryApplicationStatusSchema} from 'dsh-zhen/remote';
import {useRemoteAction} from './useRemoteAction.ts';
const unwrap=<T,>(result:RemoteResult<T>):T=>{if(!result.ok)throw result.error;return result.value;};
function reason(error:unknown):string|undefined{return error&&typeof error==='object'&&'details'in error&&error.details&&typeof error.details==='object'&&'reason'in error.details&&typeof error.details.reason==='string'?error.details.reason:undefined;}
export function recoveryApplicationMessage(code:string|null|undefined):string{
 if(code==='BACKUP_BUSY')return '已有检查或恢复正在进行，请先查看该操作。';
 if(code==='BACKUP_APPLICATION_REVIEW_CHANGED'||code==='BACKUP_CANDIDATE_CHANGED')return '程序清单或恢复内容已变化，请重新检查后再确认。';
 if(code==='BACKUP_APPLICATION_PROGRAM_UNAVAILABLE')return '有程序尚未完整还原。请保留原备份，核对缺失项后再打开。';
 if(code==='BACKUP_HOST_PROFILE_UNAVAILABLE')return '请在完整的 DSH-zhen 应用中打开“备份与恢复”。';
 if(code==='BACKUP_APPLICATION_WORKSPACE_DISABLED')return '这份配置原本停用了工作区，请选择其他完整应用配置。';
 if(code==='BACKUP_APPLICATION_PROFILE_UNAVAILABLE')return '这份配置需要专用启动入口，请选择可打开的 Web 应用配置。';
 if(code==='BACKUP_APPLICATION_STATE_UNKNOWN')return '暂时无法确认原窗口状态。请先检查状态，这里不会重复打开。';
 if(code==='BACKUP_APPLICATION_ALREADY_OPENED')return '这份恢复副本已有打开记录，请检查原窗口状态。';
 if(code==='BACKUP_APPLICATION_AUTHORIZATION_UNAVAILABLE')return '无法保存本机启动授权，请检查应用数据目录的写入权限。';
 if(code==='BACKUP_APPLICATION_EXECUTION_CHANGED')return '恢复窗口已重新打开，请检查最新状态后再操作。';
 if(code?.startsWith('BACKUP_APPLICATION_CORE_')||code==='BACKUP_APPLICATION_CORE_FAILED')return '恢复应用有必需组件未能启动。请保留原备份和诊断编号，检查程序是否完整。';
 if(code==='BACKUP_APPLICATION_VERIFY_FAILED')return '恢复应用的目录或启动文件已变化。请保留原备份，重新检查恢复副本。';
 if(code==='BACKUP_APPLICATION_CHANNEL_FAILED')return '恢复窗口的本机控制通道未能启动，请检查诊断编号。';
 if(code==='BACKUP_APPLICATION_LISTENER_FAILED')return '恢复应用的本机页面未能就绪，请保留诊断编号。';
 if(code==='BACKUP_APPLICATION_CANCELLED')return '打开准备已取消。请保留原备份；需要时可重新生成恢复副本。';
 return '操作未完成，请保留原备份并检查当前状态。';
}
const phases:Record<NonNullable<RecoveryApplicationStatus['phase']>,string>={preparing:'正在检查并准备恢复应用…',starting:'正在启动恢复应用…',running:'恢复应用已就绪。',stopping:'正在关闭恢复应用…',exited:'恢复应用已关闭。',failed:'上次打开未完成，请查看诊断并保留原备份。',unknown:'暂时无法确认原窗口状态，请先检查状态。'};
export function RecoveryApplication({api,candidateId,disabled=false,onConsumedChange,onBusyChange}:{api:ZhenRemote;candidateId:string;disabled?:boolean;onConsumedChange?:(value:boolean)=>void;onBusyChange?:(value:boolean)=>void}):React.ReactElement{
 const[viewState,setView]=useState<RecoveryApplicationReview>(),[statusState,setStatus]=useState<RecoveryApplicationStatus>(),[approved,setApproved]=useState(false),[browser,setBrowser]=useState(true),[pending,setPending]=useState(false);
 const view=viewState?.candidateId===candidateId?viewState:undefined,status=statusState?.candidateId===candidateId?statusState:undefined;
 const scope=useRemoteAction(api,'恢复应用状态暂时无法读取。'),bound=useRef<{api:ZhenRemote;id:string}|undefined>(undefined),latest=useRef<{view:RecoveryApplicationReview|undefined;approved:boolean;browser:boolean;pending:boolean;disabled:boolean}|undefined>(undefined),generation=useRef(0);
 const supported=typeof api.backupApplicationStatus==='function'&&typeof api.backupApplicationReview==='function'&&typeof api.backupApplicationOpen==='function';
 useLayoutEffect(()=>{bound.current={api,id:candidateId};generation.current++;return()=>{bound.current=undefined;generation.current++;};},[api,candidateId]);
 useLayoutEffect(()=>{latest.current={view,approved,browser,pending,disabled};},[view,approved,browser,pending,disabled]);
 const current=()=>bound.current?.api===api&&bound.current.id===candidateId;
 useEffect(()=>{setView(undefined);setStatus(undefined);setApproved(false);setPending(false);let alive=true;const version=generation.current;if(supported)void api.backupApplicationStatus(candidateId).then(value=>{const parsed=recoveryApplicationStatusSchema.parse(unwrap(value));if(alive&&current()&&version===generation.current)receiveStatus(parsed);}).catch(()=>{if(alive&&current())scope.setNotice('恢复应用状态暂时无法读取，可以点击“检查状态”。');});return()=>{alive=false;};},[api,candidateId]);
 useEffect(()=>{onConsumedChange?.(status?.consumed===true);},[onConsumedChange,status?.consumed]);
 const preparing=status?.phase==='preparing'||status?.phase==='starting'||status?.phase==='stopping';
 useEffect(()=>{onBusyChange?.(scope.busy||preparing);return()=>onBusyChange?.(false);},[onBusyChange,scope.busy,preparing]);
 useEffect(()=>{if(!supported||!status?.consumed||status.phase==='exited'||status.phase==='failed')return;let alive=true,inFlight=false;const version=generation.current;const refresh=async()=>{if(!alive||inFlight||!current())return;inFlight=true;try{const parsed=recoveryApplicationStatusSchema.parse(unwrap(await api.backupApplicationStatus(candidateId)));if(alive&&current()&&version===generation.current)receiveStatus(parsed);}catch{/* Keep the last facts; only an explicit query can establish shutdown. */}finally{inFlight=false;}};const timer=setInterval(()=>void refresh(),2000);return()=>{alive=false;clearInterval(timer);};},[api,candidateId,status?.consumed,status?.phase,supported]);
 function receiveStatus(value:RecoveryApplicationStatus):void{if(!current()||value.candidateId!==candidateId)return;setStatus(value);if(value.consumed){setPending(false);if(latest.current)latest.current.pending=false;scope.setNotice('');}}
 async function inspect(profile='',page=0,review:string|null=null):Promise<void>{if(!current()||latest.current?.pending||latest.current?.disabled)return;setApproved(false);if(latest.current)latest.current.approved=false;await scope.run(async valid=>{try{const value=recoveryApplicationReviewSchema.parse(unwrap(await api.backupApplicationReview({candidateId,profile,page,review})));if(valid()&&current()){setView(value);receiveStatus(value.status);}}catch(error){if(valid()&&current())scope.setNotice(recoveryApplicationMessage(reason(error)));}});}
 async function refresh():Promise<void>{if(!current())return;await scope.run(async valid=>{try{const value=recoveryApplicationStatusSchema.parse(unwrap(await api.backupApplicationStatus(candidateId)));if(valid()&&current())receiveStatus(value);}catch{if(valid()&&current())scope.setNotice('原应用状态仍不明确，请保留当前记录并继续检查。');}});}
 async function open(reopen=false):Promise<void>{
  const saved=latest.current;if(!current()||!saved||saved.pending||saved.disabled||!reopen&&(!saved.approved||saved.view!==view||!view?.canOpen))return;
  await scope.run(async valid=>{
   let reviewed=saved.view;if(reopen){try{reviewed=recoveryApplicationReviewSchema.parse(unwrap(await api.backupApplicationReview({candidateId,profile:status?.profile??'',page:0,review:null})));if(!valid()||!current()||!reviewed.status.canReopen)return;}catch(error){if(valid()&&current())scope.setNotice(recoveryApplicationMessage(reason(error)));return;}}
   if(!reviewed?.selected||!reviewed.review||!valid()||!current())return;setPending(true);if(latest.current)latest.current.pending=true;
   try{const value=recoveryApplicationStatusSchema.parse(unwrap(await api.backupApplicationOpen({candidateId,requestId:crypto.randomUUID(),profile:reviewed.selected,review:reviewed.review,approved:true,openBrowser:saved.browser})));if(valid()&&current()){receiveStatus(value);setPending(false);if(latest.current)latest.current.pending=false;}}
   catch(error){if(valid()&&current()){const code=reason(error);if(code&&['BACKUP_BUSY','BACKUP_APPLICATION_REVIEW_CHANGED','BACKUP_CANDIDATE_CHANGED','BACKUP_APPLICATION_PROGRAM_UNAVAILABLE','BACKUP_APPLICATION_AUTHORIZATION_UNAVAILABLE'].includes(code)){setPending(false);setApproved(false);if(latest.current){latest.current.pending=false;latest.current.approved=false;}scope.setNotice(recoveryApplicationMessage(code));}else scope.setNotice('打开回执未收到。请检查原应用状态，不要重复打开。');}}
  });
 }
 async function control(operation:'show'|'stop'):Promise<void>{if(!current()||!status?.execution)return;await scope.run(async valid=>{try{const value=recoveryApplicationStatusSchema.parse(unwrap(await api.backupApplicationControl({candidateId,execution:status.execution!,operation})));if(valid()&&current())receiveStatus(value);}catch(error){if(valid()&&current())scope.setNotice(recoveryApplicationMessage(reason(error)));}});}
 const cancelCurrent=scope.capture();
 return <section className="zhen-backup-component" aria-label="打开恢复应用">
  <div className="zhen-section-heading"><h2>打开恢复应用</h2><button type="button" className="zhen-secondary" disabled={scope.busy||!supported} onClick={()=>void refresh()}>检查状态</button></div>
  {!supported&&<p role="status">当前服务不支持这个入口，请更新 DSH-zhen 后再打开恢复副本。</p>}
  {scope.busy&&!status?.consumed&&<><p role="status">正在核对或准备恢复副本，请稍候…</p><button type="button" className="zhen-secondary" disabled={typeof api.backupCancel!=='function'} onClick={()=>{if(!current()||!cancelCurrent())return;void api.backupCancel(candidateId).catch(()=>{if(current()&&cancelCurrent())scope.setNotice('取消请求未确认，请检查原操作状态。');});}}>取消本次检查</button></>}
  {status?.consumed?<><p role="status">{status.phase?phases[status.phase]:''}</p><p>这是独立的恢复副本，原备份保留。后续可在恢复应用中继续设置和备份。</p><div className="zhen-actions zhen-wrap"><button type="button" className="zhen-primary" disabled={scope.busy||!status.ready} onClick={()=>void control('show')}>显示窗口</button>{status.canReopen&&<button type="button" className="zhen-primary" disabled={scope.busy||pending||disabled} onClick={()=>void open(true)}>重新打开这个副本</button>}{['preparing','starting','running','unknown'].includes(status.phase??'')&&<button type="button" className="zhen-secondary" disabled={scope.busy} onClick={()=>void control('stop')}>{status.phase==='preparing'?'取消打开准备':'关闭恢复应用'}</button>}</div>{status.error&&<><p role="status">{recoveryApplicationMessage(status.error)}</p><details><summary>查看诊断编号</summary><code>{status.error}</code></details></>}</>:<>
   <p>先检查恢复的程序来源，再确认打开。工具权限从只读、逐次询问开始；API 密钥需在恢复应用中重新填写。</p>
   <button type="button" className="zhen-secondary" disabled={scope.busy||pending||disabled||!supported} onClick={()=>void inspect()}>检查恢复应用</button>
   {view&&<><label className="zhen-label">应用配置<select className="zhen-input" value={view.selected??''} disabled={scope.busy||pending||disabled} onChange={event=>{if(latest.current)latest.current.approved=false;setApproved(false);void inspect(event.currentTarget.value);}}>{view.profiles.map(item=><option key={item.name} value={item.name} disabled={!item.available}>{item.title}{item.available?'':'（需要专用入口）'}</option>)}</select></label><p>共 {view.totalPrograms} 个程序。停用项目会保持停用；定时任务和历史访问授权不会随打开自动恢复。</p>{view.unresolvedPrograms>0&&<p role="status">{view.unresolvedPrograms} 个程序尚未完整还原，暂时无法打开。</p>}<details><summary>查看程序来源（第 {view.page+1} 页）</summary><ul>{view.programs.map(item=><li key={item.id}>{item.name}{item.version?' · '+item.version:''} · {item.origin==='installed'?'当前安装':item.origin==='restored'?'恢复目录':'来源未就绪'} · {item.enabled?'启用':'停用'}</li>)}</ul><div className="zhen-actions zhen-wrap">{view.page>0&&<button type="button" className="zhen-secondary" disabled={scope.busy||pending||disabled} onClick={()=>void inspect(view.selected??'',0,view.review)}>程序首页</button>}{view.nextPage!==null&&<button type="button" className="zhen-secondary" disabled={scope.busy||pending||disabled} onClick={()=>void inspect(view.selected??'',view.nextPage!,view.review)}>下一页程序</button>}</div></details><label className="zhen-checkbox"><input type="checkbox" checked={approved} disabled={scope.busy||pending||disabled||!view.canOpen} onChange={event=>{const value=event.currentTarget.checked;if(latest.current)latest.current.approved=value;setApproved(value);}}/>我已核对程序来源，允许在这个恢复副本中加载这些程序并正常保存设置。</label><label className="zhen-checkbox"><input type="checkbox" checked={browser} disabled={scope.busy||pending||disabled} onChange={event=>{const value=event.currentTarget.checked;if(latest.current)latest.current.browser=value;setBrowser(value);}}/>启动就绪后打开浏览器窗口</label><button type="button" className="zhen-primary" disabled={scope.busy||pending||disabled||!approved||!view.canOpen} onClick={()=>void open()}>确认并打开恢复应用</button></>}
  </>}
  {pending&&<p role="status">正在等待原打开请求的回执，请使用“检查状态”继续查看。</p>}{scope.notice&&<p role="status">{scope.notice}</p>}
 </section>;
}
