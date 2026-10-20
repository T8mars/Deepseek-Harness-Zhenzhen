import React, { useEffect, useState } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { McpMarketView } from 'dsh-zhen';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
function unwrap<T>(result: RemoteResult<T>): T { if (!result.ok) throw result.error; return result.value; }
const states = { idle: '未启用', ready: '已加载', draining: '正在等待调用结束', error: '加载失败，请检查程序与目录', unavailable: '等待工具服务' };

export function McpMarket({ api }: { api: ZhenRemote }): React.ReactElement {
  const [view, setView] = useState<McpMarketView>();
  const [workspace, setWorkspace] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<{ id: string; version: string; archiveId?: string }>();
  useEffect(() => { let active = true; api.mcpSnapshot().then(result => { if (active) { const next = unwrap(result); setView(next); setWorkspace(Object.fromEntries(next.snapshot.selections.map(item => [item.id, item.workspace]))); } }).catch(() => { if (active) setNotice('MCP 市场暂时不可用。'); }); return () => { active = false; }; }, [api]);
  async function act(task: () => Promise<void>): Promise<void> {
    setBusy(true); setNotice('');
    try { await task(); const next = unwrap(await api.mcpSnapshot()); setView(next); setWorkspace(current => ({ ...current, ...Object.fromEntries(next.snapshot.selections.map(item => [item.id, item.workspace])) })); }
    catch (error) { setNotice(error instanceof Error ? error.message : '操作未完成，请刷新连接状态。'); try { setView(unwrap(await api.mcpSnapshot())); } catch { /* Keep the last view with the error notice. */ } }
    finally { setBusy(false); }
  }
  return <>
    <section className="zhen-card" aria-label="MCP 市场更新">
      <div className="zhen-section-heading"><h2>MCP 市场</h2><button type="button" className="zhen-secondary" disabled={busy} onClick={() => void act(async () => { unwrap(await api.mcpCheck()); })}>{busy ? '处理中…' : '检查更新'}</button></div>
      <p>添加项目记忆与文件工具，安装、查看版本和停用都在这里完成。</p>
      <p className="zhen-muted">来源：<a href="https://github.com/modelcontextprotocol/servers" target="_blank" rel="noreferrer">Model Context Protocol 参考服务器 ↗</a>。程序以本机用户权限运行；启用前请核对来源和访问范围。</p>
      <label className="zhen-checkbox"><input type="checkbox" disabled={busy || !view} checked={view?.snapshot.automatic ?? false} onChange={event => { const enabled = event.target.checked; void act(async () => { unwrap(await api.mcpAutomatic(enabled)); }); }}/><span>每日检查，并为已启用连接下载兼容的更新候选</span></label>
      <p className="zhen-muted">下载后保留当前版本，审阅并确认后才安排下次启动。未启用的工具不会自动下载。</p>
      <p className="zhen-muted" role="status">{view?.snapshot.message ?? '正在读取本机状态…'}{view && ` · 当前 Node ${view.node}`}</p>
      {view?.snapshot.checkedAt && <p className="zhen-muted">最近检查：{new Date(view.snapshot.checkedAt).toLocaleString()}</p>}
    </section>
    {notice && <div className="zhen-notice" role="status">{notice}</div>}
    {confirm && <section className="zhen-card" aria-label="确认程序维护"><h3>{confirm.archiveId ? '还原保留的程序副本' : '重新下载并校验程序'} · {confirm.id} {confirm.version}</h3><p className="zhen-muted zhen-margin">此连接将先停用，等待已有调用结束，并取消待启动选择。项目文件、记忆数据和旧程序副本保留。{!confirm.archiveId && '同一主版本重新解析的依赖可能变化，请核对新的完整摘要。'}完成后需重新信任启用，并使用新会话。</p><div className="zhen-actions zhen-wrap zhen-margin"><button type="button" className="zhen-primary" disabled={busy} onClick={() => void act(async () => { if (confirm.archiveId) unwrap(await api.mcpRestoreArchive(confirm.archiveId)); else unwrap(await api.mcpRepair(confirm.id, confirm.version)); setConfirm(undefined); setNotice('程序维护完成，连接保持停用。请核对版本与摘要后重新信任启用。'); })}>确认并开始</button><button type="button" className="zhen-secondary" disabled={busy} onClick={() => setConfirm(undefined)}>取消</button></div></section>}
    {view?.recipes.map(recipe => {
      const selected = view.snapshot.selections.find(item => item.id === recipe.id);
      const installed = view.snapshot.installations.filter(item => item.release.id === recipe.id);
      const candidate = view.snapshot.candidates.find(item => item.id === recipe.id);
      const releases = [{ version: recipe.version, integrity: recipe.integrity, node: recipe.node, gitHead: recipe.gitHead, license: recipe.license }, ...(candidate && candidate.version !== recipe.version ? [candidate] : [])];
      return <section key={recipe.id} className="zhen-card" aria-label={recipe.title}>
        <div className="zhen-section-heading"><h2>{recipe.title}</h2><span>{recipe.maintenance ? '正在下载或维护程序' : states[recipe.runtime]}</span></div>
        <p>{recipe.description}</p><p className="zhen-muted">访问范围：{recipe.access}</p>
        <p className="zhen-source-path">npm：{recipe.package}</p>
        <label className="zhen-label" htmlFor={`zhen-mcp-project-${recipe.id}`}>绑定项目的绝对目录</label>
        <input className="zhen-input" id={`zhen-mcp-project-${recipe.id}`} value={workspace[recipe.id] ?? ''} maxLength={4096} disabled={busy || !!selected} onChange={event => setWorkspace(current => ({ ...current, [recipe.id]: event.target.value }))} placeholder="选择与会话工作目录相同的项目目录"/>
        {selected && <p className="zhen-muted">{selected.enabled ? `启用版本 ${selected.active}` : '连接已停用'}{selected.pending ? ` · 已安排 ${selected.pending}，下次 Host 启动生效` : ''}</p>}
        <div className="zhen-actions zhen-wrap zhen-margin">
          {selected?.enabled && <button type="button" className="zhen-secondary" disabled={busy} onClick={() => void act(async () => { unwrap(await api.mcpDisable(recipe.id)); setNotice('已阻止新调用；进行中的操作结束后断开。已有文件改动保留。'); })}>停用连接</button>}
          {selected?.enabled && <button type="button" className="zhen-secondary" disabled={busy || recipe.maintenance} onClick={() => void act(async () => { unwrap(await api.mcpRestart(recipe.id)); setNotice('连接已重新加载；程序版本、项目绑定和记忆文件保持不变。'); })}>重启连接</button>}
          {selected && !selected.enabled && <button type="button" className="zhen-link" disabled={busy} onClick={() => void act(async () => { unwrap(await api.mcpForget(recipe.id)); setNotice('已移除连接配置，程序版本与项目记忆仍保留。现在可绑定其他项目。'); })}>移除连接配置</button>}
          <button type="button" className="zhen-link" disabled={busy} onClick={() => void act(async () => {})}>刷新状态</button>
        </div>
        {[...releases, ...installed.filter(item => !releases.some(release => release.version === item.release.version)).map(item => item.release)].map(release => {
          const local = installed.find(item => item.release.version === release.version);
          const active = !!selected?.enabled && selected.active === release.version;
          const incompatible = view.incompatible.includes(`${recipe.id}@${release.version}`);
          return <details key={release.version} className="zhen-margin" open={release.version === recipe.version}>
            <summary>{release.version}{local ? ' · 已校验下载' : ' · 可下载'}{active ? ' · 当前启用' : ''}{selected?.pending === release.version ? ' · 待重启' : ''}</summary>
            <p className="zhen-muted">Node 要求：{release.node || '发布包未声明，需在本机加载验证'}</p>
            {incompatible && <p role="status">当前 Node 不满足此版本要求，请先更新运行环境。</p>}
            <p className="zhen-source-path">SHA-512：{release.integrity}</p>
            {local && <p className="zhen-source-path">本机程序 SHA-256：{local.digest} · {local.packages} 项固定依赖</p>}
            <p className="zhen-muted">许可：{local?.release.license || release.license || '安装时保存来源提交的完整许可'} · <a href={`https://github.com/modelcontextprotocol/servers/blob/${local?.release.gitHead || release.gitHead || 'main'}/LICENSE`} target="_blank" rel="noreferrer">查看来源许可 ↗</a></p>
            <div className="zhen-actions zhen-wrap">
              {!local && <button type="button" className="zhen-secondary" disabled={busy || incompatible} onClick={() => void act(async () => { unwrap(await api.mcpInstall(recipe.id, release.version, release.integrity)); setNotice('程序已下载并校验。请确认项目目录与访问范围后启用。'); })}>下载并校验此版本</button>}
              {local && <><button type="button" className="zhen-primary" disabled={busy || recipe.maintenance || incompatible || active || selected?.pending === release.version || !(workspace[recipe.id] ?? '').trim()} onClick={() => void act(async () => { unwrap(await api.mcpSelect(recipe.id, release.version, workspace[recipe.id]!)); setNotice(selected?.active && selected.active !== release.version ? '版本已安排下次 Host 启动启用。' : '已保存授权，请核对加载状态；在绑定项目的新会话中调用。'); })}>{active ? '当前版本' : selected?.active && selected.active !== release.version ? '信任并安排下次启动' : '信任程序并启用'}</button><button type="button" className="zhen-secondary" disabled={busy || recipe.maintenance || incompatible} onClick={() => setConfirm({ id: recipe.id, version: release.version })}>重新下载并校验</button></>}
            </div>
          </details>;
        })}
        {view.snapshot.archives.some(item => item.installation.release.id === recipe.id) && <details className="zhen-margin"><summary>保留的程序隔离记录</summary>{view.snapshot.archives.filter(item => item.installation.release.id === recipe.id).slice().reverse().map(item => <div key={item.archiveId} className="zhen-margin"><p>{item.installation.release.version} · {new Date(item.retainedAt).toLocaleString()} · {item.programRetained ? item.verified ? '隔离时匹配原摘要' : '保留了变动或受损文件' : '仅保留版本记录'}</p><p className="zhen-source-path">原程序 SHA-256：{item.installation.digest}</p><button type="button" className="zhen-link" disabled={busy || recipe.maintenance || !item.programRetained || !item.verified} onClick={() => setConfirm({ id: recipe.id, version: item.installation.release.version, archiveId: item.archiveId })}>核对并还原此程序副本</button></div>)}</details>}
        <p className="zhen-muted">首次启用后请新建会话或刷新工具列表。停用、更新或更换项目后，包含旧结果的会话需要新建。项目目录约束工具调用，程序本身没有操作系统沙箱。</p>
      </section>;
    })}
  </>;
}
