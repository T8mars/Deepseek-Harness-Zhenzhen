import React,{useEffect,useRef,useState} from 'react';
import type {ZhenRemote} from 'dsh-zhen/remote';
import type {RagBackendStatus} from 'dsh-zhen';
import type {RemoteResult} from '@deepseek-ai/dsh-typert-protocol';
const unwrap=<T,>(value:RemoteResult<T>):T=>{if(!value.ok)throw value.error;return value.value;};
export function RagBackendControls({status,busy,onConfigure}:{status:RagBackendStatus;busy:boolean;onConfigure:(selected:string,enabled:boolean)=>void}):React.ReactElement{
  const recover=status.state==='invalid'||status.state==='unavailable';
  const label=status.providers.find(item=>item.id===status.selected)?.label??'原后端不可用';
  const messages={ready:`已启用 · ${label}`,paused:'会话检索已暂停',invalid:'检索设置需要修复',unavailable:'所选检索后端不可用'};
  return <section className="zhen-card" aria-label="本地检索状态"><h2>本地检索</h2><p role="status">{messages[status.state]}</p>
    <p className="zhen-muted">集合的外发和会话权限仍需分别允许。暂停后，已自动引用资料的对话也会暂时停止发送，恢复后可继续。资料及本地浏览会保留。</p>
    <button type="button" className="zhen-secondary" disabled={busy} onClick={()=>{if(!busy)onConfigure(recover?'lexical':status.selected,recover?true:!status.enabled);}}>{busy?'正在保存…':recover?'恢复本地检索':status.enabled?'暂停会话检索':'恢复会话检索'}</button>
    {status.providers.length>1&&<details><summary>高级：更换检索方式</summary><label className="zhen-label">可用方式<select className="zhen-input" value={status.providers.some(item=>item.id===status.selected)?status.selected:''} disabled={busy} onChange={event=>{if(!busy&&event.target.value)onConfigure(event.target.value,status.enabled);}}>{!status.providers.some(item=>item.id===status.selected)&&<option value="">请选择</option>}{status.providers.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><p className="zhen-muted">这里只显示已安装扩展提供的检索方式。切换不会改变你选择的资料权限。</p></details>}
  </section>;
}
export function RagBackendSettings({api}:{api:Pick<ZhenRemote,'ragBackendStatus'|'ragBackendConfigure'>}):React.ReactElement{
  const [status,setStatus]=useState<RagBackendStatus>(),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),epoch=useRef(0),working=useRef(false);
  useEffect(()=>{const version=++epoch.current;working.current=false;setStatus(undefined);setBusy(false);setNotice('');api.ragBackendStatus().then(result=>{if(epoch.current===version)setStatus(unwrap(result));}).catch(()=>{if(epoch.current===version)setNotice('暂时无法读取本地检索设置，请重新打开知识库。');});return()=>{epoch.current++;};},[api]);
  async function configure(selected:string,enabled:boolean):Promise<void>{
    if(!status||working.current)return;working.current=true;const version=epoch.current;setBusy(true);setNotice('');
    try{const value=unwrap(await api.ragBackendConfigure(selected,enabled,status.revision));if(epoch.current===version)setStatus(value);}
    catch(error){if(epoch.current===version){setNotice(error instanceof Error?error.message:'设置未能保存，请刷新后重试。');try{const value=unwrap(await api.ragBackendStatus());if(epoch.current===version)setStatus(value);}catch{}}}
    finally{if(epoch.current===version){working.current=false;setBusy(false);}}
  }
  return <>{status?<RagBackendControls status={status} busy={busy} onConfigure={(selected,enabled)=>void configure(selected,enabled)}/>:<section className="zhen-card"><p role="status">{notice||'正在读取本地检索设置…'}</p></section>}{status&&notice&&<p className="zhen-notice" role="status">{notice}</p>}</>;
}
