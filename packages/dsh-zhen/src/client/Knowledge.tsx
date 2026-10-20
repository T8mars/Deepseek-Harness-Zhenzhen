import React, { useEffect, useState } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { KnowledgeCollection, KnowledgeHit, KnowledgeSource, KnowledgeBinding } from 'dsh-zhen';
import { SourceWindow } from './RagSources.tsx';
import { knowledgeLocation } from './rag-location.ts';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
const unwrap = <T,>(result: RemoteResult<T>): T => { if (!result.ok) throw result.error; return result.value; };

export function Knowledge({ api }: { api: ZhenRemote }): React.ReactElement {
  const [project, setProject] = useState('个人创作');
  const [collections, setCollections] = useState<KnowledgeCollection[]>([]);
  const [hits, setHits] = useState<KnowledgeHit[]>([]);
  const [source, setSource] = useState<{ project: string; value: KnowledgeSource }>();
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [binding, setBinding] = useState<KnowledgeBinding | null>(null);
  const [workspace, setWorkspace] = useState('');
  useEffect(() => {
    let active = true; setHits([]); setSource(undefined);
    api.knowledgeCollections(project).then(result => { if (active) setCollections(unwrap(result)); }).catch(() => { if (active) setNotice('无法读取资料集合。'); });
    setBinding(null); setWorkspace('');
    api.knowledgeBinding(project).then(result => { if (active) { const value = unwrap(result); setBinding(value); setWorkspace(value?.root ?? ''); } }).catch(() => { if (active) setNotice('无法读取会话绑定。'); });
    return () => { active = false; };
  }, [api, project]);
  async function action(work: () => Promise<void>): Promise<void> {
    setBusy(true); setNotice('');
    try { await work(); setCollections(unwrap(await api.knowledgeCollections(project))); }
    catch (error) { setNotice(error instanceof Error ? error.message : '操作未完成。'); try { setCollections(unwrap(await api.knowledgeCollections(project))); } catch {} }
    finally { setBusy(false); }
  }
  return <div className="zhen-settings">
    <section className="zhen-card"><h2>你的资料，留在本地</h2><p className="zhen-muted">导入 Markdown、TXT、CSV、JSON 或带文字层的 PDF，按中文关键词查找。单文件上限 2 MiB，每次原文件和提取文本分别最多 32 MiB。PDF 最多 200 页、提取文字最多 2 MiB，单次解析限时 12 秒；无文字扫描件会跳过，密码保护或解析失败的文件计入失败，当前不做 OCR。</p>
      <label className="zhen-label" htmlFor="zhen-project">资料所属空间</label><input className="zhen-input" id="zhen-project" value={project} disabled={busy} maxLength={200} onChange={event => setProject(event.target.value)}/>
      <form onSubmit={event => { event.preventDefault(); void action(async () => { const collection = unwrap(await api.createKnowledge(project, name, folder)); const result = unwrap(await api.indexKnowledge(project, collection.id)); setName(''); setFolder(''); setNotice(`导入完成：${result.indexed} 个文件，跳过 ${result.skipped} 个，读取失败 ${result.failed} 个。`); }); }}>
        <div className="zhen-input-pair"><label className="zhen-label">集合名称<input className="zhen-input" value={name} onChange={event => setName(event.target.value)} maxLength={100} required placeholder="例如：分镜参考"/></label><label className="zhen-label">本机资料文件夹<input className="zhen-input" value={folder} onChange={event => setFolder(event.target.value)} maxLength={4096} required placeholder="粘贴完整文件夹路径"/></label></div>
        <button className="zhen-primary" disabled={busy || !project.trim()}>授权此文件夹并在本地索引</button>
        <p className="zhen-muted">此操作只读取所选目录中的文本。不会把资料上传给模型。</p>
      </form>
    </section>
    <section className="zhen-card"><h2>在会话中检索资料</h2><p className="zhen-muted">将此资料空间绑定到会话的实际工作目录。只有这个目录中的 Seedance 会话能使用下方单独授权的集合。</p>
      <form onSubmit={event => { event.preventDefault(); void action(async () => { const next = unwrap(await api.bindKnowledge(project, workspace)); setBinding(next); setHits([]); setNotice(next ? '已绑定工作目录。请逐个勾选允许会话检索的资料集合。' : '已解除会话绑定。'); }); }}><label className="zhen-label" htmlFor="zhen-rag-workspace">会话工作目录（绝对路径）</label><div className="zhen-input-row"><input id="zhen-rag-workspace" value={workspace} maxLength={4096} onChange={event => setWorkspace(event.target.value)} placeholder="填写会话使用的项目文件夹"/><button className="zhen-primary" disabled={busy || !project.trim()}>{workspace.trim() ? '绑定工作目录' : '解除绑定'}</button></div></form>
      <p className="zhen-muted">{binding ? `已绑定：${binding.root}` : '尚未绑定，模型自动检索默认关闭。'}</p><p className="zhen-muted">自动检索片段会进入会话。撤权、重新索引或更换目录后，含旧检索引用的会话会停止继续发送，请新建会话。手动复制的片段由你控制去向。</p>
    </section>
    {collections.map(collection => <section className="zhen-card" key={collection.id}>
      <div className="zhen-section-heading"><h2>{collection.name}</h2><span>{collection.enabled ? '可检索' : '已撤回'} · {collection.documents} 个文件</span></div>
      <p className="zhen-source-path">{collection.root}</p><div className="zhen-actions zhen-wrap">
        <button className="zhen-secondary" disabled={busy || !collection.enabled} onClick={() => void action(async () => { const result = unwrap(await api.indexKnowledge(project, collection.id)); setHits([]); setNotice(`重新索引：${result.indexed} 个文件，跳过 ${result.skipped} 个，失败 ${result.failed} 个。`); })}>更新索引</button>
        <button className="zhen-link" disabled={busy} onClick={() => void action(async () => { unwrap(await api.setKnowledgeAccess(project, collection.id, !collection.enabled, '')); setHits([]); })}>{collection.enabled ? '撤回访问' : '重新允许本地检索'}</button>
      </div>
      <label className="zhen-checkbox"><input type="checkbox" disabled={busy || !collection.enabled} checked={collection.cloudProvider === 'seedance'} onChange={event => { const allowed = event.target.checked; void action(async () => { unwrap(await api.setKnowledgeAccess(project, collection.id, true, allowed ? 'seedance' : '')); setHits([]); }); }}/>允许选中引用发送给 Seedance。资料全文仍保留在本地。</label>
      <label className="zhen-checkbox"><input type="checkbox" disabled={busy || !binding || !collection.enabled || collection.cloudProvider !== 'seedance'} checked={collection.agentEnabled} onChange={event => { const enabled = event.target.checked; void action(async () => { unwrap(await api.setKnowledgeAgentAccess(project, collection.id, enabled)); setHits([]); }); }}/>另行允许已绑定工作目录中的 Seedance 会话自动检索此集合片段。</label>
    </section>)}
    <section className="zhen-card"><h2>查找资料</h2><p className="zhen-muted">可输入人物、专名、关键词或常见中文问题。空格分开的关键词需全部匹配；问句会尝试词语匹配，请核对片段是否涵盖你的问题。优先展示不同文件，最多返回 12 个片段。</p><form className="zhen-input-row zhen-margin" onSubmit={event => { event.preventDefault(); void action(async () => { const result = unwrap(await api.searchKnowledge(project, query)); setHits(result); if (!result.length) setNotice('没有找到匹配资料。试试更短的关键词，或检查集合访问状态。'); }); }}><input aria-label="知识库检索内容" value={query} onChange={event => setQuery(event.target.value)} maxLength={200} placeholder="例如：如何用场景转折表现人物动机？"/><button className="zhen-primary" disabled={busy || !query.trim() || !project.trim()}>本地检索</button></form></section>
    {hits.map(hit => <article className="zhen-card" key={hit.id}><div className="zhen-section-heading"><h2>{hit.collectionName}</h2><span>{knowledgeLocation(hit)}</span></div><pre className="zhen-excerpt">{hit.text}</pre><div className="zhen-actions zhen-wrap"><button type="button" className="zhen-secondary" disabled={busy} onClick={() => void action(async () => { setSource(undefined); const value = unwrap(await api.knowledgeSource(project, hit.id, hit.epoch)); setSource({ project, value }); })}>查看来源上下文</button><button type="button" className="zhen-secondary" disabled={busy || collections.find(collection => collection.id === hit.collectionId)?.cloudProvider !== 'seedance'} onClick={() => void action(async () => { const current = unwrap(await api.knowledgeCitation(project, hit.id, hit.epoch, 'seedance')); await navigator.clipboard.writeText(`[资料引用：${knowledgeLocation(current)}]\n${current.text}`); setNotice('已复制获准引用。可粘贴到 Seedance 会话中；尚未自动发送。'); })}>复制获准引用</button></div></article>)}
    {source && source.project === project && collections.some(collection => collection.enabled && collection.id === source.value.sections[0]?.collectionId && collection.epoch === source.value.sections[0]?.epoch) && <section className="zhen-card"><div className="zhen-section-heading"><h2>来源上下文</h2><button type="button" className="zhen-link" onClick={() => setSource(undefined)}>关闭</button></div><SourceWindow source={source.value} onNavigate={busy ? undefined : (id, epoch) => void action(async () => { const value = unwrap(await api.knowledgeSource(project, id, epoch)); setSource({ project, value }); })}/><p className="zhen-muted">仅在本地查看索引快照，不代表源文件实时内容，不会自动发送给模型。</p></section>}
    {notice && <div className="zhen-notice" role="status">{notice}</div>}
  </div>;
}
