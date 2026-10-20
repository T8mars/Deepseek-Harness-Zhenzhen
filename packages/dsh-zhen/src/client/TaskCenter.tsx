import React, { useId, useState } from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import { GatewayTasks } from './GatewayTasks.tsx';
import { CanvasTasksPanel } from './CanvasTasks.tsx';
export function TaskCenter({ api, onSettings, onConnections }: { api: ZhenRemote; onSettings: () => void; onConnections: () => void }): React.ReactElement {
  const [source, setSource] = useState<'gateway' | 'canvas'>('gateway'), field = useId();
  return <><div className="zhen-actions" role="group" aria-label="任务来源"><button type="button" aria-pressed={source === 'gateway'} aria-controls={field} className={source === 'gateway' ? 'zhen-primary' : 'zhen-secondary'} onClick={() => setSource('gateway')}>网关任务</button><button type="button" aria-pressed={source === 'canvas'} aria-controls={field} className={source === 'canvas' ? 'zhen-primary' : 'zhen-secondary'} onClick={() => setSource('canvas')}>画布任务</button></div><div id={field}>{source === 'canvas' ? <CanvasTasksPanel api={api} onConnections={onConnections}/> : <GatewayTasks api={api} onSettings={onSettings} onConnections={onConnections}/>}</div></>;
}
