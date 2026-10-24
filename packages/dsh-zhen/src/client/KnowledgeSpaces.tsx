import React, { useEffect, useRef, useState } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { KnowledgeSpacePage } from 'dsh-zhen';

type SpaceApi = Pick<ZhenRemote, 'knowledgeSpaces'>;
interface Page extends KnowledgeSpacePage { api: SpaceApi; cursor: string; previous: string[]; }

/** Selecting a name only changes the form scope; every permission remains explicit. */
export function KnowledgeSpaces({ api, value, disabled, onChoose }: { api: SpaceApi; value: string; disabled: boolean; onChoose: (name: string) => void }): React.ReactElement {
  const [page, setPage] = useState<Page>(), [loading, setLoading] = useState(false), [notice, setNotice] = useState('');
  const active = useRef(api), generation = useRef(0), working = useRef(false); active.current = api;
  const current = page?.api === api ? page : undefined;
  async function load(cursor: string, previous: string[]): Promise<void> {
    if (active.current !== api || working.current) return;
    working.current = true; const request = ++generation.current;
    const valid = () => active.current === api && generation.current === request;
    setLoading(true); setNotice('');
    try {
      const result = await api.knowledgeSpaces(cursor);
      if (!result.ok) throw result.error;
      if (valid()) setPage({ ...result.value, api, cursor, previous });
    } catch {
      if (valid()) setNotice('暂时无法读取已有资料空间。可刷新列表，或直接填写下方名称；当前草稿已保留。');
    } finally {
      if (valid()) { working.current = false; setLoading(false); }
    }
  }
  useEffect(() => {
    generation.current++; working.current = false; setPage(undefined); void load('', []);
    return () => { generation.current++; };
  }, [api]);
  const unavailable = disabled || loading || !current;
  return <div className="zhen-margin">
    <label className="zhen-label" htmlFor="zhen-existing-space">已有资料空间</label>
    <div className="zhen-input-row">
      <select id="zhen-existing-space" className="zhen-input" disabled={unavailable || current.items.length === 0} value={current?.items.includes(value) ? value : ''} onChange={event => {
        const name = event.currentTarget.value;
        if (!unavailable && current.items.includes(name) && active.current === api) onChoose(name);
      }}>
        <option value="">{loading ? '正在读取…' : current?.items.length === 0 ? '还没有已有资料空间' : '选择一个资料空间'}</option>
        {current?.items.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      <button type="button" className="zhen-secondary" disabled={disabled || loading} onClick={() => { if (!disabled) void load('', []); }}>刷新空间</button>
    </div>
    {current && (current.previous.length > 0 || current.next) && <nav className="zhen-actions" aria-label="资料空间分页">
      <button type="button" className="zhen-secondary" disabled={disabled || loading || current.previous.length === 0} onClick={() => { if (!disabled && current.previous.length) void load(current.previous.at(-1)!, current.previous.slice(0, -1)); }}>上一页空间</button>
      <button type="button" className="zhen-secondary" disabled={disabled || loading || !current.next} onClick={() => { if (!disabled && current.next) void load(current.next, [...current.previous, current.cursor]); }}>下一页空间</button>
    </nav>}
    <p className="zhen-muted">可选择已有空间，或在下方填写新名称后导入资料。切换空间不会修改绑定或授权。</p>
    {notice && <p className="zhen-notice" role="status">{notice}</p>}
  </div>;
}
