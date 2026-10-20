import React, { useEffect, useState } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import { LOCAL_SKILL_POLICY } from 'dsh-zhen/remote';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { LocalSkillDraft, LocalSkillView, LocalSkillBody, LocalSkillMode } from 'dsh-zhen';
const unwrap = <T,>(value: RemoteResult<T>): T => { if (!value.ok) throw value.error; return value.value; };

export function LocalSkills({ api, query = '' }: { api: ZhenRemote; query?: string }): React.ReactElement {
  const [folder, setFolder] = useState(''), [mode, setMode] = useState<LocalSkillMode>('skill');
  const [draft, setDraft] = useState<LocalSkillDraft>(), [views, setViews] = useState<LocalSkillView[]>([]), [body, setBody] = useState<LocalSkillBody>();
  const [trusted, setTrusted] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => { let live = true; api.localSkillList().then(value => { if (live) setViews(unwrap(value)); }).catch(() => { if (live) setNotice('本地技能库暂时不可用。'); }); return () => { live = false; }; }, [api]);
  async function action(work: () => Promise<void>): Promise<void> {
    setBusy(true); setNotice('');
    try { await work(); } catch (error) { setNotice(error instanceof Error ? error.message : '操作未完成，请重新扫描。'); }
    finally { try { setViews(unwrap(await api.localSkillList())); } catch {} setBusy(false); }
  }
  const search = query.toLowerCase().trim();
  const visible = views.map(view => ({ ...view, entries: view.entries.filter(entry => `${entry.name} ${entry.description}`.toLowerCase().includes(search)) })).filter(view => !search || view.entries.length > 0);
  return <section className="zhen-card">
    <div className="zhen-section-heading"><h2>连接你自己的技能</h2><button type="button" className="zhen-secondary" disabled={busy} onClick={() => void action(async () => { setViews(unwrap(await api.localSkillList())); })}>刷新目录</button></div>
    <p className="zhen-muted">连接本机 SKILL.md，保留相对参考资料、脚本和素材目录。这里读取原文件，不复制、上传、执行脚本或安装依赖；使用外部工具时仍需相应连接与授权。</p>
    <form onSubmit={event => { event.preventDefault(); void action(async () => { setDraft(undefined); setBody(undefined); setTrusted(false); setDraft(unwrap(await api.localSkillPreview(folder, mode))); }); }}>
      <label className="zhen-label">目录类型<select className="zhen-input" value={mode} disabled={busy} onChange={event => { setMode(event.target.value as LocalSkillMode); setDraft(undefined); setTrusted(false); }}><option value="skill">单个技能：目录内有 SKILL.md</option><option value="library">整个技能库：各子目录内有 SKILL.md</option></select></label>
      <label className="zhen-label">本机目录<input className="zhen-input" value={folder} maxLength={4096} disabled={busy} onChange={event => { setFolder(event.target.value); setDraft(undefined); setTrusted(false); }} placeholder="粘贴技能或技能库的绝对路径" required/></label>
      <button className="zhen-secondary" disabled={busy || !folder.trim()}>扫描并预览</button>
    </form>
    {draft && <div className="zhen-margin">
      <p className="zhen-source-path">{draft.root}</p><p>识别 {draft.entries.length} 项 · 无法识别 {draft.problems} 项 · 跳过 {draft.skipped} 项</p>
      <details><summary>查看技能清单与正文</summary><div className="zhen-actions zhen-wrap zhen-margin">{draft.entries.map(entry => <button type="button" key={entry.directory} className="zhen-secondary" disabled={busy} onClick={() => void action(async () => { setBody(unwrap(await api.localSkillBody(draft.root, entry.directory, entry.digest))); })}>{entry.name}</button>)}</div></details>
      {body && <div><h3>{body.entry.name}</h3><p>{body.entry.description}</p><pre className="zhen-excerpt" tabIndex={0}>{body.content}</pre></div>}
      <p className="zhen-muted">连接后，目录中的修改和技能库中的新增项会用于后续加载。已进入会话的旧指令无法收回；修改后请新建会话或刷新页面。同名本机技能保留较早连接来源中的首项，其他来源仍按 DSH 的优先级选择。</p>
      <label className="zhen-checkbox"><input type="checkbox" checked={trusted} disabled={busy} onChange={event => setTrusted(event.target.checked)}/>我信任这个本机目录及其后续修改，允许将技能指令用于模型会话。</label>
      <button type="button" className="zhen-primary" disabled={busy || !trusted || !draft.entries.length} onClick={() => void action(async () => { unwrap(await api.localSkillConnect(draft.root, draft.mode, draft.digest, LOCAL_SKILL_POLICY)); setDraft(undefined); setBody(undefined); setTrusted(false); setNotice('目录已连接。请新建会话或刷新页面，在 / 中调用。'); })}>确认并连接目录</button>
    </div>}
    {visible.map(view => <div className="zhen-margin" key={view.source.id}>
      <div className="zhen-section-heading"><strong>{view.state === 'ready' ? `已连接 · ${view.entries.filter(entry => !entry.shadowed).length} ${search ? '项匹配' : '项'}` : view.state === 'disabled' ? '已停用' : '目录不可用，请重新扫描确认'}</strong><span>{view.source.mode === 'skill' ? '单个技能' : '技能库'}</span></div>
      <p className="zhen-source-path">{view.source.root}</p>
      {view.entries.length > 0 && <details><summary>查看已连接技能</summary>{view.entries.map(entry => <p key={entry.directory}><strong>{entry.name}</strong>{entry.shadowed ? ' · 同名项未选中' : ''}{!entry.modelInvocable ? ' · 仅手动调用' : ''}{!entry.userInvocable ? ' · 不显示在 / 菜单' : ''}<span className="zhen-muted"> · {entry.description}</span></p>)}</details>}
      {(view.problems > 0 || view.skipped > 0) && <p className="zhen-muted">无法识别 {view.problems} 项，跳过 {view.skipped} 项；这些内容不会作为新技能加载。</p>}
      <div className="zhen-actions zhen-wrap"><button type="button" className="zhen-secondary" disabled={busy} onClick={() => { setFolder(view.source.root); setMode(view.source.mode); setDraft(undefined); setBody(undefined); setTrusted(false); void action(async () => { setDraft(unwrap(await api.localSkillPreview(view.source.root, view.source.mode))); }); }}>重新扫描并确认</button>{view.source.enabled && <button type="button" className="zhen-link" disabled={busy} onClick={() => void action(async () => { unwrap(await api.localSkillDisable(view.source.id)); setBody(undefined); setNotice('已停止后续加载；请为已加载旧指令的会话新建会话。'); })}>停用</button>}<button type="button" className="zhen-link" disabled={busy} onClick={() => void action(async () => { unwrap(await api.localSkillDisconnect(view.source.id)); setNotice('已断开连接，原文件保留。'); })}>断开连接</button></div>
    </div>)}
    <p className="zhen-muted">这是本机目录连接，不会将内容改成 MIT 或加入发布包。已有技能对特定应用、模型和路径的依赖仍需单独配置。</p>
    {notice && <p className="zhen-notice" role="status">{notice}</p>}
  </section>;
}
