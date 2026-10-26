import React,{useEffect,useRef,useState} from 'react';
import type {ZhenRemote} from 'dsh-zhen/remote';
import type {CanvasConnection,CanvasConnectionCheck,CanvasSetupDiscovery,CanvasToolCatalog,CanvasPairingView} from 'dsh-zhen';
import type {RemoteResult} from '@deepseek-ai/dsh-typert-protocol';
import {McpMarket} from './McpMarket.tsx';
import {CanvasPairingPanel,completeCanvasPairing} from './CanvasPairing.tsx';
import {CanvasWorkflowPanel} from './CanvasWorkflow.tsx';
import {CanvasRunPanel} from './CanvasRun.tsx';
import {CanvasConnectionChoices} from './CanvasConnectionChoices.tsx';
function unwrap<T>(result:RemoteResult<T>):T{if(!result.ok)throw result.error;return result.value;}

export function Connections({api}:{api:ZhenRemote}):React.ReactElement{
  const [status,setStatus]=useState<CanvasConnection>(),[check,setCheck]=useState<CanvasConnectionCheck>();
  const [root,setRoot]=useState(''),[instance,setInstance]=useState('');
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[paired,setPaired]=useState(false);
  const [pairingRevision,setPairingRevision]=useState(0);
  const [pairing,setPairing]=useState<CanvasPairingView>();
  const [catalog,setCatalog]=useState<CanvasToolCatalog>(),[discovery,setDiscovery]=useState<CanvasSetupDiscovery>();
  const alive=useRef(true),working=useRef(false),generation=useRef(0);
  const activeApi=useRef(api);activeApi.current=api;
  const compatible=check?.state==='ready';
  async function refresh(inventory=false):Promise<void>{
    const version=generation.current;
    const results=await Promise.all([api.canvasStatus(),api.canvasConnectionCheck(),inventory?api.canvasSetupDiscover():Promise.resolve(undefined)]);
    if(!alive.current||activeApi.current!==api||version!==generation.current)return;
    const value=unwrap(results[0]);setStatus(value);setRoot(value.root);setInstance(value.instance??'');
    let diagnosis=unwrap(results[1]);
    const binding=diagnosis.binding;
    if(value.configured?(!binding||value.root!==binding.root||value.digest!==binding.digest||(value.instance??'')!==binding.instance):binding!==null)diagnosis={...diagnosis,state:'error',code:'CONNECTION_CHANGED',message:'连接在检查期间发生变化，请重新检测，确认当前画布。',instances:[]};
    setCheck(diagnosis);if(diagnosis.state!=='ready')setPaired(false);setPairingRevision(value=>value+1);
    if(results[2])setDiscovery(unwrap(results[2]));
  }
  async function action(task:()=>Promise<void>):Promise<void>{
    if(working.current)return;working.current=true;const version=++generation.current;
    setBusy(true);setNotice('');
    try{await task();}catch(error){if(alive.current&&generation.current===version)setNotice(error instanceof Error?error.message:'检查未完成，请重新检测；仍有问题可展开诊断信息。');}
    finally{if(alive.current&&generation.current===version){working.current=false;setBusy(false);}}
  }
  useEffect(()=>{alive.current=true;void action(()=>refresh(true));return()=>{alive.current=false;generation.current++;working.current=false;};},[api]);
  async function connect(path:string,id='',digest=''):Promise<void>{
    setPaired(false);setCatalog(undefined);unwrap(await api.connectCanvas(path,id,digest));if(alive.current&&activeApi.current===api)await refresh();
  }
  const candidates=<CanvasConnectionChoices discovery={discovery} busy={busy} onConnect={(path,digest)=>void action(()=>connect(path,'',digest))}/>;
  return <div className="zhen-settings">
    <section className="zhen-card"><h2>MCP 与创作工具</h2><p className="zhen-muted">连接画布后，在会话里直接描述想创作的内容。方案会先交给你审阅，生成前仍会确认。</p></section>
    <section className="zhen-card">
      <div className="zhen-section-heading"><h2>T8 贞贞无限画布</h2><span>{busy?'正在连接…':paired?'已连接':pairing?.state==='pending'?'等待画布确认':'准备连接'}</span></div>
      <p className="zhen-muted">打开桌面画布，点击连接，再在画布窗口确认一次即可。连接工具自动选择，默认开启全部创作能力。</p>
      {!completeCanvasPairing(pairing)&&pairing?.state!=='pending'&&<button type="button" className="zhen-primary zhen-margin" disabled={busy} onClick={()=>void action(async()=>{
        const result=await api.canvasQuickConnect();await refresh(true);unwrap(result);
      })}>连接画布，开始创作</button>}
      {check?.state==='choose-instance'&&<div className="zhen-margin" aria-label="选择运行中的画布">
        {check.instances.map((item,index)=><button type="button" className="zhen-secondary zhen-margin" disabled={busy||!status?.configured} key={item.id} onClick={()=>void action(async()=>{await connect(status!.root,item.id,status!.digest);const result=await api.canvasQuickConnect();await refresh(true);unwrap(result);})}>使用画布 {index+1}</button>)}
      </div>}
      <CanvasPairingPanel key={`${status?.root??''}:${status?.digest??''}:${status?.instance??''}`} api={api} online={compatible} managed refreshRevision={pairingRevision} onPairedChange={setPaired} onPairingChange={setPairing}/>
      <details className="zhen-margin"><summary>连接诊断与高级设置</summary>
        <button type="button" className="zhen-secondary zhen-margin" disabled={busy} onClick={()=>void action(()=>refresh(true))}>重新检测</button>
        <p className="zhen-muted">画布自身的“设置 → Agent连接工具”可以安装或修复连接工具。通常直接点击上方连接按钮即可。</p>
        {candidates}
        <form onSubmit={event=>{event.preventDefault();void action(()=>connect(root,instance));}}>
          <label className="zhen-label" htmlFor="zhen-canvas-root">已安装的 zcanvas-cli 目录</label>
          <input id="zhen-canvas-root" className="zhen-input" value={root} onChange={event=>setRoot(event.currentTarget.value)} maxLength={4096} disabled={busy}/>
          <p className="zhen-muted">连接会加载此目录的本机工具代码，仅选择你信任的画布安装。目录内容变化后需要重新审阅。普通用户请优先使用上方推荐按钮。</p>
          <label className="zhen-label" htmlFor="zhen-canvas-instance">实例 ID（仅排查时使用）</label>
          <input id="zhen-canvas-instance" className="zhen-input" value={instance} onChange={event=>setInstance(event.currentTarget.value)} maxLength={128} disabled={busy}/>
          <button className="zhen-secondary zhen-margin" disabled={busy||!root.trim()}>信任并使用指定目录</button>
        </form>
      </details>
      {paired&&status&&<><CanvasWorkflowPanel key={`workflow:${status.root}:${status.digest}:${status.instance??''}`} api={api} online={compatible}/><CanvasRunPanel key={`run:${status.root}:${status.digest}:${status.instance??''}`} api={api} online={compatible}/></>}
      {status?.configured&&<div className="zhen-actions zhen-wrap zhen-margin">
        <button type="button" className="zhen-secondary" disabled={busy||!paired} onClick={()=>void action(async()=>setCatalog(unwrap(await api.canvasTools())??undefined))}>查看创作能力</button>
        <button type="button" className="zhen-link" disabled={busy} onClick={()=>void action(async()=>{unwrap(await api.disconnectCanvas());setCatalog(undefined);setPaired(false);await refresh();})}>断开连接</button>
      </div>}
      {catalog&&<details className="zhen-margin" open><summary>可规划的创作能力 · {catalog.tools.length} 项</summary><ul className="zhen-canvas-tool-list" tabIndex={0} aria-label="画布创作能力">{catalog.tools.map(tool=><li key={tool.name}><strong>{tool.creatorLabel}</strong> · {tool.directOperations.join(' / ')}</li>)}</ul></details>}
      <details className="zhen-margin"><summary>诊断信息</summary><p className="zhen-muted">检查代码：{check?.code??'检查中'}。服务响应、版本匹配与窗口配对是分别检查的步骤。</p>{status?.compat!=null&&<pre className="zhen-excerpt">{JSON.stringify(status.compat,null,2)}</pre>}</details>
      <a className="zhen-link" href="https://github.com/T8mars/T8-penguin-canvas" target="_blank" rel="noreferrer">打开画布项目 ↗</a>
      {notice&&<p className="zhen-notice" role="status">{notice}</p>}
    </section>
    <McpMarket api={api}/>
  </div>;
}
