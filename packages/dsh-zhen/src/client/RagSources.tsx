import React from 'react';
import { knowledgeLocation } from './rag-location.ts';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type { KnowledgeSource } from 'dsh-zhen';
import { ragPresentationSchema } from 'dsh-zhen/remote';

/** Recorded metadata is display currency only, never authority for another read. */
export function ragPresentation(block: { isError: boolean; meta?: unknown }): ReturnType<typeof ragPresentationSchema.safeParse> {
  return ragPresentationSchema.safeParse(block.isError ? null : block.meta);
}
export function SourceWindow({ source, onNavigate }: { source: KnowledgeSource; onNavigate?: (id: string, epoch: number) => void }): React.ReactElement {
  const first = source.sections[0]!;
  return <section className="zhen-rag-source" aria-label="资料来源上下文">
    <p>{first.collectionName} · {first.path}</p>
    <p className="zhen-rag-note">索引快照 · 第 {source.firstSection}–{source.firstSection + source.sections.length - 1} / {source.totalSections} 个片段。相邻片段可能重叠或从行中开始。{source.sections.some(hit=>hit.page)&&'PDF 行号指页内提取文本，阅读顺序可能与排版不同。'}</p>
    {source.sections.map(hit => <details key={hit.id} open={hit.id === source.anchorId}><summary>{hit.page ? knowledgeLocation(hit) : `第 ${hit.line} 行附近`}{hit.id === source.anchorId ? ' · 当前引用' : ''}</summary><pre tabIndex={0}>{hit.text}</pre></details>)}
    {onNavigate && <nav aria-label="来源片段翻页">
      <button type="button" disabled={!source.earlierId} onClick={() => { if (source.earlierId) onNavigate(source.earlierId, first.epoch); }}>更早片段</button>
      <button type="button" disabled={!source.laterId} onClick={() => { if (source.laterId) onNavigate(source.laterId, first.epoch); }}>后续片段</button>
    </nav>}
  </section>;
}
export function RagToolView(props: ToolCallViewProps): React.ReactElement {
  if (props.phase !== 'result') return <div className="zhen-rag-card" role="status">{props.toolName === 'zhen_rag_open' ? '正在读取已授权来源上下文…' : '正在检索本地资料…'}</div>;
  const parsed = ragPresentation(props.block);
  if (!parsed.success) return <div className="zhen-rag-card"><p>{props.block.isError ? '资料读取未完成，请检查当前授权、会话绑定或引用版本。' : '此记录未提供兼容的来源卡片。'}</p>{!props.block.isError && <details><summary>查看原始工具记录</summary><pre tabIndex={0}>{props.block.content.filter(item => item.type === 'text').map(item => item.text).join('\n').slice(0, 24000)}</pre></details>}{props.inspect && <button type="button" onClick={props.inspect}>查看工具记录</button>}</div>;
  const value = parsed.data;
  return <div className="zhen-rag-card">
    <strong>{value.kind === 'search' ? `本地资料 · ${value.hits.length} 个片段` : '资料来源上下文'}</strong>
    {value.kind === 'source' ? <SourceWindow source={value.source}/> : <>
      <p className="zhen-rag-note">{value.query}</p>
      {value.hits.map(hit => <details key={hit.id}><summary>{hit.collectionName} · {hit.page ? knowledgeLocation(hit) : `${hit.path} · 第 ${hit.line} 行附近`}</summary><pre tabIndex={0}>{hit.text}</pre></details>)}
      {value.hits.length > 0 && <p className="zhen-rag-note">需要更多上下文时，可让助手继续查看此引用。</p>}
    </>}
    <p className="zhen-rag-note">{value.notice}</p>
    <p className="zhen-rag-note">此卡片保留当时的工具记录；继续读取时仍需重新检查权限。</p>
  </div>;
}
