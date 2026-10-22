import {z} from 'zod';
/** Navigation metadata only. Never evidence of connection, pairing or approval. */
export const canvasHelpSchema=z.object({
  schema:z.literal('dsh-zhen-canvas-help-v1'),
  entry:z.literal('connections'),
  notice:z.literal('请打开画布连接，按页面提示检测画布并完成窗口配对。此引导不会连接画布、批准操作或生成作品。'),
}).strict();
export type CanvasHelp=z.infer<typeof canvasHelpSchema>;
export function canvasHelp():CanvasHelp{return{schema:'dsh-zhen-canvas-help-v1',entry:'connections',notice:'请打开画布连接，按页面提示检测画布并完成窗口配对。此引导不会连接画布、批准操作或生成作品。'};}
