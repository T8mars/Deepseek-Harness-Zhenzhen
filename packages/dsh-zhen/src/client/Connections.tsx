import React, { useEffect, useState } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { CanvasConnection, CanvasToolCatalog, CanvasDiscovery } from 'dsh-zhen';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import { McpMarket } from './McpMarket.tsx';
import { CanvasPairingPanel } from './CanvasPairing.tsx';
import { CanvasWorkflowPanel } from './CanvasWorkflow.tsx';
import { CanvasRunPanel } from './CanvasRun.tsx';
function unwrap<T>(result: RemoteResult<T>): T { if (!result.ok) throw result.error; return result.value; }

export function Connections({ api }: { api: ZhenRemote }): React.ReactElement {
  const [status, setStatus] = useState<CanvasConnection>();
  const [root, setRoot] = useState('');
  const [instance, setInstance] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [catalog, setCatalog] = useState<CanvasToolCatalog>();
  const [discovery, setDiscovery] = useState<CanvasDiscovery>();
  const [expectedDigest, setExpectedDigest] = useState('');
  useEffect(() => { let active = true; api.canvasStatus().then(result => { if (active) { const value = unwrap(result); setStatus(value); setRoot(value.root); setInstance(value.instance ?? ''); } }).catch(() => { if (active) setNotice('连接状态暂时不可用。'); }); return () => { active = false; }; }, [api]);
  async function action(task: () => Promise<void>): Promise<void> { setBusy(true); setNotice(''); try { await task(); } catch (error) { setNotice(error instanceof Error ? error.message : '连接未完成。'); } finally { setBusy(false); } }
  return <div className="zhen-settings">
    <section className="zhen-card">
      <div className="zhen-section-heading"><h2>MCP 与创作工具</h2><span>内置连接器</span></div>
      <p className="zhen-muted">将现有创作工具接入会话。每个连接器显示执行范围与来源，安装和更新后仍使用工具本身的权限。</p>
    </section>
    <section className="zhen-card">
      <div className="zhen-section-heading"><h2>T8 贞贞无限画布</h2><span>{status?.connected ? '控制面在线' : status?.configured ? '已配置，等待应用' : '待连接'}</span></div>
      <p>查看画布、节点、素材与已有任务，用画布现有的图像、视频、音频、剧本、Story 和编辑能力生成创作方案与预览。</p>
      <p className="zhen-muted">来源：T8mars/T8-penguin-canvas 的已安装 zcanvas-cli。现提供 10 个检查与规划入口，复用版本化能力清单。方案不会直接修改画布或提交付费生成。</p>
      <button type="button" className="zhen-secondary" disabled={busy} onClick={() => void action(async () => { setDiscovery(unwrap(await api.canvasDiscover())); })}>检测本机画布</button>
      {discovery && <div className="zhen-margin" role="region" aria-label="检测到的画布安装">
        <p className="zhen-muted">{discovery.candidates.length ? '找到以下安装。选择后再信任连接，兼容性以画布实际报告为准。' : '未找到完整的 Agent 工具安装。请在画布设置中安装或修复，也可手动填写已有目录。'}</p>
        {discovery.candidates.map(candidate => <div className="zhen-card zhen-margin" key={candidate.root}>
          <strong>画布 Agent 工具 · {candidate.cliVersion}</strong><p className="zhen-source-path">{candidate.root}</p>
          <details><summary>版本摘要</summary><p className="zhen-source-path">CLI {candidate.digest}<br/>节点 {candidate.nodeSchemaDigest}<br/>模型 {candidate.providerCatalogDigest}</p></details>
          <button type="button" className="zhen-secondary zhen-margin" disabled={busy} onClick={() => { setRoot(candidate.root); setExpectedDigest(candidate.digest); setNotice('已选择检测到的安装。检查目录与版本后，点击“信任此 CLI 并连接”。'); }}>选择此安装</button>
        </div>)}
        {discovery.issues.map((message, index) => <p key={index} className="zhen-muted">{message}</p>)}
      </div>}
      <form onSubmit={event => { event.preventDefault(); void action(async () => { setCatalog(undefined); setStatus(unwrap(await api.connectCanvas(root, instance, expectedDigest))); setNotice('连接配置已保存。应用在线后，可在下方发起画布窗口配对。'); }); }}>
        <label className="zhen-label" htmlFor="zhen-canvas-root">已安装的 zcanvas-cli 目录</label>
        <input id="zhen-canvas-root" className="zhen-input" value={root} onChange={event => { setRoot(event.target.value); setExpectedDigest(''); }} placeholder="包含 manifest.json 和 src 的绝对目录" maxLength={4096} disabled={busy}/>
        <p className="zhen-muted">DSH-zhen 将加载这个目录的本地 CLI 代码，复用其配对存储与兼容检查；仅选择你信任的已安装版本。目录内容变化时会要求重新连接。</p>
        <label className="zhen-label" htmlFor="zhen-canvas-instance">实例 ID（仅多个画布实例时填写）</label>
        <input id="zhen-canvas-instance" className="zhen-input" value={instance} onChange={event => setInstance(event.target.value)} maxLength={128} disabled={busy}/>
        <div className="zhen-actions zhen-wrap zhen-margin"><button className="zhen-primary" disabled={busy || !root.trim()}>信任此 CLI 并连接</button><button type="button" className="zhen-secondary" disabled={busy || !status?.configured} onClick={() => void action(async () => { setCatalog(undefined); setStatus(unwrap(await api.canvasStatus())); })}>检查连接</button><button type="button" className="zhen-secondary" disabled={busy || !status?.connected} onClick={() => void action(async () => { setCatalog(undefined); setCatalog(unwrap(await api.canvasTools()) ?? undefined); })}>读取创作能力</button>{status?.configured && <button type="button" className="zhen-link" disabled={busy} onClick={() => void action(async () => { unwrap(await api.disconnectCanvas()); setCatalog(undefined); setStatus(unwrap(await api.canvasStatus())); setNotice('已断开 DSH-zhen 连接。画布中的配对可在画布端单独撤销。'); })}>断开连接</button>}</div>
      </form>
      {status && <p className="zhen-muted zhen-margin" role="status">{status.message} · {status.code}</p>}
      {status?.configured && <CanvasPairingPanel key={`${status.root}:${status.digest}:${status.instance ?? ''}`} api={api} online={status.connected}/>}
      {status?.configured && <CanvasWorkflowPanel key={`workflow:${status.root}:${status.digest}:${status.instance ?? ''}`} api={api} online={status.connected}/>}
      {status?.configured && <CanvasRunPanel key={`run:${status.root}:${status.digest}:${status.instance ?? ''}`} api={api} online={status.connected}/>}
      {status?.compat != null && <details><summary>画布兼容报告（原样回报）</summary><pre className="zhen-excerpt">{JSON.stringify(status.compat, null, 2)}</pre></details>}
      {catalog && <details className="zhen-margin" open><summary>可规划的创作能力 · {catalog.tools.length} 项</summary><p className="zhen-muted">版本 {catalog.capabilityManifestVersion}。调用时保留项目、画布与能力版本；本地素材与交付预览仍需画布配对中相应的权限。</p><ul className="zhen-canvas-tool-list" tabIndex={0} aria-label="画布创作能力">{catalog.tools.map(tool => <li key={tool.name}><strong>{tool.creatorLabel}</strong> · {tool.directOperations.join(' / ')}<br/><code>{tool.name}</code></li>)}</ul></details>}
      <details className="zhen-margin"><summary>已开放工具</summary><p className="zhen-muted">canvas_status、canvas_capabilities、canvas_workspaces、canvas_models、canvas_capability_graph、canvas_task_status、canvas_creator_session、canvas_capability_tools、canvas_inspect、canvas_plan</p></details>
      <a className="zhen-link" href="https://github.com/T8mars/T8-penguin-canvas" target="_blank" rel="noreferrer">打开画布项目 ↗</a>
    </section>
    {notice && <div className="zhen-notice" role="status">{notice}</div>}
    <McpMarket api={api}/>
  </div>;
}
