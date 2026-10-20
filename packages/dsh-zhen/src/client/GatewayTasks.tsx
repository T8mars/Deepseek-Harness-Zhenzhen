import React, { useEffect, useState, useRef } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { GatewayTaskRecord, GatewayTaskProtocol, GatewayMediaTicket, GatewayMediaReceipt } from 'dsh-zhen';
import { CanvasTransferPanel } from './CanvasTransfer.tsx';

const unwrap = <T,>(value: RemoteResult<T>): T => { if (!value.ok) throw value.error; return value.value; };
const protocols: Record<GatewayTaskProtocol, string> = { video: '视频 · OpenAI Video', 'legacy-video': '视频 · 旧版通用任务', image: '图片', audio: '音频', 'three-d': '混元 3D', music: 'Suno / Flow Music', midjourney: 'Midjourney', 'minimax-v2': 'MiniMax H3 · V2' };
const states = { unknown: '状态待确认', queued: '排队中', running: '生成中', succeeded: '已成功', failed: '已失败', cancelled: '服务报告已取消' };
const messages: Record<GatewayTaskRecord['code'], string> = { '': '', AUTH: '访问被拒绝，请检查当前 API 令牌。', NOT_FOUND: '尚未找到此任务，请核对协议和编号；不会重新提交。', MISSING_CREDENTIAL: '请先在模型与钱包中保存 Seedance 令牌。', RATE_LIMIT: '查询受限，已延后下次查询。', SERVER: '查询服务暂时不可用，已保留最近状态。', NETWORK: '查询未完成，已保留最近状态。', RESPONSE: '返回内容与已审阅的协议不符，自动追踪已暂停。', CANCELLED: '本次查询已停止，上游生成不受影响。', CONFIG_CHANGED: '连接配置已变化，请使用新配置重新查询。', UNAVAILABLE: '本次查询不可用，已保留最近状态。', UNRECOGNIZED_STATUS: '服务返回了新的状态，自动追踪已暂停。', BUSY: '正在查询其他任务，请稍后刷新。' };

export function GatewayTasks({ api, onSettings, onConnections }: { api: ZhenRemote; onSettings: () => void; onConnections: () => void }): React.ReactElement {
  const [items, setItems] = useState<GatewayTaskRecord[]>([]), [protocol, setProtocol] = useState<GatewayTaskProtocol>('image');
  const [taskId, setTaskId] = useState(''), [search, setSearch] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [tickets, setTickets] = useState<GatewayMediaTicket[]>([]), [receipts, setReceipts] = useState<GatewayMediaReceipt[]>([]), [folder, setFolder] = useState(''), [exporting, setExporting] = useState('');
  const stopExport = useRef(false);
  const [transferReceipt, setTransferReceipt] = useState('');
  useEffect(() => {
    let live = true;
    const read = () => { void Promise.all([api.gatewayTaskList(), api.gatewayMediaList()]).then(([tasks, files]) => { if (live) { setItems(unwrap(tasks)); const saved = unwrap(files); setReceipts(previous => [...previous.filter(item => !item.recorded && !saved.some(value => value.id === item.id)), ...saved]); } }).catch(() => { if (live) setNotice('任务记录暂时无法刷新，已保留当前显示。'); }); };
    read(); const timer = setInterval(read, 5000); return () => { live = false; clearInterval(timer); };
  }, [api]);
  async function action(work: () => Promise<void>): Promise<void> {
    setBusy(true); setNotice('');
    try { await work(); } catch (error) { setNotice(typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : '操作未完成，请核对任务编号和协议，或稍后刷新。'); }
    finally { try { setItems(unwrap(await api.gatewayTaskList())); } catch {} setBusy(false); }
  }
  async function saveResults(selected: GatewayMediaTicket[]): Promise<void> {
    stopExport.current = false;
    try { for (const ticket of selected) { if (stopExport.current) break; setExporting(ticket.id); const receipt = unwrap(await api.gatewayMediaSave(ticket.id, folder)); setReceipts(previous => [receipt, ...previous.filter(item => item.id !== receipt.id)]); setNotice(receipt.recorded ? '结果已保存，路径与摘要见下方保存记录。' : '文件已保存，但历史记录写入未完成；请保留下方路径。'); } }
    finally { setExporting(''); }
  }
  const visible = items.filter(item => `${item.taskId} ${protocols[item.protocol]} ${states[item.status]}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <div className="zhen-settings"><section className="zhen-card">
    <div className="zhen-section-heading"><h2>追踪已有生成任务</h2><button type="button" className="zhen-link" onClick={onSettings}>模型与钱包 ↗</button></div>
    <p>粘贴已提交任务的编号，使用当前 Seedance 令牌查询状态与实扣费用。</p>
    <form onSubmit={event => { event.preventDefault(); void action(async () => { const item = unwrap(await api.gatewayTaskAdd({ protocol, taskId: taskId.trim() })); unwrap(await api.gatewayTaskRefresh(item.id)); setTaskId(''); }); }}>
      <div className="zhen-input-pair"><label className="zhen-label">任务协议<select className="zhen-input" value={protocol} disabled={busy} onChange={event => setProtocol(event.target.value as GatewayTaskProtocol)}>{Object.entries(protocols).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="zhen-label">任务编号<input className="zhen-input" value={taskId} disabled={busy} onChange={event => setTaskId(event.target.value)} placeholder="task_EXAMPLE_ID" maxLength={160} autoComplete="off" spellCheck={false}/></label></div>
      <button className="zhen-primary" disabled={busy || !taskId.trim()}>添加并查询</button>
    </form>
    <p className="zhen-muted">此处只查询已受理任务，不创建或重新提交生成。暂停追踪、移除本地记录都不会取消上游任务。MiniMax V2 的删除/尝试取消属于另一项操作，此处不会调用。</p><button type="button" className="zhen-link" onClick={onConnections}>打开画布连接 ↗</button>
  </section><section className="zhen-card">
    <div className="zhen-section-heading"><h2>任务记录</h2><span>{items.length} / 100</span></div><label className="zhen-label">查找任务<input className="zhen-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="编号、类型或状态"/></label>
    {visible.length === 0 && <p className="zhen-muted">{items.length ? '没有匹配的任务。' : '暂无记录。已有编号可在上方添加，应用重启后记录仍保留。'}</p>}
    {visible.map(item => <article className="zhen-task-row" key={item.id}>
      <h3>{protocols[item.protocol]} · {states[item.status]}</h3><p className="zhen-source-path">{item.taskId}</p><p>{item.progress === null ? '未提供进度' : `服务报告进度 ${item.progress}%`}{item.querying ? ' · 正在查询' : ''}{item.tracking ? ' · 自动追踪中' : ' · 自动追踪已暂停'}</p>
      <p>{item.usage ? `最终实扣：${item.usage.currency} ${item.usage.amount}` : '最终实扣尚未返回。预扣、cost 或内部额度不会被当作实扣金额。'}</p>
      {item.status === 'succeeded' && <p className="zhen-muted">检测到 {item.resultCount} 条媒体链接。可获取结果清单并保存到本机，下载不会重新生成。</p>}
      {item.checkedAt && <p className="zhen-muted">最近查询：{new Date(item.checkedAt).toLocaleString()}{item.tracking && item.nextCheckAt ? ` · 最早下次查询：${new Date(item.nextCheckAt).toLocaleTimeString()}` : ''}</p>}{item.code && <p>{messages[item.code]}</p>}
      <div className="zhen-actions zhen-wrap"><button type="button" className="zhen-secondary" disabled={busy || item.querying} onClick={() => void action(async () => { unwrap(await api.gatewayTaskRefresh(item.id)); })}>刷新状态与费用</button>{item.status === 'succeeded' && item.resultCount > 0 && <button type="button" className="zhen-secondary" disabled={busy} onClick={() => void action(async () => { setTickets(unwrap(await api.gatewayMediaPreview(item.id))); })}>获取结果清单</button>}<button type="button" className="zhen-secondary" disabled={busy} onClick={() => void action(async () => { unwrap(await api.gatewayTaskTracking(item.id, !item.tracking)); })}>{item.tracking ? '暂停追踪' : '自动追踪此任务'}</button><button type="button" className="zhen-link" disabled={busy} onClick={() => void action(async () => { unwrap(await api.gatewayTaskRemove(item.id)); setTickets(previous => previous.filter(ticket => ticket.taskRecordId !== item.id)); setNotice('本地追踪记录已移除，上游任务和已保存文件保留。'); })}>移除本地记录</button></div>
    </article>)}
    <p className="zhen-muted">自动追踪由 Host 执行，每个任务查询间隔至少五秒，网络故障和限流时退避；到达终态后暂停。若终态尚无结算金额，可稍后手动刷新。已开启的追踪会在 Host 重启后继续；更换或移除本页令牌会暂停追踪。</p>
  </section>{tickets.length > 0 && <section className="zhen-card"><div className="zhen-section-heading"><h2>保存任务结果</h2><button type="button" className="zhen-link" disabled={busy} onClick={() => setTickets([])}>关闭清单</button></div><label className="zhen-label">本机保存文件夹<input className="zhen-input" value={folder} disabled={busy} onChange={event => setFolder(event.target.value)} maxLength={4096} placeholder="粘贴已存在的完整文件夹路径"/></label><p className="zhen-muted">清单五分钟内有效。结果由 Host 下载，浏览器不接收签名链接；已有文件不会被覆盖。每个文件最多 2 GiB，归档不解压、媒体不执行。</p><div className="zhen-actions zhen-wrap">{tickets.map(ticket => <button type="button" className="zhen-secondary" key={ticket.id} disabled={busy || !folder.trim()} onClick={() => void action(() => saveResults([ticket]))}>保存结果 {ticket.ordinal} · {ticket.sourceHost}</button>)}{tickets.length > 1 && <button type="button" className="zhen-primary" disabled={busy || !folder.trim()} onClick={() => void action(() => saveResults(tickets))}>依次保存全部结果</button>}{exporting && <button type="button" className="zhen-link" onClick={() => { stopExport.current = true; void api.gatewayMediaCancel(exporting).then(unwrap).catch(() => setNotice('停止状态暂未确认，请等待。')); }}>停止当前下载</button>}</div><p className="zhen-muted">停止下载不取消上游生成；已开始的本机复制可能完成，已保存文件保留。</p></section>}
  {receipts.length > 0 && <section className="zhen-card"><h2>最近保存记录</h2>{receipts.map(receipt => <article className="zhen-task-row" key={receipt.id}>
    <p className="zhen-source-path">{receipt.path}</p><p>{receipt.mime} · {receipt.bytes} B · {new Date(receipt.savedAt).toLocaleString()}{!receipt.recorded ? ' · 仅本页保留，请复制路径' : ''}</p><details><summary>文件摘要</summary><p className="zhen-source-path">{receipt.sha256}</p></details>
    <div className="zhen-actions zhen-wrap"><button type="button" className="zhen-secondary" disabled={busy} aria-pressed={transferReceipt === receipt.id} onClick={() => setTransferReceipt(receipt.id)}>送到画布{transferReceipt === receipt.id ? ' · 已选' : ''}</button>
      <button type="button" className="zhen-secondary" onClick={() => { void navigator.clipboard.writeText(receipt.path).then(() => setNotice('保存路径已复制。')).catch(() => setNotice('无法复制，请选择上方路径手动复制。')); }}>复制路径</button>
      <button type="button" className="zhen-link" disabled={busy} onClick={() => void action(async () => { unwrap(await api.gatewayMediaForget(receipt.id)); setReceipts(previous => previous.filter(item => item.id !== receipt.id)); setTransferReceipt(previous => previous === receipt.id ? '' : previous); setNotice('仅移除了保存记录，本机文件保留。'); })}>移除记录，保留文件</button></div>
  </article>)}</section>}
  <CanvasTransferPanel api={api} receiptId={transferReceipt} onConnections={onConnections}/>
  {notice && <p className="zhen-notice" role="status">{notice}</p>}</div>;
}
