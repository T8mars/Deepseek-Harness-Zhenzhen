import React from 'react';
import type {CanvasSetupDiscovery} from 'dsh-zhen';
export function CanvasConnectionChoices({discovery,busy,onConnect,selectionOnly=false}:{discovery?:CanvasSetupDiscovery;busy:boolean;onConnect:(root:string,digest:string)=>void;selectionOnly?:boolean}):React.ReactElement{
  if(selectionOnly)return <div role="region" aria-label="选择要连接的桌面画布">
    <p role="status">检测到多个桌面画布，选择这次要使用的一个即可。</p>
    {discovery?.candidates.filter(candidate=>candidate.source==='running-desktop').map((candidate,index)=><div className="zhen-margin" key={candidate.root}>
      <button type="button" className="zhen-secondary" disabled={busy} onClick={()=>{if(!busy)onConnect(candidate.root,candidate.digest);}}>连接桌面画布 {index+1}</button>
      <details><summary>识别这份画布 · 工具 {candidate.cliVersion}</summary><p className="zhen-source-path">{candidate.root}</p></details>
    </div>)}
  </div>;
  return <div role="region" aria-label="可连接的画布">
    {discovery&&discovery.candidates.length>0&&!discovery.candidates.some(candidate=>candidate.source==='running-desktop')&&<p className="zhen-muted" role="status">目前只找到了备用连接工具，尚未检测到正在运行的桌面画布。请先打开桌面版画布，再点击“重新检测”。如果桌面画布已经打开，请在画布设置中安装或修复 Agent 工具后重新检测；浏览器中的画布页面不能批准配对。</p>}
    {discovery?.candidates.map(candidate=><div className="zhen-card zhen-margin" key={candidate.root}>
      <strong>{candidate.source==='running-desktop'?'正在运行的桌面画布（推荐）':'已导出的连接工具（备用）'}</strong>
      <p className="zhen-muted">将使用这份画布的本机连接工具。权限仍需你在桌面画布窗口确认。</p>
      <button type="button" className={candidate.source==='running-desktop'?'zhen-primary':'zhen-secondary'} disabled={busy} onClick={()=>{if(!busy)onConnect(candidate.root,candidate.digest);}}>{candidate.source==='running-desktop'?'连接这台画布':'使用备用工具'}</button>
      <details className="zhen-margin"><summary>工具来源与版本</summary><p className="zhen-source-path">{candidate.root}</p><p className="zhen-source-path">版本 {candidate.cliVersion}<br/>摘要 {candidate.digest}</p></details>
    </div>)}
    {discovery&&!discovery.candidates.length&&<p className="zhen-muted">未找到完整的连接工具。请先启动桌面画布；仍未找到时，在画布设置中安装或修复 Agent 工具后重新检测。</p>}
    {discovery?.issues.map((message,index)=><p className="zhen-muted" key={index}>{message}</p>)}
  </div>;
}
