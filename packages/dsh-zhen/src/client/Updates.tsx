import React, { useEffect, useState } from 'react';
import type { UpdateReport } from 'dsh-zhen';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import { GithubAccessPanel } from './GithubAccess.tsx';
import {useRemoteAction} from './useRemoteAction.ts';
function unwrap<T>(result: RemoteResult<T>): T { if (!result.ok) throw result.error; return result.value; }
function short(value: string): string { return value.length > 45 ? value.slice(0, 20) + '…' : value; }

export function Updates({ api }: { api: ZhenRemote }): React.ReactElement {
  const [report, setReport] = useState<UpdateReport>();
  const scope = useRemoteAction(api, '检查未完成。');
  const {busy, notice, setNotice, run: action} = scope;
  useEffect(() => { const current = scope.capture(); setReport(undefined); void api.updatesSnapshot().then(result => { if (current()) setReport(unwrap(result)); }).catch(() => { if (current()) setNotice('更新记录暂时不可用。'); }); }, [api]);
  return <div className="zhen-settings">
    <GithubAccessPanel api={api}/>
    <section className="zhen-card">
      <div className="zhen-section-heading"><h2>更新中心</h2><button type="button" className="zhen-primary" disabled={busy} onClick={() => void action(async current => { const next = unwrap(await api.updatesCheck()); if (current()) setReport(next); })}>{busy ? '正在检查…' : '检查更新'}</button></div>
      <p>分别跟进 DSH 上游、DSH-zhen、画布与网关文档，先确认变化，再验证兼容。</p>
      <label className="zhen-checkbox"><input type="checkbox" disabled={busy || !report} checked={report?.automatic ?? false} onChange={event => { const enabled = event.target.checked; void action(async current => { unwrap(await api.updatesAutomatic(enabled)); if (!current()) return; const next = unwrap(await api.updatesSnapshot()); if (current()) setReport(next); }); }}/><span>每天自动检查版本信息</span></label>
      <p className="zhen-muted">检查访问 GitHub、npm 注册表与 Seedance 文档，不发送会话或本地资料。当前阶段仅发现候选更新；安装包签名与自动激活流程仍在建设中。</p>
      <p className="zhen-muted">{report?.checkedAt ? `最近检查：${new Date(report.checkedAt).toLocaleString()}` : '尚未完成首次检查。'}</p>
    </section>
    {notice && <div className="zhen-notice" role="status">{notice}</div>}
    {report?.sources.map(source => <section key={source.id} className="zhen-card">
      <div className="zhen-section-heading"><h2>{source.title}</h2><span>{source.state === 'error' ? '暂不可用' : source.state === 'unpublished' ? '尚未发布' : source.changed ? '发现候选变更' : '已检查'}</span></div>
      <p className="zhen-source-path">当前记录：{short(source.current)}</p>
      {source.available && <p className="zhen-source-path">已发现：{short(source.available)}</p>}
      <p className="zhen-muted">{source.message}</p><a href={source.url} target="_blank" rel="noreferrer">查看来源 ↗</a>
      {source.revision && <details className="zhen-margin"><summary>版本与摘要</summary><pre className="zhen-excerpt">{source.revision}</pre></details>}
    </section>)}
    <section className="zhen-card"><h2>保留自己的改动</h2><p className="zhen-muted">DSH-zhen 通过独立插件组合上游发布包。技能保留旧版本与个人副本；画布 CLI 的文件摘要变化后需要重新连接。候选更新经过契约测试和实际验证后再安排安装。</p><a href="https://github.com/T8mars/Deepseek-Harness-Zhenzhen" target="_blank" rel="noreferrer">DSH-zhen GitHub ↗</a></section>
  </div>;
}
