import {defineTool} from '@deepseek-ai/dsh-tools';
import {canvasHelp} from './canvas-help-schema.ts';
/** A chat navigation card, with no connection/status/credential/native reads. */
export function createCanvasHelpTool(){
  return defineTool({
    name:'zhen_canvas_help',
    description:'为画布创作请求展示可点击的“打开画布连接”入口。画布MCP工具不可用时调用一次，再等待用户按页面提示处理。仅显示导航，不连接、配对、授权、安装、执行命令或生成作品。',
    parameters:{},
    output:{schema:{type:'object',additionalProperties:false,properties:{schema:{type:'string',required:true},entry:{type:'string',required:true},notice:{type:'string',required:true}}},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
    isConcurrencySafe:()=>true,
    async execute(_args,execution){execution.signal.throwIfAborted();return canvasHelp();},
  });
}
