import React, { useEffect, useState } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { GatewayCheckReceipt, GatewayCheckPreview } from 'dsh-zhen';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import { GATEWAY_CHECK_POLICY } from 'dsh-zhen/remote';
const unwrap = <T,>(value: RemoteResult<T>): T => { if (!value.ok) throw value.error; return value.value; };
const states: Record<GatewayCheckReceipt['state'], string> = { preview: '等待确认', running: '正在检查', passed: '基础流式检查通过', incomplete: '响应不完整', failed: '检查未通过', cancelled: '已取消', expired: '确认已过期', untracked: '本窗口无法继续跟踪' };
const codes: Record<GatewayCheckReceipt['code'], string> = { '': '', AUTH: '令牌或模型权限被拒绝。', MISSING_CREDENTIAL: '当前令牌不可用。', RATE_LIMIT: '请求频率受限。', TIMEOUT: '检查超时，服务端是否仍处理未知。', SERVER: '模型服务暂时不可用。', PI_AI_ERROR: '模型调用失败，请检查服务和账户状态。', NO_ADAPTER: '聊天路由尚未就绪。', CANCELLED: '已请求停止；这不代表服务端取消或退款。', INCOMPLETE: '没有收到完整的文字回答。', RESPONSE_LIMIT: '响应超过检查限制，已停止读取。', UNAVAILABLE: '连接未完成，请检查当前路由和服务状态。' };

export function GatewayCheck({ api, configured }: { api: ZhenRemote; configured: boolean }): React.ReactElement {
  const [preview, setPreview] = useState<GatewayCheckPreview>();
  const [history, setHistory] = useState<GatewayCheckReceipt[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { let live = true; api.gatewayCheckHistory().then(value => { if (live) setHistory(unwrap(value)); }).catch(() => { if (live) setNotice('暂时无法读取检查记录。'); }); return () => { live = false; }; }, [api, configured]);
  async function action(work: () => Promise<void>): Promise<void> {
    setBusy(true); setNotice('');
    try { await work(); } catch { setNotice('操作未完成。请刷新记录；已经启动的检查不会自动重发。'); }
    finally { try { setHistory(unwrap(await api.gatewayCheckHistory())); } catch {} setBusy(false); }
  }
  const active = history.find(item => item.state === 'running');
  return <section className="zhen-card">
    <div className="zhen-section-heading"><h2>检查 Flash 聊天连接</h2><button type="button" className="zhen-secondary" disabled={busy} onClick={() => void action(async () => { setHistory(unwrap(await api.gatewayCheckHistory())); })}>刷新记录</button></div>
    <p className="zhen-muted">使用当前 Seedance 路由发送一段固定短消息，输出上限 32 tokens。服务可能按实际用量收费，金额以账户结算为准。不会携带你的会话、资料或工具。</p>
    <button type="button" className="zhen-secondary" disabled={busy || !configured || !!active || !!preview} onClick={() => void action(async () => { const next = unwrap(await api.gatewayCheckPreview()); setPreview(next); setConfirmed(false); })}>查看本次请求</button>
    {preview && <div className="zhen-margin">
      <p><strong>{preview.receipt.model}</strong></p><pre className="zhen-excerpt">{preview.prompt}</pre>
      <p className="zhen-muted">本次确认 5 分钟内有效，只提交一次。取消或连接中断不保证退款，也不会自动重发。</p>
      <label className="zhen-checkbox"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/>我同意发送这条短消息，并承担实际产生的用量费用。</label>
      <div className="zhen-actions zhen-wrap"><button type="button" className="zhen-primary" disabled={busy || !confirmed || !configured} onClick={() => { const current = preview; setPreview(undefined); setConfirmed(false); setHistory(rows => [{ ...current.receipt, state: 'running' }, ...rows.filter(row => row.id !== current.receipt.id)]); void action(async () => { const result = unwrap(await api.gatewayCheckRun(current.receipt.id, GATEWAY_CHECK_POLICY)); setNotice(states[result.state]); }); }}>确认并检查一次</button><button type="button" className="zhen-link" disabled={busy} onClick={() => { const current = preview; setPreview(undefined); setConfirmed(false); void action(async () => { unwrap(await api.gatewayCheckCancel(current.receipt.id)); }); }}>取消这次检查</button></div>
    </div>}
    {active && <button type="button" className="zhen-secondary zhen-margin" onClick={() => { void api.gatewayCheckCancel(active.id).then(value => { unwrap(value); setNotice('已请求停止，请刷新记录查看结果。'); }).catch(() => setNotice('无法确认停止状态，请刷新记录。')); }}>停止当前检查</button>}
    {history.slice(0, 3).map(item => <div className="zhen-margin" key={item.id}><p><strong>{states[item.state]}</strong> · {new Date(item.createdAt).toLocaleString()}</p><p className="zhen-muted">{codes[item.code]}{item.state === 'untracked' ? '原请求可能仍在其他 Host 或服务端处理，不能据此重发。' : ''}{item.state === 'passed' ? '仅确认这次短消息的文字流结束正常；工具、图片和其他模型需要分别验证。' : ''}</p>{item.inputTokens !== null || item.outputTokens !== null ? <p className="zhen-muted">服务报告用量：输入 {item.inputTokens ?? '未知'} / 输出 {item.outputTokens ?? '未知'} tokens。</p> : null}</div>)}
    <p className="zhen-muted">记录是历史检查，不表示当前令牌仍有效。模型回答和令牌值不会保存在检查记录中。</p>
    {notice && <p className="zhen-notice" role="status">{notice}</p>}
  </section>;
}
