import {useLayoutEffect, useRef, useState} from 'react';

export type CurrentAction = () => boolean;
export type RemoteAction = (current: CurrentAction) => Promise<void>;

// A UI scope guard, not cancellation of work already accepted by the Host.
export function useRemoteAction(api: object, fallback = '操作未完成，请刷新状态。') {
  const generation = useRef(0), bound = useRef<object | undefined>(undefined), working = useRef(false);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const isCurrent = (version: number): boolean => generation.current === version && bound.current === api;
  function capture(): CurrentAction { const version = generation.current; return () => isCurrent(version); }
  // Bind during commit. An abandoned render must not invalidate accepted work.
  useLayoutEffect(() => {
    const wasWorking = working.current;
    generation.current++; bound.current = api; working.current = false; setBusy(false);
    setNotice(wasWorking ? '连接已变化。刚才的操作可能仍在原连接进行，请检查原处状态；这里不会自动重试。' : '');
    return () => { generation.current++; bound.current = undefined; };
  }, [api]);
  async function run(task: RemoteAction, refresh?: RemoteAction): Promise<void> {
    if (working.current || !capture()()) return;
    generation.current++; const current = capture(); working.current = true; setBusy(true); setNotice('');
    try { await task(current); }
    catch (error) { if (current()) setNotice(error instanceof Error ? error.message : fallback); }
    finally { if (current()) {
      try { await refresh?.(current); }
      catch { if (current()) setNotice(previous => previous || '本机状态暂时无法刷新，请稍后重新检查。'); }
      finally { if (current()) { working.current = false; setBusy(false); } }
    } }
  }
  return {busy, notice, setNotice, capture, run};
}
