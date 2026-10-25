import React, { useEffect, useRef, useState } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { CanvasPairingView } from 'dsh-zhen';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
const labels: Record<string, string> = { 'canvas:read': '读取画布', 'run:read': '查询任务', 'asset:read': '读取素材', 'asset:transfer': '素材交接', 'browser:handoff': '浏览器移交', 'canvas:write': '修改画布', 'run:execute': '执行生成' };
function unwrap<T>(result: RemoteResult<T>): T { if (!result.ok) throw result.error; return result.value; }

export function CanvasPairingPanel({ api, online, refreshRevision=0, onPairedChange }: { api: ZhenRemote; online: boolean; refreshRevision?:number; onPairedChange?: (paired:boolean)=>void }): React.ReactElement {
  const [pairing, setPairing] = useState<CanvasPairingView>();
  const [handoff, setHandoff] = useState(false);
  const [writable, setWritable] = useState(false);
  const [runnable, setRunnable] = useState(false);
  const [assetTransfer, setAssetTransfer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  useEffect(()=>{onPairedChange?.(online&&pairing?.state==='paired');},[online,pairing?.state,onPairedChange]);
  useEffect(() => { let active = true; const version = ++generation.current; setBusy(online);setPairing(undefined);setNotice('');
    if (online) api.canvasPairingSnapshot().then(result => { if (active && generation.current === version) setPairing(unwrap(result)); }).catch(error => { if (active && generation.current === version) setNotice(error instanceof Error?error.message:'配对状态尚未确认，请点击“刷新配对状态”。'); }).finally(()=>{if(active&&generation.current===version)setBusy(false);});
    else setPairing(undefined);
    return () => { active = false; generation.current++; };
  }, [api, online, refreshRevision]);
  async function action(work: () => Promise<RemoteResult<CanvasPairingView>>): Promise<void> {
    const version = ++generation.current;
    setBusy(true); setNotice(''); try { const result = unwrap(await work()); if (generation.current === version) setPairing(result); } catch (error) { if (generation.current === version) {setPairing(undefined);setNotice(error instanceof Error ? error.message : '配对未完成，请检查画布窗口。');} } finally { if (generation.current === version) setBusy(false); }
  }
  return <section className="zhen-margin" aria-label="画布窗口配对">
    <h3>{pairing?.state==='paired'?'画布已连接':'完成画布连接'}</h3>
    {busy&&<p role="status">正在核对配对状态，请稍候…</p>}
    <p className="zhen-muted">在这里发起请求，到配套的 Electron 桌面画布窗口核对验证码并批准，再返回完成配对。无需手动运行命令。</p>
    <details><summary>画布没有出现批准窗口？</summary><p className="zhen-muted">请打开正在连接的桌面画布窗口，而非浏览器页面。多个画布时，回到上方选择正确窗口。若刚更新过画布，请重新检测连接工具；已有验证码时先刷新配对状态，不要重复发起。</p></details>
    <p className="zhen-muted">默认只申请读取画布、任务和素材。修改工作流与执行生成分别申请，每次运行仍需独立核对和画布窗口批准。</p>
    <details className="zhen-margin"><summary>创作与交接权限（可选）</summary><p className="zhen-muted">需要把方案应用到画布或执行生成时，展开选择相应权限；具体操作仍会再次确认。</p>
    {pairing?.state === 'paired' && <p className="zhen-muted">重新配对会更新该画布实例的 CLI 登录；其他使用同一工具的会话也会使用新配对。</p>}
    <label className="zhen-checkbox"><input type="checkbox" checked={assetTransfer} disabled={busy || pairing?.state === 'pending'} onChange={event => setAssetTransfer(event.currentTarget.checked)}/>额外申请素材交接权限，用于把已保存结果送入画布素材中心</label>
    <label className="zhen-checkbox"><input type="checkbox" checked={handoff} disabled={busy || pairing?.state === 'pending'} onChange={event => setHandoff(event.currentTarget.checked)}/>额外申请浏览器移交权限（同时开启素材交接，由画布窗口确认）</label>
    <label className="zhen-checkbox"><input type="checkbox" checked={writable} disabled={busy || pairing?.state === 'pending'} onChange={event => setWritable(event.currentTarget.checked)}/>额外申请修改画布权限，用于下方工作流应用（每次仍需画布窗口批准）</label>
    <label className="zhen-checkbox"><input type="checkbox" checked={runnable} disabled={busy || pairing?.state === 'pending'} onChange={event => setRunnable(event.currentTarget.checked)}/>额外申请执行生成权限（可能收费；每份计划仍需独立审批）</label>
    </details>
    <div className="zhen-actions zhen-wrap zhen-margin">
      <button type="button" className="zhen-secondary" disabled={busy || !online || pairing?.state === 'pending'} onClick={() => void action(() => api.canvasPairingBegin(handoff, writable, runnable, assetTransfer))}>{pairing?.state === 'paired' ? '重新配对 / 调整权限' : '在画布发起配对'}</button>
      <button type="button" className="zhen-secondary" disabled={busy || !online} onClick={() => void action(() => api.canvasPairingSnapshot())}>刷新配对状态</button>
      {pairing?.state === 'pending' && <button type="button" className="zhen-primary" disabled={busy || !online} onClick={() => void action(() => api.canvasPairingComplete())}>我已在画布批准，完成连接</button>}
    </div>
    {!online && <p className="zhen-muted">请先按上方连接向导解决版本或窗口问题，再进行配对。</p>}
    {pairing && <div className="zhen-margin">
      <p role="status">{pairing.message}</p>
      {pairing.state === 'pending' && <p>请与画布窗口核对：<code aria-label="配对验证码">{pairing.userCode}</code></p>}
      {pairing.expiresAt && <p className="zhen-muted">有效期至 {new Date(pairing.expiresAt).toLocaleString()}</p>}
      {pairing.scopes.length > 0 && <p className="zhen-muted">权限：{pairing.scopes.map(scope => labels[scope]).join('、')}</p>}
    </div>}
    {notice && <p className="zhen-notice" role="status">{notice}</p>}
  </section>;
}
