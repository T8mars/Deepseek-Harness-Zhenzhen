import React,{useEffect,useRef,useState} from 'react';
import type {RemoteResult} from '@deepseek-ai/dsh-typert-protocol';
import type {ZhenRemote,BackupInfo,BackupFiles,BackupJob,BackupComponent} from 'dsh-zhen/remote';
import {backupLabels,backupInfoSchema,backupFilesSchema,backupJobSchema} from 'dsh-zhen/remote';
import {DirectoryChooser} from './DirectoryChooser.tsx';
import {useRemoteAction} from './useRemoteAction.ts';

const unwrap=<T,>(value:RemoteResult<T>):T=>{if(!value.ok)throw value.error;return value.value;};
const terminal=(job:BackupJob)=>['succeeded','failed','cancelled'].includes(job.phase);
const phases:Record<BackupJob['phase'],string>={preparing:'准备数据',capturing:'加密备份',verifying:'校验完整性',restoring:'生成恢复候选',succeeded:'已完成',failed:'未完成',cancelled:'已取消'};
export function backupErrorMessage(code:string|null):string{
  if(code==='BACKUP_AUTHENTICATION_FAILED')return '密码不正确或文件已损坏。请核对密码，保留原备份文件。';
  if(code==='BACKUP_PASSWORD_INVALID')return '请使用至少 12 个字符、最多 1024 字节的备份密码。';
  if(code==='BACKUP_SOURCE_CHANGED')return '备份期间数据发生了变化。请等待当前创作完成后重新备份。';
  if(code==='BACKUP_BUSY')return '已有备份或恢复正在进行，请先查看该任务。';
  if(code==='BACKUP_COMPONENT_UNAVAILABLE'||code==='BACKUP_HOST_SERVICES_UNAVAILABLE')return '所选数据服务当前不可用，请重新检测。未读取到的数据不会作为空数据备份。';
  if(code==='BACKUP_FOLDER_UNAVAILABLE'||code==='BACKUP_PATH_INVALID')return '文件夹不可用，请重新选择有读写权限的本机文件夹。';
  if(code==='BACKUP_JOB_NOT_FOUND')return '当前连接中找不到这项任务。请先检查文件列表，应用重启后不会自动重做。';
  return '操作未完成。原数据未切换；请保留原备份并检查目录、磁盘空间与所选数据服务。';
}
/** No archive bytes, session contents, password persistence or Agent tool path. */
export function BackupCenter({api}:{api:ZhenRemote}):React.ReactElement{
  const[info,setInfo]=useState<BackupInfo>(),[folder,setFolder]=useState(''),[target,setTarget]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[components,setComponents]=useState<BackupComponent[]>([]),[listing,setListing]=useState<{folder:string;value:BackupFiles}>(),[selected,setSelected]=useState(''),[job,setJob]=useState<BackupJob>(),[pending,setPending]=useState<string>();
  const scope=useRemoteAction(api,'本机备份服务暂时不可用，请重新检测。'),active=!!job&&!terminal(job),locked=scope.busy||active,folderRef=useRef(folder);folderRef.current=folder;
  useEffect(()=>{setInfo(undefined);setListing(undefined);setSelected('');setJob(undefined);setPending(undefined);setPassword('');setRepeat('');let alive=true;void api.backupInfo().then(result=>{const value=backupInfoSchema.parse(unwrap(result));if(!alive)return;setInfo(value);setFolder(value.folder);setTarget('');setComponents(value.components.filter(row=>row.available).map(row=>row.id));setJob(value.jobs.find(row=>!terminal(row))??value.jobs.at(-1));}).catch(()=>{if(alive)scope.setNotice('备份服务暂时不可用，请重新检测。');});return()=>{alive=false;};},[api]);
  useEffect(()=>{if(!job||terminal(job))return;let stopped=false,inFlight=false;const id=job.id;async function refresh(){if(inFlight||stopped)return;inFlight=true;try{const next=backupJobSchema.parse(unwrap(await api.backupStatus(id)));if(!stopped){setJob(next);if(terminal(next)){setPassword('');setRepeat('');}}}catch{if(!stopped){stopped=true;scope.setNotice('进度暂时无法读取。任务可能仍在原连接运行，请点击重新检测；不会自动重试创建。');}}finally{inFlight=false;}}const timer=setInterval(()=>void refresh(),1000);void refresh();return()=>{stopped=true;clearInterval(timer);};},[api,job?.id,job?.phase]);
  async function refreshInfo():Promise<void>{await scope.run(async current=>{const value=backupInfoSchema.parse(unwrap(await api.backupInfo()));if(!current())return;setInfo(value);setComponents(previous=>previous.filter(id=>value.components.some(row=>row.id===id&&row.available)));setJob(value.jobs.find(row=>!terminal(row))??value.jobs.at(-1));setPending(undefined);if(!folderRef.current)setFolder(value.folder);});}
  async function files():Promise<void>{const input=folder;await scope.run(async current=>{const value=backupFilesSchema.parse(unwrap(await api.backupFiles(input)));if(current()&&folderRef.current===input){setListing({folder:input,value});setSelected('');}});}
  async function start(operation:'backup'|'restore'):Promise<void>{
    await scope.run(async current=>{const id=crypto.randomUUID(),secret=password;setPassword('');setRepeat('');setPending(id);let value:BackupJob;
      try{value=backupJobSchema.parse(unwrap(operation==='backup'?await api.backupCreate({id,folder,password:secret,components}):await api.backupRestore({id,folder,name:selected,password:secret,target})));}
      catch{try{value=backupJobSchema.parse(unwrap(await api.backupStatus(id)));}catch{if(current())scope.setNotice('请求回执未收到。请检查原任务，不要重复点击创建。');return;}}
      if(current()){setJob(value);setPending(undefined);}
    });
  }
  const list=listing?.folder===folder?listing.value:undefined,validPassword=password.length>=12&&new TextEncoder().encode(password).length<=1024;
  return <div className="zhen-settings">
    <section className="zhen-card"><div className="zhen-section-heading"><h2>备份与恢复</h2><button type="button" className="zhen-secondary" disabled={locked} onClick={()=>void refreshInfo()}>重新检测</button></div>
      <p>先选择要保存的数据，再设置备份密码。恢复会生成一个独立候选目录，完成校验后供你审阅。</p>
      <p className="zhen-muted">API 令牌不进入备份。请自行保存备份密码，应用无法找回。</p>
      <label className="zhen-label">备份文件夹<input className="zhen-input" value={folder} disabled={locked} maxLength={4096} onChange={event=>{setFolder(event.currentTarget.value);setSelected('');}}/></label>
      <DirectoryChooser api={api} value={folder} onChoose={setFolder} scopeKey="backup-folder" disabled={locked}/>
      <fieldset disabled={locked} className="zhen-backup-selection"><legend>本次备份内容</legend>{info?.components.map(row=><label className="zhen-checkbox" key={row.id}><input type="checkbox" checked={components.includes(row.id)} disabled={!row.available||locked} onChange={event=>{const checked=event.currentTarget.checked;setComponents(previous=>checked?[...previous,row.id]:previous.filter(id=>id!==row.id));}}/>{backupLabels[row.id]}{!row.available&&<span>（当前服务未就绪，请先打开相应功能后重新检测）</span>}</label>)}</fieldset>
      <p className="zhen-muted">当前为所选范围备份，尚不覆盖：{(info?.limitations??[]).join('、')}。生成记录保留作品索引，本入口暂不复制作品原件。</p>
      <label className="zhen-label">备份或恢复密码<input className="zhen-input" type="password" value={password} disabled={locked} autoComplete="off" spellCheck={false} maxLength={1024} onChange={event=>setPassword(event.currentTarget.value)}/></label>
      <label className="zhen-label">新建备份时再次输入密码<input className="zhen-input" type="password" value={repeat} disabled={locked} autoComplete="off" spellCheck={false} maxLength={1024} onChange={event=>setRepeat(event.currentTarget.value)}/></label>
      <button type="button" className="zhen-primary" disabled={locked||!!pending||!folder||!components.length||!validPassword||password!==repeat} onClick={()=>void start('backup')}>创建加密备份</button>
    </section>
    <section className="zhen-card"><div className="zhen-section-heading"><h2>从备份恢复</h2><button type="button" className="zhen-secondary" disabled={locked||!folder} onClick={()=>void files()}>查看备份文件</button></div>
      {list&&<><label className="zhen-label">选择备份<select className="zhen-input" value={selected} disabled={locked} onChange={event=>setSelected(event.currentTarget.value)}><option value="">请选择</option>{list.files.map(file=><option key={file.name} value={file.name}>{new Date(file.modified).toLocaleString()} · {(file.bytes/1024**2).toFixed(1)} MB · {file.name}</option>)}</select></label>{!list.files.length&&<p>此文件夹没有可识别的备份文件。</p>}{list.truncated&&<p role="status">列表未完整显示，请将所需备份放在单独文件夹中再选择。</p>}</>}
      <label className="zhen-label">恢复候选存放文件夹<input className="zhen-input" value={target} disabled={locked} maxLength={4096} onChange={event=>setTarget(event.currentTarget.value)}/></label>
      <DirectoryChooser api={api} value={target} onChoose={setTarget} scopeKey="backup-recovery-target" disabled={locked}/>
      <p className="zhen-muted">使用上方密码解密。恢复会校验整份备份，并在所选文件夹新建目录；不会切换应用、启用旧授权或重交生成任务。</p>
      <button type="button" className="zhen-secondary" disabled={locked||!!pending||!list||!selected||!target||!validPassword} onClick={()=>void start('restore')}>校验并生成恢复候选</button>
    </section>
    {job&&<section className="zhen-card" aria-label="备份任务"><p role="status">{job.operation==='backup'?'备份':'恢复'}：{phases[job.phase]}{job.component?' · '+backupLabels[job.component]:''}（{job.completed}/{job.total}）</p>{job.output&&<><p>{job.operation==='backup'?'文件已保存至：':'候选已生成，尚未激活：'}</p><p className="zhen-source-path">{job.output}</p></>}{job.error&&<p role="status">{backupErrorMessage(job.error)} <span className="zhen-muted">{job.error}</span></p>}{active&&<button type="button" className="zhen-secondary" disabled={scope.busy} onClick={()=>void scope.run(async()=>{unwrap(await api.backupCancel(job.id));})}>取消此任务</button>}</section>}
    {pending&&<div role="status"><p>请求编号：{pending}</p><button type="button" className="zhen-secondary" disabled={scope.busy} onClick={()=>void scope.run(async current=>{try{const value=backupJobSchema.parse(unwrap(await api.backupStatus(pending)));if(current()){setJob(value);setPending(undefined);}}catch{if(current())scope.setNotice('原任务状态仍不明确，请先检查文件列表或重新检测。');}})}>检查原任务</button></div>}
    {scope.notice&&<p role="status">{scope.notice}</p>}
  </div>;
}
