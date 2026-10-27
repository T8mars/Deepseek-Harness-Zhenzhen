import React, { useEffect, useRef, useState } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { CanvasPairingView } from 'dsh-zhen';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
const labels: Record<string, string> = { 'canvas:read': '读取画布', 'run:read': '查询任务', 'asset:read': '读取素材', 'asset:transfer': '素材交接', 'browser:handoff': '浏览器移交', 'canvas:write': '修改画布', 'run:execute': '执行生成' };
const creationScopes = Object.keys(labels);
export function completeCanvasPairing(view?: CanvasPairingView): boolean { return view?.state === 'paired' && creationScopes.every(scope => view.scopes.includes(scope as CanvasPairingView['scopes'][number])); }
function unwrap<T>(result: RemoteResult<T>): T { if (!result.ok) throw result.error; return result.value; }
export function canvasConnectionNotice(error:unknown):string {
  if(error&&typeof error==='object'&&'code' in error&&error.code==='zhen/refused'&&'message' in error&&typeof error.message==='string')return error.message;
  return '连接暂时中断。请重新打开 DSH，确认桌面画布已打开，再点“连接画布，开始创作”。';
}
function canContinuePending(error:unknown,pairing:CanvasPairingView|undefined):boolean {
  if(pairing?.state!=='pending'||!Number.isFinite(Date.parse(pairing.expiresAt))||Date.parse(pairing.expiresAt)<=Date.now())return false;
  if(error&&typeof error==='object'&&'code' in error){
    if(error.code!=='zhen/refused'||!('details' in error)||!error.details||typeof error.details!=='object'||!('reason' in error.details))return false;
    return ['APP_NOT_RUNNING','APP_CONNECTION_FAILED','AGENT_CONTROL_TIMEOUT','CANVAS_UNAVAILABLE'].includes(String(error.details.reason));
  }
  return true;
}

export function CanvasPairingPanel({ api, online, managed=false, refreshRevision=0, onPairedChange, onPairingChange }: { api: ZhenRemote; online: boolean; managed?:boolean; refreshRevision?:number; onPairedChange?: (paired:boolean)=>void; onPairingChange?: (pairing:CanvasPairingView|undefined)=>void }): React.ReactElement {
  const [pairing, setPairing] = useState<CanvasPairingView>();
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [pollRevision,setPollRevision] = useState(0);
  const [pollFailures,setPollFailures] = useState(0);
  const generation = useRef(0), working = useRef(false);
  useEffect(()=>{onPairedChange?.(online&&pairing?.state==='paired');},[online,pairing?.state,onPairedChange]);
  useEffect(()=>{onPairingChange?.(online?pairing:undefined);},[online,pairing,onPairingChange]);
  useEffect(() => { let active = true; const version = ++generation.current; working.current=false;setBusy(online);setPairing(undefined);setNotice('');setPollFailures(0);
    if (online) api.canvasPairingSnapshot().then(result => { if (active && generation.current === version) setPairing(unwrap(result)); }).catch(error => { if (active && generation.current === version) setNotice(canvasConnectionNotice(error)); }).finally(()=>{if(active&&generation.current===version)setBusy(false);});
    else setPairing(undefined);
    return () => { active = false; generation.current++;working.current=false; };
  }, [api, online, refreshRevision]);
  async function action(work: () => Promise<RemoteResult<CanvasPairingView>>,continuePending=false): Promise<void> {
    if(working.current)return;working.current=true;const version = ++generation.current;
    setBusy(true); setNotice('');
    try { const result = unwrap(await work()); if (generation.current === version) {setPairing(result);setPollFailures(0);} }
    catch (error) { if (generation.current === version) {
      if(continuePending&&canContinuePending(error,pairing)){setPollFailures(value=>value+1);setNotice('');}
      else{setPairing(undefined);setPollFailures(0);setNotice(canvasConnectionNotice(error));}
    } }
    finally { if (generation.current === version) {working.current=false;setBusy(false);setPollRevision(value=>value+1);} }
  }
  // Poll only the existing owner-initiated request, never a new pairing or run.
  useEffect(()=>{
    if(!online||busy||pairing?.state!=='pending'||pollFailures>=4)return;
    const timer=setTimeout(()=>{void action(()=>api.canvasPairingComplete(),true);},Math.min(8000,2000*2**pollFailures));
    return()=>clearTimeout(timer);
  },[api,online,busy,pairing,pollRevision,pollFailures]);
  const full=completeCanvasPairing(pairing),pending=pairing?.state==='pending';
  const recovering=pending&&pollFailures>0,recoveryStopped=recovering&&pollFailures>=4;
  const summary=full?'全部创作能力已开启，可以回到会话开始创作。':pairing?.state==='paired'?'画布已连接，目前只开放了部分能力。点击连接按钮可一次申请全部创作能力。':pending?'请在桌面画布确认连接。批准后这里会自动完成，无需返回点击完成。':pairing?.state==='expired'?'这次连接确认已过期，请重新点击连接。':pairing?.state==='denied'?'画布未批准这次连接，需要时可重新点击连接。':'打开桌面画布后，点击连接即可开始。';
  return <section className="zhen-margin" aria-label="画布窗口配对">
    <h3>{pairing?.state==='paired'?'画布已连接':pending?'到桌面画布确认连接':'连接画布'}</h3>
    {busy&&<p role="status">正在检查连接…</p>}
    <p className="zhen-muted" role="status">{summary}</p>
    {recovering&&<p className="zhen-notice" role="status">{recoveryStopped?'暂时无法确认这次连接。请还原桌面画布窗口，再点“检查这次连接”；无需重新配对。':'连接暂时中断，正在继续检查这次连接。请还原桌面画布窗口，无需重新配对。'}</p>}
    {recoveryStopped&&<button type="button" className="zhen-primary" disabled={busy} onClick={()=>{setPollFailures(0);void action(()=>api.canvasPairingComplete(),true);}}>检查这次连接</button>}
    {!managed&&!full&&!pending&&<button type="button" className="zhen-primary" disabled={busy} onClick={()=>void action(()=>typeof api.canvasQuickConnect==='function'?api.canvasQuickConnect():api.canvasPairingBegin(true,true,true,true))}>连接画布，开始创作</button>}
    {!managed&&<details className="zhen-margin"><summary>连接详情与手动检查</summary>
      {pending&&<p>连接验证码：<code aria-label="配对验证码">{pairing.userCode}</code></p>}
      <p className="zhen-muted">默认申请读取、创作、执行生成和素材交接的完整能力；桌面画布会显示本次申请。生成任务仍在运行前审阅。</p>
      {pairing&&<><p>{pairing.message}</p>{pairing.expiresAt&&<p className="zhen-muted">有效期至 {new Date(pairing.expiresAt).toLocaleString()}</p>}{pairing.scopes.length>0&&<p className="zhen-muted">权限：{pairing.scopes.map(scope=>labels[scope]).join('、')}</p>}</>}
      <div className="zhen-actions zhen-wrap">
        <button type="button" className="zhen-secondary" disabled={busy||!online} onClick={()=>void action(()=>api.canvasPairingSnapshot())}>刷新配对状态</button>
        {pending&&<button type="button" className="zhen-secondary" disabled={busy||!online} onClick={()=>void action(()=>api.canvasPairingComplete())}>检查画布批准结果</button>}
      </div>
    </details>}
    {notice&&<p className="zhen-notice" role="status">{notice}</p>}
  </section>;
}
