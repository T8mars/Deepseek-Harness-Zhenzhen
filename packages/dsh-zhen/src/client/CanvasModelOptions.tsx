import React,{useEffect,useId,useRef,useState} from 'react';
import type {ZhenRemote} from 'dsh-zhen/remote';
import type {CanvasModels,CanvasModelKind,CanvasModelChoices,CanvasWorkflowInput} from 'dsh-zhen';
const labels:Record<CanvasModelKind,string>={llm:'文本模型',image:'图片模型',video:'视频模型',audio:'音频 / 音乐模型'};
export function NativeModelSelect({page,choice,disabled,onChange,id}:{page?:CanvasModels;choice?:{provider:string;model:string};disabled:boolean;onChange:(choice?:{provider:string;model:string})=>void;id:string}):React.ReactElement {
  const selected=page?.items.find(item=>item.provider===choice?.provider&&item.model===choice?.model);
  return <select id={id} className="zhen-input" value={selected?.id??(choice?'__selected__':'')} disabled={disabled} onChange={event=>{const id=event.currentTarget.value;if(!id){onChange(undefined);return;}const item=page?.items.find(item=>item.id===id);if(item?.executable)onChange({provider:item.provider,model:item.model});}}>
    <option value="">由画布推荐，预览时核对</option>
    {choice&&!selected&&<option value="__selected__">当前选择：{choice.provider} / {choice.model}（待重新读取核对）</option>}
    {page?.items.map(item=><option key={item.id} value={item.id} disabled={!item.executable}>{item.provider} / {item.model}{!item.executable?' · 画布尚未核验为可执行':''}</option>)}
  </select>;
}
export function CanvasModelOptions({api,projectId,canvasId,kind,online,disabled,value,onChange}:{api:ZhenRemote;projectId:string;canvasId:string;kind:CanvasWorkflowInput['kind'];online:boolean;disabled:boolean;value:CanvasModelChoices;onChange:(value:CanvasModelChoices)=>void}):React.ReactElement {
  const [pages,setPages]=useState<Partial<Record<CanvasModelKind,CanvasModels>>>({}),[queries,setQueries]=useState<Partial<Record<CanvasModelKind,string>>>({}),[loading,setLoading]=useState<CanvasModelKind>(),[notice,setNotice]=useState('');
  const generation=useRef(0),field=useId();
  useEffect(()=>{generation.current++;setPages({});setQueries({});setLoading(undefined);setNotice('');return()=>{generation.current++;};},[api,projectId,canvasId,kind,online]);
  const kinds:CanvasModelKind[]=kind==='story'?['llm','image','video','audio']:[kind==='script'?'llm':kind];
  async function read(modelKind:CanvasModelKind):Promise<void>{const version=++generation.current;setLoading(modelKind);setNotice('');try{const result=await api.canvasWorkflowModels({projectId,canvasId,kind:modelKind,query:queries[modelKind]??''});if(!result.ok)throw result.error;if(generation.current===version)setPages(previous=>({...previous,[modelKind]:result.value}));}catch(error){if(generation.current===version)setNotice(error instanceof Error?error.message:'模型目录暂不可用。');}finally{if(generation.current===version)setLoading(undefined);}}
  return <details className="zhen-margin"><summary>选择画布模型（可选）</summary><p className="zhen-muted">模型来自所选画布的公开目录，密钥保留在画布。明确选择后，预览会重新核验可执行状态和实际计划模型；不会自动换用其他模型。</p>
    {kinds.map(modelKind=><div key={modelKind} className="zhen-margin"><label className="zhen-label" htmlFor={`${field}-${modelKind}`}>{labels[modelKind]}</label>
      <div className="zhen-input-row"><input className="zhen-input" aria-label={`查找${labels[modelKind]}`} value={queries[modelKind]??''} maxLength={200} disabled={disabled||!!loading} onChange={event=>{const text=event.currentTarget.value;setQueries(previous=>({...previous,[modelKind]:text}));}} placeholder="输入模型或平台名称，如 Seedance、Suno…"/>
      <button type="button" className="zhen-secondary" disabled={disabled||!!loading||!online||!projectId||!canvasId} onClick={()=>void read(modelKind)}>{loading===modelKind?'读取中…':'读取画布模型'}</button></div>
      <NativeModelSelect id={`${field}-${modelKind}`} page={pages[modelKind]} choice={value[modelKind]} disabled={disabled||!!loading} onChange={choice=>{const next={...value};if(choice)next[modelKind]=choice;else delete next[modelKind];onChange(next);}}/>
      {pages[modelKind]&&<p className="zhen-muted">{pages[modelKind]!.items.length} / {pages[modelKind]!.total} 项{pages[modelKind]!.truncated?'，请用关键词缩小范围':''}。状态为本次读取快照，最终以画布运行审批为准。</p>}
    </div>)}
    {notice&&<p role="status" className="zhen-notice">{notice}</p>}
  </details>;
}
