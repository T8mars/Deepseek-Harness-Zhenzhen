import React, { useEffect, useId, useRef, useState } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { CanvasWorkflowInput, CanvasWorkflowView, CanvasWorkspaces, CanvasCandidateView, CanvasModelChoices, CanvasAsset } from 'dsh-zhen';
import {CanvasModelOptions} from './CanvasModelOptions.tsx';
import {CanvasReferences} from './CanvasReferences.tsx';
import {canvasTargetKey,selectedCanvasTarget,refreshedCanvasTarget} from './canvas-target.ts';
import {ActiveCanvasTargets,activeCanvasTarget,activeCanvasUnavailable} from './ActiveCanvasTargets.tsx';
import type {CanvasActiveTargets as ActiveTargets} from 'dsh-zhen';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
function unwrap<T>(result: RemoteResult<T>): T { if (!result.ok) throw result.error; return result.value; }
const phaseLabels: Record<CanvasWorkflowView['phase'], string> = { preview: '待你核对', requesting: '正在送往画布', pending: '等待画布窗口批准', applying: '正在核对应用结果', applied: '已写入画布，尚未启动生成', denied: '画布已拒绝', unknown: '结果尚未确认，请在画布检查；本项不会重发', expired: '方案或窗口审批已过期' };
export function CanvasWorkflowPanel({ api, online }: { api: ZhenRemote; online: boolean }): React.ReactElement {
  const [targets, setTargets] = useState<CanvasWorkspaces>({ canvases: [] });
  const [target, setTarget] = useState(''), [kind, setKind] = useState<CanvasWorkflowInput['kind']>('image'), [prompt, setPrompt] = useState('');
  const [view, setView] = useState<CanvasWorkflowView | null>(null), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [modelChoices,setModelChoices]=useState<CanvasModelChoices>({}),[profile,setProfile]=useState<NonNullable<CanvasWorkflowInput['profile']>>('economy'),[candidatesCount,setCandidatesCount]=useState(1),[ratio,setRatio]=useState<CanvasWorkflowInput['ratio']>(),[duration,setDuration]=useState('');
  const [references,setReferences]=useState<CanvasAsset[]>([]);
  const [candidates, setCandidates] = useState<CanvasCandidateView[]>([]);
  const generation = useRef(0), field = useId();
  const [activeTargets,setActiveTargets]=useState<ActiveTargets>();const targetEpoch=useRef(0);
  useEffect(() => { let active = true; const version = ++generation.current;targetEpoch.current++;setActiveTargets(undefined); setBusy(false); setConfirmed(false);setTargets({canvases:[]});setTarget('');setReferences([]);setModelChoices({});
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
  const selectedTarget=selectedCanvasTarget(targets,target);
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
    <ActiveCanvasTargets report={activeTargets} disabled={busy||!online||active} onRead={()=>void action(async()=>{
      const version=generation.current,epoch=++targetEpoch.current;setActiveTargets(undefined);setTarget('');setReferences([]);setModelChoices({});setConfirmed(false);setDirty(true);
      const result=unwrap(await api.canvasActiveTargets());if(generation.current!==version||targetEpoch.current!==epoch)return;
      setActiveTargets(result);setTargets(result.workspaces);const selected=activeCanvasTarget(result);setTarget(selected?canvasTargetKey(selected):'');
    })} onChoose={windowId=>{if(busy||!online||active||!activeTargets)return;targetEpoch.current++;const selected=activeCanvasTarget(activeTargets,windowId);setTarget(selected?canvasTargetKey(selected):'');setActiveTargets(undefined);setReferences([]);setModelChoices({});setConfirmed(false);setDirty(true);if(!selected)setNotice(activeCanvasUnavailable);}}/>
    <button type="button" className="zhen-secondary" disabled={busy || !online || active} onClick={() => {targetEpoch.current++;setActiveTargets(undefined);void action(async () => { const version = generation.current; const result = unwrap(await api.canvasWorkspaces()); if (generation.current === version) { setTargets(result); setTarget(previous=>refreshedCanvasTarget(result,previous));setReferences([]);setModelChoices({});setConfirmed(false); setDirty(true); } });}}>读取可用画布</button>
    <form onSubmit={event => { event.preventDefault(); const selected = selectedTarget; if (selected) void action(async () => { const version = generation.current; unwrap(await api.canvasWorkflowPreview({ projectId: selected.projectId, canvasId: selected.id, kind, prompt,references:references.map(asset=>({assetId:asset.id,contentRevision:asset.contentRevision,contentHash:asset.contentHash!})),modelChoices,profile,candidates:candidatesCount,...(ratio?{ratio}:{}),...(duration?{duration:Number(duration)}:{}) })); if (generation.current === version) setDirty(false); }); }}>
      <label className="zhen-label" htmlFor={`${field}-target`}>目标画布</label>
      <select id={`${field}-target`} className="zhen-input" disabled={busy || active} value={target} onChange={event => {targetEpoch.current++;setActiveTargets(undefined); setTarget(event.currentTarget.value);setReferences([]);setModelChoices({}); setDirty(true); setConfirmed(false); }}><option value="">读取列表后按名称选择画布</option>{targets.canvases.map(item => <option key={canvasTargetKey(item)} value={canvasTargetKey(item)}>{item.name} · 修订 {item.revision}</option>)}</select>
      {targets.canvases.length>1&&<p className="zhen-muted">请选择这次使用的画布；列表顺序不代表当前窗口。</p>}
      <label className="zhen-label" htmlFor={`${field}-kind`}>创作类型</label>
      <select id={`${field}-kind`} className="zhen-input" value={kind} disabled={busy || active} onChange={event => { const nextKind=event.currentTarget.value as CanvasWorkflowInput['kind'];setKind(nextKind as CanvasWorkflowInput['kind']);if(!['image','edit-image','video','edit-video'].includes(nextKind))setCandidatesCount(1);setReferences(previous=>previous.filter(asset=>['image','edit-image'].includes(nextKind)?asset.kind==='image':nextKind==='audio'?asset.kind==='audio':nextKind==='edit-video'));setModelChoices({});setRatio(undefined);setDuration(''); setDirty(true); setConfirmed(false); }}><option value="image">图片</option><option value="edit-image">图片编辑 / 参考图</option><option value="video">视频</option><option value="edit-video">视频编辑 / 参考</option><option value="audio">音频 / 音乐</option><option value="script">剧本</option><option value="story">Story 分镜</option></select>
      <CanvasModelOptions api={api} projectId={selectedTarget?.projectId??''} canvasId={selectedTarget?.id??''} kind={kind} online={online} disabled={busy||active} value={modelChoices} onChange={value=>{setModelChoices(value);setDirty(true);setConfirmed(false);}}/>
      <CanvasReferences key={`references:${target}:${kind}`} api={api} projectId={selectedTarget?.projectId??''} canvasId={selectedTarget?.id??''} kind={kind} online={online} disabled={busy||active} value={references} onChange={items=>{setReferences(items);setDirty(true);setConfirmed(false);}}/>
      <details className="zhen-margin"><summary>候选与输出设置</summary><label className="zhen-label" htmlFor={`${field}-profile`}>创作策略</label><select id={`${field}-profile`} className="zhen-input" value={profile} disabled={busy||active} onChange={event=>{setProfile(event.currentTarget.value as typeof profile);setDirty(true);setConfirmed(false);}}><option value="economy">省钱预览</option><option value="balanced">平衡创作</option><option value="quality">质量优先</option></select>
        {['image','edit-image','video','edit-video'].includes(kind)&&<><label className="zhen-label" htmlFor={`${field}-candidates`}>候选数（1–8）</label><input id={`${field}-candidates`} className="zhen-input" type="number" min={1} max={8} step={1} value={candidatesCount} disabled={busy||active} onChange={event=>{setCandidatesCount(Number(event.currentTarget.value));setDirty(true);setConfirmed(false);}}/></>}
        {['image','edit-image','video','edit-video','story'].includes(kind)&&<><label className="zhen-label" htmlFor={`${field}-ratio`}>画面比例</label><select id={`${field}-ratio`} className="zhen-input" value={ratio??''} disabled={busy||active} onChange={event=>{setRatio((event.currentTarget.value||undefined) as typeof ratio);setDirty(true);setConfirmed(false);}}><option value="">由画布推荐</option>{['1:1','16:9','9:16','4:3','3:4'].map(value=><option value={value} key={value}>{value}</option>)}</select></>}
        {['video','edit-video','story'].includes(kind)&&<><label className="zhen-label" htmlFor={`${field}-duration`}>时长（秒，留空由画布推荐）</label><input id={`${field}-duration`} className="zhen-input" type="number" min={1} max={86400} step={1} value={duration} disabled={busy||active} onChange={event=>{setDuration(event.currentTarget.value);setDirty(true);setConfirmed(false);}}/></>}
        <p className="zhen-muted">最终规格需通过所选模型校验。增加候选可能增加后续生成费用；此处只准备方案，生成另行报价和窗口审批。</p></details>
      <label className="zhen-label" htmlFor={`${field}-prompt`}>这次想创作什么？</label>
      <textarea id={`${field}-prompt`} className="zhen-input" rows={4} maxLength={12000} value={prompt} disabled={busy || active} onChange={event => { setPrompt(event.currentTarget.value); setDirty(true); setConfirmed(false); }} placeholder="例如：做一组清晨海边的角色分镜，先准备可编辑工作流"/>
      <button className="zhen-secondary" disabled={busy || !online || !target || !prompt.trim() || active || ['edit-image','edit-video'].includes(kind)&&references.length===0}>预览创作方案</button>
    </form>
    <button type="button" className="zhen-link zhen-margin" disabled={busy} onClick={() => void action(async () => {})}>刷新方案进度</button>
    {view && <div className="zhen-card zhen-margin">
      <strong role="status">{phaseLabels[view.phase]}</strong>
      <p>画布 {targets.canvases.find(item => item.id === view.canvasId)?.name || view.canvasId} · 基于 revision {view.canvasRevision}</p>
      <p>{view.action} · {view.candidates} 个候选 · {view.operationCount} 项结构变更</p>
      <details open><summary>此方案的创作目标</summary><pre className="zhen-excerpt">{view.goal}</pre></details>
      {view.models.length > 0 && <p className="zhen-muted">计划模型：{view.models.join('；')}。应用时不执行生成。</p>}
      {view.output&&<p className="zhen-muted">方案策略：{({economy:'省钱预览',balanced:'平衡创作',quality:'质量优先'} as Record<string,string>)[view.output.profile]??view.output.profile}{['create.image','create.edit-image','create.video','create.edit-video','create.story'].includes(view.action)&&view.output.ratio?` · 比例 ${view.output.ratio}`:''}{['create.video','create.edit-video','create.story'].includes(view.action)&&view.output.durationSeconds?` · 时长 ${view.output.durationSeconds} 秒`:''}。后续运行以画布报价和审批为准。</p>}
      {!!view.references?.length&&<details open><summary>本方案参考素材 · {view.references.length}</summary><ol>{view.references.map(asset=><li key={asset.id}>{asset.name} · 版本 {asset.contentRevision} · 内容摘要 {asset.contentHash?.slice(0,12)}</li>)}</ol><p className="zhen-muted">送审与应用前会重新核对素材；需要修改时请重新预览。</p></details>}
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
