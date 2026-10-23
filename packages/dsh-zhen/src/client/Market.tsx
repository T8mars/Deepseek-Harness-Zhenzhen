import React, { useEffect, useRef, useState } from 'react';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { MarketItem, SkillPackage, SkillFeedSnapshot, SkillAutoPolicy } from 'dsh-zhen';
import { LocalSkills } from './LocalSkills.tsx';
import { GithubSkills } from './GithubSkills.tsx';
import {RestoredSkillReview} from './RestoredSkillReview.tsx';
import {RestoredSkillManagement} from './RestoredSkillManagement.tsx';
import {useRemoteAction, type CurrentAction, type RemoteAction} from './useRemoteAction.ts';

function unwrap<T>(value: RemoteResult<T>): T { if (!value.ok) throw value.error; return value.value; }
const labels = { writing: '写作', visual: '视觉', workflow: '制作流程', personal: '我的版本' };

export function Market({ api }: { api: ZhenRemote }): React.ReactElement {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [preview, setPreview] = useState<SkillPackage>();
  const [previous, setPrevious] = useState<SkillPackage>();
  const [feed, setFeed] = useState<SkillFeedSnapshot>();
  const [policy, setPolicy] = useState<SkillAutoPolicy>();
  const [versions, setVersions] = useState<SkillPackage[]>([]);
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState(false);
  const scope = useRemoteAction(api);
  const {busy, notice, setNotice} = scope;
  const detailRevision = useRef(0), draftRevision = useRef(0);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const [managedRevision,setManagedRevision]=useState(0),catalogRevision=useRef(0);
  async function refresh(current: CurrentAction): Promise<void> {
    const version=++catalogRevision.current;
    const [catalog, source, automatic] = await Promise.all([api.marketList(), api.marketFeedSnapshot(), api.marketAutoPolicy()]);
    if (!current()||version!==catalogRevision.current) return;
    const nextItems = unwrap(catalog), nextFeed = unwrap(source), nextPolicy = unwrap(automatic);
    setItems(nextItems); setFeed(nextFeed); setPolicy(nextPolicy);
  }
  useEffect(() => {
    const current = scope.capture();
    detailRevision.current++; draftRevision.current++; setItems([]); setPreview(undefined); setPrevious(undefined); setFeed(undefined); setPolicy(undefined); setVersions([]); setBody(''); setEditing(false); setRefreshNeeded(false);
    void refresh(current).catch(() => { if (current()) setNotice('技能目录暂时不可用。'); });
  }, [api]);
  const act = (task: RemoteAction): Promise<void> => scope.run(task, refresh);
  async function open(item: MarketItem, digest = item.manifest.digest, version = item.manifest.version): Promise<void> {
    await act(async current => {
      const detail = ++detailRevision.current, selected = () => current() && detailRevision.current === detail;
      const next = unwrap(await api.marketPreview(item.manifest.id, digest, version)); if (!selected()) return;
      const retained = unwrap(await api.marketVersions(item.manifest.id)); if (!selected()) return;
      const prior = item.installedDigest && (item.installedDigest !== digest || item.installedVersion !== version) ? unwrap(await api.marketPreview(item.manifest.id, item.installedDigest, item.installedVersion)) : undefined;
      if (!selected()) return;
      setPreview(next); setVersions(retained); setPrevious(prior); setEditing(false); setBody(''); draftRevision.current++;
    });
  }
  const selected = items.find(item => item.manifest.id === preview?.manifest.id);
  const isInstalledVersion = !!preview && selected?.installedVersion === preview.manifest.version && selected.installedDigest === preview.manifest.digest;
  const visible = items.filter(item => (filter === 'all' || (filter === 'installed' ? !!item.installedVersion : filter === 'updates' ? item.updateAvailable : item.manifest.category === filter)) && `${item.manifest.title} ${item.manifest.description} ${item.manifest.id}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="zhen-settings">
    <RestoredSkillReview api={api}/>
    <RestoredSkillManagement api={api} onChanged={()=>{setManagedRevision(value=>value+1);void refresh(scope.capture()).catch(()=>setRefreshNeeded(true));}}/>
    <section className="zhen-card">
      <div className="zhen-section-heading"><h2>技能市场</h2><span>内置与发布源：{items.filter(item => item.enabled).length} 项已启用 · {items.length} 项可浏览</span></div>
      <p className="zhen-muted">安装后在会话中输入 / 调用。已打开会话的指令列表会缓存，安装后请新建会话或刷新页面。正文与版本保存在本机。</p>
      <label className="zhen-label" htmlFor="zhen-skill-search">查找创作技能</label>
      <input id="zhen-skill-search" className="zhen-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索分镜、字幕、提示词…"/>
      <div className="zhen-actions zhen-wrap zhen-margin" aria-label="技能分类">{[['all', '全部'], ['installed', '已安装'], ['updates', `有新版 ${items.filter(item => item.updateAvailable).length}`], ...Object.entries(labels)].map(([value, label]) => <button key={value} type="button" className={filter === value ? 'zhen-primary' : 'zhen-secondary'} aria-pressed={filter === value} onClick={() => setFilter(value!)}>{label}</button>)}</div>
      <p className="zhen-muted">内置与发布源项目仅含文字指令、无程序安装步骤。发现新版后可对照当前正文，再安排下次启动启用；你的个人版本保留。本机技能目录在下方单独连接。</p>
    </section>
    <section className="zhen-card" aria-label="技能更新来源">
      <div className="zhen-section-heading"><h2>技能更新</h2><button type="button" className="zhen-secondary" disabled={busy} onClick={() => void act(async current => { const next = unwrap(await api.marketFeedCheck()); if (current()) setFeed(next); })}>{busy ? '处理中…' : '检查并下载候选'}</button></div>
      <p className="zhen-muted">来源：<a className="zhen-link" href="https://github.com/T8mars/Deepseek-Harness-Zhenzhen" target="_blank" rel="noreferrer">T8mars / Deepseek-Harness-Zhenzhen ↗</a></p>
      <p role="status">{feed?.message ?? '正在读取本机目录状态…'}</p>
      {feed?.checkedAt && <p className="zhen-muted">最近检查：{new Date(feed.checkedAt).toLocaleString()}{feed.revision ? ` · 已校验提交 ${feed.revision.slice(0, 12)} · ${feed.count} 项候选` : ''}</p>}
      <label className="zhen-checkbox"><input type="checkbox" disabled={busy || !feed} checked={feed?.automatic ?? false} onChange={event => { const enabled = event.target.checked; void act(async current => { unwrap(await api.marketFeedAutomatic(enabled)); }); }}/><span>每日自动检查并下载候选正文</span></label>
      <p className="zhen-muted">默认匿名检查；私有来源可到更新中心配置只读凭据，Host 仅向固定 GitHub API 发送。会话与本地资料不会发送。内容固定到具体提交并校验摘要；下载不会更换正在使用的技能。</p>
      <label className="zhen-checkbox"><input type="checkbox" disabled={busy || !policy} checked={policy?.enabled ?? false} onChange={event => { const enabled = event.target.checked; void act(async current => { unwrap(await api.marketAutoUpdates(enabled)); if (!current()) return; setNotice(enabled ? '已信任此发布源的纯文字更新；符合条件的已启用技能将自动安排下次启动更新。' : '已关闭自动安排，并取消自动队列；你手动审阅的待启用版本保留。'); }); }}/><span>信任此发布源，自动安排已启用技能的纯文字更新</span></label>
      <p className="zhen-muted">默认关闭。开启后不再逐版确认，更新在下次启动生效。指令会影响模型行为；不会自动安装新技能、覆盖个人副本或扩大工具权限。每日检查与自动安排可分别关闭。</p>
      {policy && policy.pendingAutomatic > 0 && <p className="zhen-margin" role="status">已有 {policy.pendingAutomatic} 项自动更新等待下次启动。请先完成当前工作，再重新启动 DSH-zhen。</p>}
    </section>
    <LocalSkills api={api} query={query} refreshRevision={managedRevision}/>
    <GithubSkills api={api} query={query} refreshRevision={managedRevision}/>
    {notice && <div className="zhen-notice" role="status">{notice}{refreshNeeded && <p><button type="button" className="zhen-link" onClick={() => window.location.reload()}>刷新页面以更新会话指令列表</button></p>}</div>}
    {preview && <section className="zhen-card" aria-label="技能详情">
      <div className="zhen-section-heading"><h2>{preview.manifest.title}</h2><button type="button" className="zhen-link" onClick={() => { detailRevision.current++; draftRevision.current++; setPreview(undefined); setPrevious(undefined); setVersions([]); setBody(''); setEditing(false); }}>关闭详情</button></div>
      <p>{preview.manifest.description}</p>
      <p className="zhen-muted">版本 {preview.manifest.version} · {preview.manifest.source === 'personal' ? '本机个人副本' : 'DSH-zhen 发布源'} · MIT · DSH {preview.manifest.host}</p>
      <p className="zhen-source-path">SHA-256：{preview.manifest.digest}</p>
      <p className="zhen-muted">声明：无附带程序、无依赖、无网络权限申请。技能指令仍可能影响模型行为，请阅读后安装；工具授权由应用另行处理。</p>
      {previous && (previous.manifest.digest !== preview.manifest.digest || previous.manifest.version !== preview.manifest.version) && <details className="zhen-margin"><summary>对照当前启用版本 {previous.manifest.version}</summary>{previous.content === preview.content && <p className="zhen-muted">两个版本的正文相同；版本清单与标识仍分别保留。</p>}<pre className="zhen-excerpt" tabIndex={0}>{previous.content}</pre></details>}
      <pre className="zhen-excerpt" tabIndex={0}>{preview.content}</pre>
      <div className="zhen-actions zhen-wrap zhen-margin">
        <button type="button" className="zhen-primary" disabled={busy || (selected?.enabled && isInstalledVersion && !selected.pendingVersion)} onClick={() => void act(async current => {
          unwrap(await api.marketSelect(preview.manifest.id, preview.manifest.digest, preview.manifest.version)); if (!current()) return;
          setRefreshNeeded(true);
          const retained = unwrap(await api.marketVersions(preview.manifest.id)); if (!current()) return; setVersions(retained);
          setNotice(selected?.installedVersion && !isInstalledVersion ? '已安排此版本在下次启动启用；当前加载状态保持不变。' : '技能已启用。可以在会话中输入 / 调用。');
        })}>{selected?.enabled && isInstalledVersion ? '当前已启用' : selected?.installedVersion && !isInstalledVersion ? '已审阅，下次启动启用' : '已审阅，安装并启用'}</button>
        <button type="button" className="zhen-secondary" disabled={busy} onClick={() => { draftRevision.current++; setEditing(!editing); setBody(preview.content.slice(preview.content.indexOf('\n---\n', 4) + 5).trim()); }}>另存我的版本</button>
        {selected?.enabled && <button type="button" className="zhen-link" disabled={busy} onClick={() => void act(async current => { unwrap(await api.marketDisable(preview.manifest.id)); if (!current()) return; setRefreshNeeded(true); setNotice('已停用，后续不会加载此技能。历史正文和你的作品保留。'); })}>停用</button>}
      </div>
      {selected?.installedVersion && preview.manifest.source !== 'personal' && <label className="zhen-checkbox"><input type="checkbox" disabled={busy} checked={selected.automaticPaused} onChange={event => { const paused = event.target.checked; void act(async current => { unwrap(await api.marketPauseAuto(preview.manifest.id, paused)); if (!current()) return; setNotice(paused ? '已固定此技能的选择；自动队列已取消，手动审阅的选择保留。' : '已恢复跟随发布源，仍以全局自动更新策略为准。'); }); }}/><span>固定此技能的选择，暂停自动更新</span></label>}
      {selected?.pendingVersion && <div className="zhen-notice"><p>{selected.pendingMode === 'automatic' ? '自动安排' : '手动审阅'} · 待下次启动：{selected.pendingVersion}{selected.pendingRevision ? ` · 来源提交 ${selected.pendingRevision.slice(0, 12)}` : ''}。请先完成当前工作，再重新启动 DSH-zhen。</p><button type="button" className="zhen-link" disabled={busy} onClick={() => void act(async current => { unwrap(await api.marketCancelPending(preview.manifest.id)); if (!current()) return; setNotice('已取消待启用版本；这个版本不会再被自动安排。之后的新版本仍按所选策略处理。'); })}>{selected.pendingMode === 'automatic' ? '跳过此自动更新' : '取消待启用版本'}</button></div>}
      {editing && <form onSubmit={event => { event.preventDefault(); void act(async current => { const draft = draftRevision.current; unwrap(await api.marketFork(preview.manifest.id, preview.manifest.digest, body, preview.manifest.version)); if (!current()) return; setRefreshNeeded(true); if (draftRevision.current === draft) { setEditing(false); setBody(''); } setNotice(draftRevision.current === draft ? '已另存并启用独立的个人版本；原技能保持不变。' : '已保存提交时的个人版本；你后来编辑的内容已保留，可再次保存。'); }); }}>
        <label className="zhen-label" htmlFor="zhen-skill-body">我的技能正文</label><textarea id="zhen-skill-body" className="zhen-input zhen-skill-editor" value={body} maxLength={60000} onChange={event => { const value = event.currentTarget.value; draftRevision.current++; setBody(value); }}/><button className="zhen-primary" disabled={busy || !body.trim()}>保存我的版本</button>
      </form>}
      {versions.length > 0 && <details className="zhen-margin"><summary>本机保留的版本（可审阅后切换）</summary><div className="zhen-actions zhen-wrap zhen-margin">{versions.map(version => <button type="button" key={`${version.manifest.id}@${version.manifest.version}`} className="zhen-secondary" disabled={busy} onClick={() => { draftRevision.current++; setPreview(version); setBody(''); setEditing(false); }}>{version.manifest.version} · {version.manifest.digest.slice(0, 10)}</button>)}</div></details>}
    </section>}
    <div className="zhen-grid">{visible.map(item => <button key={item.manifest.id} type="button" className="zhen-feature" disabled={busy} onClick={() => void open(item)}>
      <span className="zhen-feature-number">{labels[item.manifest.category]} · {item.manifest.version}</span><h3>{item.manifest.title}<span aria-hidden="true">↗</span></h3><p>{item.manifest.description}</p>
      <span className="zhen-skill-state">{item.pendingVersion ? `${item.pendingMode === 'automatic' ? '自动安排' : '待启动启用'} ${item.pendingVersion}` : item.enabled ? `已启用 ${item.installedVersion}${item.automaticPaused ? ' · 固定选择' : item.automaticFollowing ? ' · 自动跟随' : ''}${item.updateAvailable ? ' · 有新版' : ''}` : item.installedVersion ? '已停用' : '查看与安装'}</span>
    </button>)}</div>
    {!visible.length && <p className="zhen-muted" role="status">没有匹配的技能，试试其他关键词。</p>}
  </div>;
}
