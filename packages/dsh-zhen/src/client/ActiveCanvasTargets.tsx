import React from 'react';
import type {CanvasActiveTargets,CanvasWorkspaces} from 'dsh-zhen';
import {activeContextFresh} from 'dsh-zhen/remote';

export const activeCanvasUnavailable='活动窗口尚未就绪、已切换或与目录修订不同，请重新读取；也可以按名称手动选择画布。';
/** A directory entry is required: window metadata does not replace target authority. */
export function activeCanvasTarget(report:CanvasActiveTargets,windowId?:string,now=Date.now()):CanvasWorkspaces['canvases'][number]|undefined{
  const context=report.context;
  if(!activeContextFresh(context.observedAt,now))return;
  if(windowId===undefined&&context.status!=='resolved')return;
  if(windowId!==undefined&&!['resolved','ambiguous'].includes(context.status))return;
  const candidate=context.candidates.find(item=>item.windowId===(windowId??context.activeWindowId));
  if(!candidate?.windowReady||!candidate.rendererReady||!activeContextFresh(candidate.observedAt,now))return;
  const matches=report.workspaces.canvases.filter(item=>item.projectId===candidate.projectId&&item.id===candidate.canvasId);
  return matches.length===1&&matches[0]!.revision===candidate.revision?matches[0]:undefined;
}

/** Stateless controls: the panel owns request lifetime, target changes and approvals. */
export function ActiveCanvasTargets({report,disabled,onRead,onChoose}:{report?:CanvasActiveTargets;disabled:boolean;onRead:()=>void;onChoose:(windowId:string)=>void}):React.ReactElement{
  const context=report?.context,selected=report&&activeCanvasTarget(report);
  return <div className="zhen-margin" aria-label="桌面活动画布定位">
    <button type="button" className="zhen-secondary" disabled={disabled} onClick={()=>{if(!disabled)onRead();}}>使用桌面当前画布</button>
    {context&&<p className="zhen-muted" role="status">{context.status==='resolved'?(selected?`已定位：${selected.name} · 已保存修订 ${selected.revision}。${context.resolution==='single-window'?'当前实例只有一个就绪画布窗口。':'来自画布的焦点窗口。'}`:activeCanvasUnavailable):context.status==='ambiguous'?(context.truncated?'画布窗口较多，只显示部分窗口。请按名称选择，或关闭不使用的窗口后重新读取。':'检测到多个窗口，无法自动确定。请按名称选择这次使用的画布。'):context.status==='not-ready'?'画布窗口正在加载、切换或等待同步。请回到画布等待就绪，再重新读取。':'暂时没有可定位的桌面画布窗口。请打开桌面画布，也可以按名称手动选择。'}</p>}
    {report&&context?.status==='ambiguous'&&<div className="zhen-actions zhen-wrap">{context.candidates.map(candidate=>{
      const target=activeCanvasTarget(report,candidate.windowId);
      return target?<button type="button" className="zhen-secondary" key={candidate.windowId} disabled={disabled} onClick={()=>{if(!disabled)onChoose(candidate.windowId);}}>选择 {target.name} · 项目 {target.projectId} · 窗口 {candidate.windowId}</button>:null;
    })}</div>}
    {context&&<p className="zhen-muted">定位后先预览方案；生成仍需在画布窗口确认。</p>}
  </div>;
}
