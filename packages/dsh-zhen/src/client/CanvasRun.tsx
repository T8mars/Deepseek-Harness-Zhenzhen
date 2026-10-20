import React, { useEffect, useId, useRef, useState } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { CanvasRunView, CanvasRunNodes, CanvasWorkspaces } from 'dsh-zhen';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import {canvasTargetKey,selectedCanvasTarget,refreshedCanvasTarget} from './canvas-target.ts';
function unwrap<T>(result: RemoteResult<T>): T { if (!result.ok) throw result.error; return result.value; }
const phases: Record<CanvasRunView['phase'], string> = { preview: '待你核对运行计划', requesting: '正在请求画布窗口确认', pending: '等待画布窗口批准', submitting: '正在提交到画布', tracking: '画布已接收，可查询原运行', denied: '画布窗口已拒绝', expired: '计划已过期，请重新读取画布', unknown: '结果尚未确认，请只查询原运行' };
const statuses: Record<string, string> = { accepted: '等待画布调度', pending: '等待确认', dispatching: '画布调度中', running: '执行中', completed: '画布标记完成', failed: '画布标记失败', cancelled: '已取消' };
export function CanvasRunPanel({ api, online }: { api: ZhenRemote; online: boolean }): React.ReactElement {
  const [targets, setTargets] = useState<CanvasWorkspaces>({ canvases: [] }), [canvas, setCanvas] = useState('');
  const [nodes, setNodes] = useState<CanvasRunNodes>(), [selected, setSelected] = useState<string[]>([]), [view, setView] = useState<CanvasRunView | null>(null);
  const [confirmed, setConfirmed] = useState(false), [feeAccepted, setFeeAccepted] = useState(false), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const generation = useRef(0), field = useId();
  useEffect(() => { let active = true; const version = ++generation.current; setBusy(false);setTargets({canvases:[]});setCanvas('');setNodes(undefined);setSelected([]);setConfirmed(false);setFeeAccepted(false);
    api.canvasRunSnapshot().then(result => { if (active && generation.current === version) setView(unwrap(result)); }).catch(() => { if (active && generation.current === version) setNotice('运行引用尚未读到，请刷新进度。'); });
    return () => { active = false; generation.current++; };
  }, [api, online]);
  async function action(run: () => Promise<void>): Promise<void> {
    const version = ++generation.current; setBusy(true); setNotice('');
    try { await run(); } catch (error) { if (generation.current === version) setNotice(error instanceof Error ? error.message : '操作未完成，请查询原运行。'); }
    finally { if (generation.current === version) { try { const current = unwrap(await api.canvasRunSnapshot()); if (generation.current === version) setView(current); } catch {} if (generation.current === version) { setBusy(false); setConfirmed(false); setFeeAccepted(false); } } }
  }
  const active = !!view && ['requesting', 'pending', 'submitting', 'unknown'].includes(view.phase);
  async function loadNodes(more = false): Promise<void> {
    const target = selectedCanvasTarget(targets,canvas); if (!target) return;
    const version = generation.current, result = unwrap(await api.canvasRunNodes(target.projectId, target.id, more ? nodes?.nextOffset ?? 0 : 0));
    if (generation.current !== version) return;
    if (more && nodes && nodes.revision !== result.revision) { setNodes(undefined); setSelected([]); throw Error('画布已变化，请重新读取节点。'); }
    setNodes(more && nodes ? { ...result, nodes: [...nodes.nodes, ...result.nodes].filter((item, index, items) => items.findIndex(other => other.id === item.id) === index) } : result);
    if (!more) setSelected([]); setDirty(true);
  }
  return <section className="zhen-margin" aria-label="画布运行审批">
    <h3>运行画布中的生成节点</h3>
    <p className="zhen-muted">先选择节点并查看完整执行范围、服务和模型。当前无法确定费用；生成可能收费。你确认后，仍需在画布窗口批准，再返回单次提交。</p>
    <button type="button" className="zhen-secondary" disabled={busy || !online || active} onClick={() => void action(async () => { const version = generation.current; const result = unwrap(await api.canvasWorkspaces()); if (generation.current === version) { setTargets(result); setCanvas(previous=>refreshedCanvasTarget(result,previous)); setNodes(undefined); setSelected([]); setDirty(true); } })}>读取画布</button>
    <label className="zhen-label" htmlFor={field}>目标画布</label><select id={field} className="zhen-input" value={canvas} disabled={busy || active} onChange={event => { setCanvas(event.currentTarget.value); setNodes(undefined); setSelected([]); setDirty(true); setConfirmed(false); setFeeAccepted(false); }}><option value="">按名称选择画布</option>{targets.canvases.map(target => <option key={canvasTargetKey(target)} value={canvasTargetKey(target)}>{target.name}</option>)}</select>
    {targets.canvases.length>1&&<p className="zhen-muted">请选择这次使用的画布；列表顺序不代表当前窗口。</p>}
    <button type="button" className="zhen-secondary" disabled={busy || !online || !canvas || active} onClick={() => void action(() => loadNodes())}>读取当前节点</button>
    {nodes && <div className="zhen-margin">
      <p>基于 revision {nodes.revision}。选择要执行的生成节点，原生计划可能包含所需的上游生成节点，审批前会完整列出。</p>
      <div className="zhen-canvas-tool-list" role="group" aria-label="选择运行节点">{nodes.nodes.map(node => <label className="zhen-checkbox" key={node.id}><input type="checkbox" disabled={busy || active || !node.executable} checked={selected.includes(node.id)} onChange={event => { const checked = event.currentTarget.checked; setSelected(ids => checked ? [...new Set([...ids, node.id])] : ids.filter(id => id !== node.id)); setDirty(true); setConfirmed(false); setFeeAccepted(false); }}/><span>{node.label}{!node.executable && '（非生成节点）'}<br/><code>{node.id}</code></span></label>)}</div>
      {nodes.hasMore && <button type="button" className="zhen-link" disabled={busy || active} onClick={() => void action(() => loadNodes(true))}>加载更多节点</button>}
      <button type="button" className="zhen-secondary zhen-margin" disabled={busy || !online || active || selected.length === 0 || selected.length > 500} onClick={() => void action(async () => { const version = generation.current; unwrap(await api.canvasRunQuote({ projectId: nodes.projectId, canvasId: nodes.canvasId, canvasRevision: nodes.revision, nodeIds: selected })); if (generation.current === version) setDirty(false); })}>查看运行计划与费用信息</button>
    </div>}
    {view && <article className="zhen-card zhen-margin">
      <strong role="status">{phases[view.phase]}</strong><p>费用未知 · 以画布及对应服务最终结算为准。</p>
      <p>选中 {view.requestedNodeIds.length} 个节点，原生授权执行 {view.authorizedNodeIds.length} 个节点 · revision {view.canvasRevision}</p>
      <div>{view.declarations.map((group, index) => <div key={index} className="zhen-margin"><strong>{group.provider} / {group.model}</strong><p className="zhen-source-path">{group.nodeIds.join('、')}</p></div>)}</div>
      <p className="zhen-muted">画布会把这些节点的生成上下文发送到对应服务。已接收后仅查询原运行，不自动重交。</p>
      {view.phase === 'preview' && <>{dirty && <p>节点选择已变化，请重新查看运行计划。</p>}<label className="zhen-checkbox"><input type="checkbox" checked={confirmed} disabled={busy || dirty} onChange={event => setConfirmed(event.currentTarget.checked)}/>已核对完整执行范围与服务、模型</label><label className="zhen-checkbox"><input type="checkbox" checked={feeAccepted} disabled={busy || dirty} onChange={event => setFeeAccepted(event.currentTarget.checked)}/>我知晓费用未知，生成可能产生费用</label><button type="button" className="zhen-primary zhen-margin" disabled={busy || !online || dirty || !confirmed || !feeAccepted} onClick={() => void action(async () => { unwrap(await api.canvasRunApprove(view.quoteId, confirmed, feeAccepted)); })}>送到画布窗口审批</button></>}
      {view.phase === 'pending' && <><p>在画布窗口核对并批准后，点击下方按钮。尚未批准时只会继续等待。</p><button type="button" className="zhen-primary" disabled={busy || !online} onClick={() => void action(async () => { unwrap(await api.canvasRunSubmit(view.quoteId)); })}>检查窗口审批并单次提交</button></>}
      {view.phase !== 'preview' && <button type="button" className="zhen-secondary zhen-margin" disabled={busy || !online} onClick={() => void action(async () => { unwrap(await api.canvasRunRefresh(view.quoteId)); })}>查询原运行 / 审批进度</button>}
      {view.intent && <p>画布状态：{statuses[view.intent.status] || view.intent.status}<br/>运行意图 <code>{view.intent.id}</code>{view.intent.runId && <><br/>运行 <code>{view.intent.runId}</code></>}</p>}
      <details className="zhen-margin"><summary>计划引用</summary><p className="zhen-source-path">{view.quoteId}<br/>{view.planDigest}<br/>有效期至 {new Date(view.expiresAt).toLocaleString()}</p></details>
    </article>}
    <button type="button" className="zhen-link zhen-margin" disabled={busy} onClick={() => void action(async () => {})}>刷新本地进度</button>
    {!online && <p className="zhen-muted">请先启动并连接画布。</p>}{notice && <p className="zhen-notice" role="status">{notice}</p>}
  </section>;
}
