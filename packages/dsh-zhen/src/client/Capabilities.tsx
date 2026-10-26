import React, { useEffect, useState } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { CapabilityCatalog, CapabilityItem, CapabilityCheck } from 'dsh-zhen';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
const unwrap = <T,>(result: RemoteResult<T>): T => { if (!result.ok) throw result.error; return result.value; };
const readiness = { configured: '对话路由已配置 · 待网关验证', observed: '文档已收录 · 待适配', 'fixture-tested': '本机合同已验证 · 待实网', 'real-read-tested': '公开读取已验证' };
const owners = { dsh: '本应用', canvas: 'T8 画布', host: '本机服务' };
const protocols: Record<CapabilityItem['protocol'], string> = { 'chat-completions': '对话 / 流式文本', 'video-task': '视频任务', 'legacy-video-task': '视频兼容协议', 'image-task': '图像任务', 'audio-task': '音频任务', 'minimax-v2': 'MiniMax V2', 'music-actions': '音乐动作', 'midjourney-actions': 'Midjourney 动作', transcription: '同步转写', 'three-d-task': '3D 任务', decisions: '同步结构化回答', upload: '参考素材上传', wallet: '账户余额读取', registries: '公开动作目录', 'task-queries': '按协议查询与结算' };
function sourceSummary(source:CapabilityCheck['sources'][number],catalog?:CapabilityCatalog):string{
  if(source.state==='unavailable')return '暂不可用';
  const baseline=catalog?.sources.find(item=>item.id===source.id)?.sha256;
  if(baseline&&source.sha256===baseline)return '与记录一致';
  if(!baseline||source.baselineSha256!==baseline)return '检查记录需要刷新';
  if(!source.changed)return '与记录一致';
  if(source.added.length+source.removed.length+source.modified.length)return source.id==='docs'?'模型清单有变化':'动作清单有变化';
  return source.id==='docs'?'文档有更新 · 模型清单未变':'目录有更新 · 动作清单未变';
}

export function Capabilities({ api, onConversation, onConnections }: { api: ZhenRemote; onConversation: () => void; onConnections: () => void }): React.ReactElement {
  const [catalog, setCatalog] = useState<CapabilityCatalog>(), [check, setCheck] = useState<CapabilityCheck>();
  const [query, setQuery] = useState(''), [family, setFamily] = useState('chat'), [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => { let active = true; Promise.all([api.gatewayCatalog(), api.gatewayCatalogCheckSnapshot()]).then(([items, result]) => { if (active) { setCatalog(unwrap(items)); setCheck(unwrap(result)); } }).catch(() => { if (active) setNotice('能力目录暂时不可用。'); }); return () => { active = false; }; }, [api]);
  async function act(task: () => Promise<void>): Promise<void> { setBusy(true); setNotice(''); try { await task(); } catch (error) { setNotice(error instanceof Error ? error.message : '检查未完成，当前目录保留。'); } finally { setBusy(false); } }
  const words = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = catalog?.items.filter(item => (!family || item.family === family) && words.every(word => `${item.key} ${item.title} ${item.section} ${catalog.families.find(value => value.id === item.family)?.title} ${item.billingSku ?? ''}`.toLowerCase().includes(word))) ?? [];
  return <>
    <section className="zhen-card" aria-label="模型与能力目录">
      <div className="zhen-section-heading"><h2>模型与创作能力</h2><span>{catalog ? `${catalog.families.length} 类 · ${catalog.items.length} 项记录` : '读取目录中…'}</span></div>
      <p>按创作目标查找模型与动作，先看可用状态，再选择执行方式。</p>
      <p className="zhen-muted">默认仍为 DeepSeek V4.1 Flash。{catalog?`${catalog.items.filter(item=>item.kind==='model'&&item.family==='chat'&&item.readiness==='configured').length} 款对话模型已配置文字路由，可在会话的模型菜单中选择。`:'正在读取已配置的对话模型…'}视觉、音视频输入及其他高级能力仍需逐项验证。此目录同时收录尚待适配的创作能力。</p>
      <div className="zhen-actions zhen-wrap"><button type="button" className="zhen-primary" onClick={onConversation}>进入会话选模型</button><button type="button" className="zhen-secondary" onClick={onConnections}>查看画布连接</button></div>
      <label className="zhen-label" htmlFor="zhen-capability-search">查找模型、动作或创作方式</label>
      <input id="zhen-capability-search" className="zhen-input" value={query} maxLength={200} onChange={event => { setQuery(event.target.value); setOffset(0); }} placeholder="例如 DeepSeek、Suno、MiniMax、图像、语音…"/>
      <div className="zhen-actions zhen-wrap zhen-margin" aria-label="能力分类">{[{ id: '', title: '全部' }, ...(catalog?.families ?? [])].map(item => <button type="button" key={item.id} className={family === item.id ? 'zhen-primary' : 'zhen-secondary'} aria-pressed={family === item.id} onClick={() => { setFamily(item.id); setOffset(0); }}>{item.title}</button>)}</div>
      {catalog && <p className="zhen-muted">目录记录时间：{new Date(catalog.observedAt).toLocaleString()}。数量表示覆盖记录，不表示所有能力均已可执行。</p>}
    </section>
    <section className="zhen-card" aria-label="能力目录更新">
      <div className="zhen-section-heading"><h2>网关能力更新</h2><button type="button" className="zhen-secondary" disabled={busy} onClick={() => void act(async () => { setCheck(unwrap(await api.gatewayCatalogCheck())); })}>{busy ? '检查中…' : '检查文档与动作变化'}</button></div>
      <label className="zhen-checkbox"><input type="checkbox" disabled={busy || !check} checked={check?.automatic ?? false} onChange={event => { const enabled = event.target.checked; void act(async () => { unwrap(await api.gatewayCatalogAutomatic(enabled)); setCheck(unwrap(await api.gatewayCatalogCheckSnapshot())); }); }}/><span>每日检查公开文档与动作目录</span></label>
      <p className="zhen-muted">只读取公开资料，不附带令牌，不运行生成任务。新增动作会先成为待适配变更，当前模型与工具保持原配置。</p>
      {check?.checkedAt && <p className="zhen-muted">最近检查：{new Date(check.checkedAt).toLocaleString()}</p>}
      {check?.sources.map(source => <details key={source.id} className="zhen-margin"><summary>{source.id === 'docs' ? 'API 文档' : source.id === 'music' ? 'Suno / Flow Music 动作' : 'Midjourney 动作'} · {sourceSummary(source,catalog)}</summary><p className="zhen-source-path">{source.sha256}</p>{source.changed&&<p className="zhen-muted">参数、限额及接口说明仍需审阅；清单未变不代表所有接口条件都未变化。当前模型继续使用已配置的版本。</p>}{[...source.added.map(id => `新增 ${id}`), ...source.removed.map(id => `移除 ${id}`), ...source.modified.map(id => `约束变化 ${id}`)].map(text => <p className="zhen-source-path" key={text}>{text}</p>)}</details>)}
    </section>
    {notice && <div className="zhen-notice" role="status">{notice}</div>}
    <div className="zhen-card"><div className="zhen-section-heading"><h2>匹配的能力</h2><span>{matches.length} 项</span></div>
      {matches.slice(offset, offset + 24).map(item => <details key={item.key} className="zhen-capability-row"><summary><span>{item.title}</span><span className="zhen-muted">{readiness[item.readiness]}</span></summary>
        <p className="zhen-source-path">{item.key}</p><p className="zhen-muted">{protocols[item.protocol]} · {item.sync ? '可直接返回' : '提交后查询任务'} · 计划执行方：{owners[catalog!.families.find(value => value.id === item.family)!.owner]}</p>
        {item.billingSku && <p className="zhen-source-path">计费 SKU：{item.billingSku}</p>}
        <p className="zhen-muted">来源章节：{item.section}{item.line ? ` · 第 ${item.line} 行` : ''}</p>
        {!!item.required.length && <p className="zhen-source-path">登记的必填字段：{item.required.join('、')}（完整条件以专节为准）</p>}
        {!!item.versions.length && <p className="zhen-source-path">登记版本：{item.versions.join('、')}</p>}
        {item.referenceType && <p className="zhen-muted">引用类型：{item.referenceType}{item.requiresIndex ? ' · 需选图序号或按钮 ID' : ''}{item.requiresVersion ? ' · 需明确模型版本' : ''}</p>}
        <a className="zhen-link" href={catalog!.sources.find(source => source.id === (item.kind === 'action' ? item.family === 'midjourney' ? 'midjourney' : 'music' : 'docs'))!.url} target="_blank" rel="noreferrer">查看公开来源 ↗</a>
      </details>)}
      {!matches.length && <p className="zhen-muted">没有匹配项，试试其他分类或模型名称。</p>}
      <div className="zhen-actions zhen-wrap zhen-margin"><button type="button" className="zhen-secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 24))}>上一页</button><span className="zhen-muted">{matches.length ? `${offset + 1}–${Math.min(matches.length, offset + 24)}` : '0'} / {matches.length}</span><button type="button" className="zhen-secondary" disabled={offset + 24 >= matches.length} onClick={() => setOffset(offset + 24)}>下一页</button></div>
    </div>
  </>;
}
