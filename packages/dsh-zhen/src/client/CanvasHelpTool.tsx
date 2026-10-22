import React from 'react';
import type {ToolCallViewProps} from '@deepseek-ai/dsh-client-ui-tool/client';
import {canvasHelpSchema} from 'dsh-zhen/remote';

export function validCanvasHelp(block:{isError:boolean;content:readonly {type:string;text?:string}[]}):boolean{
  if(block.isError)return false;let bytes=0,found=0;
  for(const item of block.content){if(item.type!=='text'||typeof item.text!=='string')continue;if(item.text.length>4096||(bytes+=new TextEncoder().encode(item.text).length)>4096)return false;try{if(canvasHelpSchema.safeParse(JSON.parse(item.text)).success)found++;}catch{/* Ignore legacy or malformed text; navigation remains available. */}}
  return found===1;
}
export function CanvasHelpCard({pending=false,valid=true,onOpen,inspect}:{pending?:boolean;valid?:boolean;onOpen:()=>void;inspect?:()=>void}):React.ReactElement{
  return <div className="zhen-rag-card" aria-label="画布连接入口">
    <strong>画布连接</strong>
    <p role="status">{pending?'正在准备连接入口…':valid?'打开连接页面，按提示检测画布并完成窗口配对。':'连接引导暂不可用，可以打开连接页面查看当前状态。'}</p>
    <p className="zhen-rag-note">连接、方案审阅和生成会分别确认。</p>
    <button type="button" onClick={onOpen}>打开画布连接</button>
    {inspect&&<>{' '}<button type="button" onClick={inspect}>查看工具记录</button></>}
  </div>;
}
export function CanvasHelpToolView(props:ToolCallViewProps&{onOpen:()=>void}):React.ReactElement{
  return <CanvasHelpCard pending={props.phase!=='result'} valid={props.phase==='result'&&validCanvasHelp(props.block)} onOpen={props.onOpen} inspect={props.inspect}/>;
}
