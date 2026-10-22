import React,{useEffect,useRef,useState} from 'react';
import type {ZhenRemote,DirectoryChoiceInfo,DirectoryChoiceListing} from 'dsh-zhen/remote';
import {directoryChoiceInfoSchema,directoryChoiceResultSchema,directoryChoiceBrowseResultSchema} from 'dsh-zhen/remote';
import type {RemoteResult} from '@deepseek-ai/dsh-typert-protocol';
type Api=Pick<ZhenRemote,'directoryPickerInfo'|'directoryPickerNative'|'directoryPickerBrowse'|'directoryPickerCancel'>;
type Binding={api:Api;value:string;scope:unknown;};
type Request={generation:string;id:string;};
const unwrap=<T,>(result:RemoteResult<T>):T=>{if(!result.ok)throw result.error;return result.value;};
function message(error:unknown):string{const reason=error&&typeof error==='object'&&'details'in error&&error.details&&typeof error.details==='object'&&'reason'in error.details?error.details.reason:'';return reason==='DIRECTORY_BUSY'?'请先关闭上一次目录选择窗口。':reason==='DIRECTORY_TIMEOUT'?'选择目录超时，请关闭旧窗口后再试。':reason==='DIRECTORY_CHANGED'?'目录选择服务已变化，请重新选择。':'目录选择未完成，可重新选择或手动填写完整路径。';}
/** Choosing a path never submits the parent form or grants its later access. */
export function DirectoryChooser({api,value,onChoose,scopeKey='',disabled=false}:{api:Api;value:string;onChoose:(path:string)=>void;scopeKey?:unknown;disabled?:boolean}):React.ReactElement|null{
  const[capability,setCapability]=useState<{api:Api;value:DirectoryChoiceInfo}>(),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[listing,setListing]=useState<DirectoryChoiceListing>(),[notice,setNotice]=useState(''),[jump,setJump]=useState(''),[hidden,setHidden]=useState(false);
  const alive=useRef(true),epoch=useRef(0),working=useRef(false),active=useRef<{api:Api;request:Request}|undefined>(undefined),view=useRef<Binding|undefined>(undefined),button=useRef<HTMLButtonElement>(null),current=useRef({api,value,scope:scopeKey,disabled,onChoose});current.current={api,value,scope:scopeKey,disabled,onChoose};
  const heading=useRef<HTMLParagraphElement>(null);
  const discovery=useRef(0);
  const returnFocus=useRef<{api:Api;scope:unknown}|undefined>(undefined);
  const matches=(binding:Binding)=>alive.current&&!current.current.disabled&&binding.api===current.current.api&&binding.value===current.current.value&&Object.is(binding.scope,current.current.scope);
  function cancel():void{epoch.current++;working.current=false;const pending=active.current;active.current=undefined;if(pending&&typeof pending.api.directoryPickerCancel==='function')try{void pending.api.directoryPickerCancel(pending.request).catch(()=>{});}catch{/* An old disconnected API cannot change the current input. */}}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;cancel();};},[]);
  useEffect(()=>{cancel();view.current=undefined;setOpen(false);setBusy(false);setListing(undefined);setNotice('');},[api,value,scopeKey,disabled]);
  async function discover():Promise<void>{const version=++discovery.current;if(typeof api.directoryPickerInfo!=='function')return;try{const info=directoryChoiceInfoSchema.parse(unwrap(await api.directoryPickerInfo()));if(alive.current&&current.current.api===api&&version===discovery.current)setCapability({api,value:info});}catch{/* The manual path field remains usable, and discovery can be retried. */}}
  useEffect(()=>{setCapability(undefined);void discover();return()=>{discovery.current++;};},[api]);
  useEffect(()=>{if(open&&listing&&!busy)heading.current?.focus();},[open,listing,busy]);
  useEffect(()=>{if(open||busy)return;const pending=returnFocus.current;returnFocus.current=undefined;if(pending&&alive.current&&!disabled&&pending.api===api&&Object.is(pending.scope,scopeKey))button.current?.focus();},[open,busy,api,scopeKey,disabled]);
  function close():void{cancel();returnFocus.current={api,scope:scopeKey};view.current=undefined;setOpen(false);setBusy(false);setListing(undefined);setNotice('');}
  function valid(binding:Binding,version:number):boolean{return matches(binding)&&epoch.current===version;}
  async function browse(info:DirectoryChoiceInfo,binding:Binding,version:number,path?:string):Promise<void>{
    const request={generation:info.generation,id:crypto.randomUUID(),...(path===undefined?{}:{path})};active.current={api,request};setListing(undefined);
    const result=directoryChoiceBrowseResultSchema.parse(unwrap(await api.directoryPickerBrowse(request)));if(!valid(binding,version))return;if(result.id!==request.id||result.generation!==request.generation)throw Error('DIRECTORY_REPLY_CHANGED');setListing(result.listing);setJump(result.listing.path);
  }
  async function start():Promise<void>{
    const binding={api,value,scope:scopeKey};if(working.current||!matches(binding))return;const version=++epoch.current;view.current=binding;working.current=true;setBusy(true);setNotice('');setOpen(true);setListing(undefined);
    let kind:DirectoryChoiceInfo['kind']|undefined;
    try{const info=directoryChoiceInfoSchema.parse(unwrap(await api.directoryPickerInfo()));if(!valid(binding,version))return;kind=info.kind;setCapability({api,value:info});
      if(info.kind==='native'){const request={generation:info.generation,id:crypto.randomUUID()};active.current={api,request};const result=directoryChoiceResultSchema.parse(unwrap(await api.directoryPickerNative(request)));if(!valid(binding,version))return;if(result.id!==request.id||result.generation!==request.generation)throw Error('DIRECTORY_REPLY_CHANGED');returnFocus.current={api,scope:scopeKey};setOpen(false);if(result.path!==null)current.current.onChoose(result.path);}
      else if(info.kind==='browse')await browse(info,binding,version);
      else setOpen(false);
    }catch(error){if(valid(binding,version)){setNotice(message(error));if(kind!=='browse'){returnFocus.current={api,scope:scopeKey};setOpen(false);}}}
    finally{if(valid(binding,version)){active.current=undefined;working.current=false;setBusy(false);}}
  }
  async function navigate(path?:string):Promise<void>{
    const binding=view.current,info=capability?.api===api?capability.value:undefined;if(working.current||!binding||!matches(binding)||info?.kind!=='browse')return;const version=++epoch.current;working.current=true;setBusy(true);setNotice('');
    try{await browse(info,binding,version,path);}catch(error){if(valid(binding,version))setNotice(message(error));}finally{if(valid(binding,version)){active.current=undefined;working.current=false;setBusy(false);}}
  }
  function choose():void{const binding=view.current;if(working.current||!binding||!matches(binding)||!listing)return;current.current.onChoose(listing.path);close();}
  const info=capability?.api===api?capability.value:undefined,sameView=view.current&&matches(view.current);
  if(typeof api.directoryPickerInfo!=='function')return null;
  if(!info||info.kind==='unavailable')return <div className="zhen-directory-chooser"><button type="button" className="zhen-link" disabled={disabled} onClick={()=>{if(!current.current.disabled)void discover();}}>重新检测目录选择</button></div>;
  return <div className="zhen-directory-chooser">
    <button ref={button} type="button" className="zhen-secondary" disabled={disabled||busy} aria-expanded={!!(open&&sameView)} onClick={()=>void start()}>{busy?'正在选择…':'选择文件夹'}</button>
    {open&&sameView&&<div className="zhen-directory-panel" role="group" aria-label="选择文件夹" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close();}}}>
      <div className="zhen-section-heading"><strong>{info.kind==='native'?'请在系统窗口选择文件夹':'选择文件夹'}</strong><button type="button" className="zhen-link" onClick={close}>取消选择</button></div>
      {info.kind==='browse'&&<>
        <div className="zhen-actions zhen-wrap"><button type="button" className="zhen-secondary" disabled={busy} onClick={()=>void navigate()}>主目录</button>{listing?.crumbs.map(row=><button type="button" className="zhen-secondary" key={row.path} disabled={busy} onClick={()=>void navigate(row.path)}>{row.name||row.path}</button>)}</div>
        <label className="zhen-label">跳转到目录<input className="zhen-input" value={jump} maxLength={4096} disabled={busy} onChange={event=>setJump(event.currentTarget.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(jump.trim())void navigate(jump);}}}/></label><button type="button" className="zhen-secondary" disabled={busy||!jump.trim()} onClick={()=>void navigate(jump)}>打开此目录</button>
        <label className="zhen-checkbox"><input type="checkbox" checked={hidden} onChange={event=>setHidden(event.currentTarget.checked)}/>显示隐藏目录</label>
        {busy?<p role="status">正在读取目录…</p>:listing&&<><p ref={heading} tabIndex={-1} className="zhen-source-path">{listing.path}</p><div className="zhen-directory-list">{listing.entries.filter(row=>hidden||!row.hidden).map(row=><button type="button" className="zhen-secondary" key={row.path} onClick={()=>void navigate(row.path)}>{row.name}</button>)}</div>{listing.entries.filter(row=>hidden||!row.hidden).length===0&&<p className="zhen-muted">此位置没有可显示的子目录，可以选择当前文件夹。</p>}{listing.truncated&&<p role="status">目录列表未完整显示，可输入更具体的路径继续浏览。</p>}</>}
        <button type="button" className="zhen-primary" disabled={busy||!listing} onClick={choose}>选择此文件夹</button>
      </>}
      {notice&&<p role="status">{notice}</p>}
    </div>}
    {!open&&notice&&<p role="status">{notice}</p>}
  </div>;
}
