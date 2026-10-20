import React, { useEffect, useId, useRef, useState } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { CanvasWorkflowInput, CanvasWorkflowView, CanvasWorkspaces, CanvasCandidateView } from 'dsh-zhen';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
function unwrap<T>(result: RemoteResult<T>): T { if (!result.ok) throw result.error; return result.value; }
const phaseLabels: Record<CanvasWorkflowView['phase'], string> = { preview: '待你核对', requesting: '正在送往画布', pending: '等待画布窗口批准', applying: '正在核对应用结果', applied: '已写入画布，尚未启动生成', denied: '画布已拒绝', unknown: '结果尚未确认，请在画布检查；本项不会重发', expired: '方案或窗口审批已过期' };
export function CanvasWorkflowPanel({ api, online }: { api: ZhenRemote; online: boolean }): React.ReactElement {
  const [targets, setTargets] = useState<CanvasWorkspaces>({ canvases: [] });
  const [target, setTarget] = useState(''), [kind, setKind] = useState<CanvasWorkflowInput['kind']>('image'), [prompt, setPrompt] = useState('');
  const [view, setView] = useState<CanvasWorkflowView | null>(null), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [candidates, setCandidates] = useState<CanvasCandidateView[]>([]);
  const generation = useRef(0), field = useId();
  useEffect(() => { let active = true; const version = ++generation.current; setBusy(false); setConfirmed(false);
    api.canvasWorkflowSnapshot().then(result => { if (active && generation.current === version) setView(unwrap(result)); }).catch(() => { if (active && generation.current === version) setNotice('方案进度尚未读到，可刷新进度。'); });
    return () => { active = false; generation.current++; };
  }, [api, online]);
  useEffect(() => {
    if (busy) return;
    let active = true, loading = false;
    const refresh = async () => { if (loading) return; loading = true; const version = generation.current; try { const result = unwrap(await api.canvasCandidates()); if (active && generation.current === version) setCandidates(result); } catch {} finally { loading = false; } };
    void refresh(); const interval = setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [api, busy]);
  async function action(run: () => Promise<void>): Promise<void> {
    const version = ++generation.current; setBusy(true); setNotice('');
    try { await run(); } catch (error) { if (generation.current === version) setNotice(error instanceof Error ? error.message : '操作未完成，请检查画布。'); }
    finally { if (generation.current === version) { try { const result = unwrap(await api.canvasWorkflowSnapshot()); if (generation.current === version) { setView(result); setConfirmed(false); } } catch {} if (generation.current === version) setBusy(false); } }
  }
  const active = !!view && ['pending', 'requesting', 'applying', 'unknown'].includes(view.phase);
  return <section className="zhen-margin" aria-label="画布创作方案">
    <h3>把灵感变成画布工作流</h3>
    <p className="zhen-muted">选择目标画布，写下目标，先预览一个省钱候选。核对后送到画布窗口审批，再返回应用；本次只创建可编辑工作流，不调用模型。</p>
    <details className="zhen-margin" open={candidates.length > 0}><summary>聊天生成的画布方案 · {candidates.length}</summary>
      <p className="zhen-muted">在聊天中让助手调用 canvas_plan 后，可在这里核对已有方案；选择不会重新规划或请求审批。待选列表只在本次 Host 运行期间保留，已选方案的本地进度会保存。</p>
      {candidates.length === 0 && <p className="zhen-muted">还没有可接收的原生创作计划。检查、运行报价和素材预览不会进入此列表。</p>}
      {candidates.map(candidate => <article className="zhen-card zhen-margin" key={candidate.id}>
        <strong>{candidate.preview.action}</strong><p>{candidate.preview.goal.slice(0, 240)}{candidate.preview.goal.length > 240 ? '…' : ''}</p>
        <p className="zhen-muted">画布 {candidate.preview.canvasId} · revision {candidate.preview.canvasRevision} · {candidate.preview.operationCount} 项变更<br/>会话 {candidate.sourceSessionId} · {new Date(candidate.receivedAt).toLocaleString()}</p>
        <div className="zhen-actions zhen-wrap"><button type="button" className="zhen-secondary" disabled={busy || !online || active} onClick={() => void action(async () => { const version = generation.current; unwrap(await api.canvasCandidateAdopt(candidate.id)); if (generation.current === version) { setDirty(false); setCandidates(items => items.filter(item => item.id !== candidate.id)); } })}>核对此方案</button>
          <button type="button" className="zhen-link" disabled={busy} onClick={() => void action(async () => { const version = generation.current; unwrap(await api.canvasCandidateRemove(candidate.id)); if (generation.current === version) setCandidates(items => items.filter(item => item.id !== candidate.id)); })}>移出列表</button></div>
      </article>)}
    </details>
    <button type="button" className="zhen-secondary" disabled={busy || !online} onClick={() => void action(async () => { const version = generation.current; const result = unwrap(await api.canvasWorkspaces()); if (generation.current === version) { setTargets(result); setTarget(result.canvases[0]?.id ?? ''); setDirty(true); } })}>读取可用画布</button>
    <form onSubmit={event => { event.preventDefault(); const selected = targets.canvases.find(item => item.id === target); if (selected) void action(async () => { const version = generation.current; unwrap(await api.canvasWorkflowPreview({ projectId: selected.projectId, canvasId: selected.id, kind, prompt })); if (generation.current === version) setDirty(false); }); }}>
      <label className="zhen-label" htmlFor={`${field}-target`}>目标画布</label>
      <select id={`${field}-target`} className="zhen-input" disabled={busy || active} value={target} onChange={event => { setTarget(event.currentTarget.value); setDirty(true); setConfirmed(false); }}><option value="">先读取可用画布</option>{targets.canvases.map(item => <option key={item.id} value={item.id}>{item.name} · revision {item.revision}</option>)}</select>
      <label className="zhen-label" htmlFor={`${field}-kind`}>创作类型</label>
      <select id={`${field}-kind`} className="zhen-input" value={kind} disabled={busy || active} onChange={event => { setKind(event.currentTarget.value as CanvasWorkflowInput['kind']); setDirty(true); setConfirmed(false); }}><option value="image">图片</option><option value="video">视频</option><option value="script">剧本</option><option value="story">Story 分镜</option></select>
      <label className="zhen-label" htmlFor={`${field}-prompt`}>这次想创作什么？</label>
      <textarea id={`${field}-prompt`} className="zhen-input" rows={4} maxLength={12000} value={prompt} disabled={busy || active} onChange={event => { setPrompt(event.currentTarget.value); setDirty(true); setConfirmed(false); }} placeholder="例如：做一组清晨海边的角色分镜，先准备可编辑工作流"/>
      <button className="zhen-secondary" disabled={busy || !online || !target || !prompt.trim() || active}>预览创作方案</button>
    </form>
    <button type="button" className="zhen-link zhen-margin" disabled={busy} onClick={() => void action(async () => {})}>刷新方案进度</button>
    {view && <div className="zhen-card zhen-margin">
      <strong role="status">{phaseLabels[view.phase]}</strong>
      <p>画布 {targets.canvases.find(item => item.id === view.canvasId)?.name || view.canvasId} · 基于 revision {view.canvasRevision}</p>
      <p>{view.action} · {view.candidates} 个候选 · {view.operationCount} 项结构变更</p>
      <details open><summary>此方案的创作目标</summary><pre className="zhen-excerpt">{view.goal}</pre></details>
      {view.models.length > 0 && <p className="zhen-muted">计划模型：{view.models.join('；')}。应用时不执行生成。</p>}
      {view.questions.length > 0 && <ul>{view.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>}
      {view.phase === 'preview' && <>{dirty && <p>输入已修改，请重新预览后再确认。</p>}<label className="zhen-checkbox"><input type="checkbox" checked={confirmed} disabled={busy || !view.ready || dirty} onChange={event => setConfirmed(event.currentTarget.checked)}/>已核对目标、模型与变更范围，同意送到画布窗口继续确认</label><button type="button" className="zhen-primary zhen-margin" disabled={busy || !online || !confirmed || !view.ready || dirty} onClick={() => void action(async () => { unwrap(await api.canvasWorkflowApprove(view.id, confirmed)); })}>送到画布窗口确认</button></>}
      {view.phase === 'pending' && <><p>请在画布窗口核对完整变更并批准，然后返回检查。窗口拒绝时不会写入。</p><button type="button" className="zhen-primary" disabled={busy || !online} onClick={() => void action(async () => { unwrap(await api.canvasWorkflowComplete(view.id)); })}>检查窗口审批并应用</button></>}
      {view.phase === 'applied' && <p>当前 revision {view.revision}。可到画布调整节点；生成任务需要另行报价和审批。</p>}
      <details className="zhen-margin"><summary>方案引用</summary><p className="zhen-source-path">{view.planId}<br/>{view.planDigest}{view.approvalRequestId && <><br/>窗口审批 {view.approvalRequestId}</>}</p></details>
    </div>}
    {!online && <p className="zhen-muted">启动并连接画布后可预览与应用。</p>}
    {notice && <p role="status" className="zhen-notice">{notice}</p>}
  </section>;
}
