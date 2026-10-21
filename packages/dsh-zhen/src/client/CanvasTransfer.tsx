import {canvasTargetApi} from './canvas-target-api.ts';
import React, { useEffect, useId, useRef, useState } from 'react';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { CanvasTransferView, CanvasWorkspaces } from 'dsh-zhen';
import {canvasTargetKey,selectedCanvasTarget,refreshedCanvasTarget} from './canvas-target.ts';
import {ActiveCanvasTargets,activeCanvasTarget,activeCanvasUnavailable} from './ActiveCanvasTargets.tsx';
import type {CanvasActiveTargets as ActiveTargets} from 'dsh-zhen';

function unwrap<T>(result: RemoteResult<T>): T { if (!result.ok) throw result.error; return result.value; }
const labels: Record<CanvasTransferView['phase'], string> = {
  preview: '待你核对', requesting: '正在请求画布审批', pending: '等待画布窗口批准', submitting: '正在核对原生结果',
  available: '素材已在画布项目中', applied: '已找到原生放置回执', denied: '画布已拒绝', unknown: '结果待确认，只查询原操作', expired: '本次预览或审批已过期', reverted: '原生放置已撤销',
};
export function CanvasTransferPanel({ api, receiptId, onConnections }: { api: ZhenRemote; receiptId: string; onConnections: () => void }): React.ReactElement {
  const [view, setView] = useState<CanvasTransferView | null>(null), [targets, setTargets] = useState<CanvasWorkspaces>({ canvases: [] });
  const [target, setTarget] = useState(''), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [notice, setNotice] = useState('');
  const [targetsLoaded,setTargetsLoaded]=useState(false);
  const generation = useRef(0), field = useId();
  const [activeTargets,setActiveTargets]=useState<ActiveTargets>();const targetEpoch=useRef(0);
  useEffect(() => { const version = ++generation.current;targetEpoch.current++;setActiveTargets(undefined); setBusy(false); setConfirmed(false); setView(null); setTargets({ canvases: [] }); setTarget('');setTargetsLoaded(false);
    void api.canvasTransferSnapshot().then(result => { if (generation.current === version) setView(unwrap(result)); }).catch(() => { if (generation.current === version) setNotice('交接进度暂未读到，请刷新进度。'); });
    return () => { generation.current++; };
  }, [api]);
  useEffect(() => { setConfirmed(false); }, [receiptId]);
  async function action(run: (version: number) => Promise<void>): Promise<void> {
    const version = ++generation.current; setBusy(true); setNotice(''); setConfirmed(false);
    try { await run(version); } catch (error) { if (generation.current === version) setNotice(error && typeof error === 'object' && 'message' in error ? String(error.message) : '操作未完成，请检查画布连接。'); }
    finally { if (generation.current === version) { try { const next = unwrap(await api.canvasTransferSnapshot()); if (generation.current === version) setView(next); } catch {} if (generation.current === version) setBusy(false); } }
  }
  const active = !!view && ['requesting', 'pending', 'submitting', 'unknown'].includes(view.phase);
  const selectedTarget=selectedCanvasTarget(targets,target);
  const changed = !!view && ((!!receiptId && receiptId !== view.receiptId) || ((targetsLoaded||!!target)&&(!selectedTarget||selectedTarget.id!==view.canvasId||selectedTarget.projectId!==view.projectId)));
  return <section className="zhen-card" aria-label="已保存结果送到画布">
    <div className="zhen-section-heading"><h2>送到画布</h2><button type="button" className="zhen-link" onClick={onConnections}>画布连接与权限 ↗</button></div>
    <p>选择已保存结果和目标画布，先核对文件。导入项目后，可再预览并确认放到画布上。</p>
    <p className="zhen-muted">在配对页单独开启素材交接；放到画布还需要修改画布权限。每一步都由画布窗口确认。</p>
    <ActiveCanvasTargets report={activeTargets} disabled={busy||active} onRead={()=>void action(async version=>{
      const epoch=++targetEpoch.current;setActiveTargets(undefined);setTarget('');setTargetsLoaded(true);setConfirmed(false);
      const result=unwrap(await canvasTargetApi(api).canvasActiveTargets());if(generation.current!==version||targetEpoch.current!==epoch)return;
      setActiveTargets(result);setTargets(result.workspaces);const selected=activeCanvasTarget(result);setTarget(selected?canvasTargetKey(selected):'');
    })} onChoose={windowId=>{if(busy||active||!activeTargets)return;targetEpoch.current++;const selected=activeCanvasTarget(activeTargets,windowId);setTarget(selected?canvasTargetKey(selected):'');setActiveTargets(undefined);setConfirmed(false);if(!selected)setNotice(activeCanvasUnavailable);}}/>
    <button type="button" className="zhen-secondary" disabled={busy || active} onClick={() => {targetEpoch.current++;setActiveTargets(undefined);void action(async version => { const result = unwrap(await canvasTargetApi(api).canvasWorkspaces()); if (generation.current === version) { setTargets(result);setTargetsLoaded(true); setTarget(previous=>refreshedCanvasTarget(result,previous)); } });}}>读取可用画布</button>
    <label className="zhen-label" htmlFor={`${field}-target`}>目标画布</label><select className="zhen-input" id={`${field}-target`} value={target} disabled={busy || active} onChange={event => {targetEpoch.current++;setActiveTargets(undefined); setTarget(event.currentTarget.value); setConfirmed(false); }}><option value="">读取列表后按名称选择画布</option>{targets.canvases.map(item => <option key={canvasTargetKey(item)} value={canvasTargetKey(item)}>{item.name} · 修订 {item.revision}</option>)}</select>
    {targets.canvases.length>1&&<p className="zhen-muted">请选择这次使用的画布；列表顺序不代表当前窗口。</p>}
    <button type="button" className="zhen-secondary zhen-margin" disabled={busy || active || !receiptId || !selectedTarget} onClick={() => { const selected = selectedTarget; if (selected) void action(async () => { unwrap(await canvasTargetApi(api, selected.connectionId).canvasTransferPreview({ receiptId, projectId: selected.projectId, canvasId: selected.id })); }); }}>核对所选保存结果</button>
    {!receiptId && <p className="zhen-muted">在上方保存记录点击“送到画布”选择文件。已有交接进度可继续查询。</p>}
    {view && <article className="zhen-task-row"><strong role="status">{labels[view.phase]}</strong>
      <p>{view.file.name} · {view.file.mime} · {view.file.size.toLocaleString()} B</p><p className="zhen-muted">项目 {view.projectId} · 画布 {view.canvasId} · revision {view.canvasRevision}</p>
      {changed && <p>当前选择与此进度不同，请重新核对所选结果。已开始的交接仍按原引用查询。</p>}
      {view.phase === 'preview' && <><p>{view.stage === 'import' ? `将复制到画布项目素材库，原保存文件保留。当前导入上限 ${Math.floor(view.maxImportBytes / 1024 ** 2)} MiB。` : `将素材放在画布位置 (${view.placement?.position.x}, ${view.placement?.position.y})。`}</p><label className="zhen-checkbox"><input type="checkbox" checked={confirmed} disabled={busy || changed} onChange={event => setConfirmed(event.currentTarget.checked)}/>已核对文件、目标{view.stage === 'place' ? '和位置' : ''}，同意交给画布窗口确认</label><button type="button" className="zhen-primary zhen-margin" disabled={busy || changed || !confirmed} onClick={() => void action(async () => { unwrap(await api.canvasTransferApprove(view.id, true)); })}>送到画布窗口确认{view.stage === 'import' ? '导入' : '放置'}</button></>}
      {view.phase === 'pending' && <><p>请在画布窗口核对并批准，再返回检查。</p><button type="button" className="zhen-primary" disabled={busy} onClick={() => void action(async () => { unwrap(await api.canvasTransferComplete(view.id)); })}>检查窗口审批并{view.stage === 'import' ? '导入' : '放置'}</button></>}
      {view.phase === 'available' && <><p>{view.assetSource === 'catalog-match' ? '已在原生素材库找到内容一致的文件，无需再次复制。' : '画布已确认导入。'}可以保留在素材库，也可继续放到画布。</p><button type="button" className="zhen-secondary" disabled={busy || changed} onClick={() => void action(async () => { unwrap(await api.canvasTransferPlacement(view.id)); })}>预览放到画布</button></>}
      {view.phase === 'applied' && <p>原生放置回执 revision {view.appliedRevision}。后续手动编辑请以画布当前内容为准。</p>}
      <details><summary>文件与操作引用</summary><p className="zhen-source-path">SHA-256 {view.file.sha256}<br/>交接 {view.id}{view.asset && <><br/>素材 {view.asset.id}</>}{view.placement && <><br/>Patch {view.placement.patchId}</>}</p></details>
      <button type="button" className="zhen-link zhen-margin" disabled={busy} onClick={() => void action(async () => { unwrap(await api.canvasTransferRefresh(view.id)); })}>查询原操作进度</button>
    </article>}
    {!view && <button type="button" className="zhen-link zhen-margin" disabled={busy} onClick={() => void action(async () => {})}>刷新交接进度</button>}
    {notice && <p className="zhen-notice" role="status">{notice}</p>}
  </section>;
}
