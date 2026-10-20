import React, { useEffect, useRef, useState } from 'react';
import type { GithubAccessInfo } from 'dsh-zhen';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
function unwrap<T>(result: RemoteResult<T>): T { if (!result.ok) throw result.error; return result.value; }
export function GithubAccessPanel({ api }: { api: ZhenRemote }): React.ReactElement {
  const [info, setInfo] = useState<GithubAccessInfo>(), [value, setValue] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const generation = useRef(0);
  useEffect(() => { const version = ++generation.current; setValue(''); setBusy(false); setInfo(undefined); setNotice('');
    void api.githubAccessInfo().then(result => { if (version === generation.current) setInfo(unwrap(result)); }).catch(() => { if (version === generation.current) setNotice('GitHub 凭据状态暂不可用。'); });
    return () => { generation.current++; };
  }, [api]);
  async function change(remove: boolean): Promise<void> { const version = ++generation.current, captured = value; setBusy(true); setValue(''); setNotice('');
    try { unwrap(await (remove ? api.githubRemoveCredential() : api.githubSaveCredential(captured))); const result = unwrap(await api.githubAccessInfo()); if (generation.current === version) { setInfo(result); setNotice(remove ? '已移除本机凭据，并停止旧连接检查。已下载内容保留。' : '已保存；可在本页检查版本，或到技能市场检查候选。'); } }
    catch { if (generation.current === version) setNotice('凭据操作未完成，请检查 Host 的凭据写入权限。'); }
    finally { if (generation.current === version) setBusy(false); }
  }
  return <section className="zhen-card"><h2>GitHub 私有仓库访问</h2>
    <p>技能目录与 DSH-zhen 版本检查共用此连接。公开来源不需要配置。</p>
    <p className="zhen-source-path">T8mars/Deepseek-Harness-Zhenzhen</p><p role="status">{info ? info.configured ? '已配置凭据' : '尚未配置，使用匿名读取' : '正在读取状态…'}</p>
    <p className="zhen-muted">可使用仅授权上述仓库、Contents 读取权限的细粒度令牌。Host 只向 GitHub API 发送凭据，读取目录和版本；此入口不推送代码，也不用于其他技能仓库。</p>
    <form onSubmit={event => { event.preventDefault(); void change(false); }}><label className="zhen-label">GitHub 只读凭据<input className="zhen-input" type="password" autoComplete="new-password" value={value} maxLength={4096} disabled={busy || !info?.writable} onChange={event => setValue(event.currentTarget.value)} placeholder="粘贴令牌后保存，页面不会回显已有值"/></label>
      <div className="zhen-actions zhen-wrap"><button className="zhen-primary" disabled={busy || !info?.writable || value.length < 8 || /\s/.test(value)}>保存凭据</button><button type="button" className="zhen-secondary" disabled={busy || !info?.writable || !info.configured} onClick={() => void change(true)}>移除本机凭据</button></div>
    </form>{info && !info.writable && <p className="zhen-muted">当前凭据来源不可在此修改，请在 Host 配置中管理。</p>}
    <p className="zhen-muted">凭据不会进入更新缓存或技能内容。移除凭据不删除已下载候选、已安装技能或个人副本；技能自动启用策略仍由市场单独控制。</p>
    <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">创建细粒度只读令牌 ↗</a>{notice && <p className="zhen-notice" role="status">{notice}</p>}
  </section>;
}
