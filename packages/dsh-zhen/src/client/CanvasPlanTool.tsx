import React,{useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import type {ToolCallViewProps} from '@deepseek-ai/dsh-client-ui-tool/client';
import type {ZhenRemote} from 'dsh-zhen/remote';
import type {CanvasWorkflowView} from 'dsh-zhen';
import {canvasEntity,canvasPlanResultSchema} from 'dsh-zhen/remote';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const projection=z.object({schema:z.literal('t8-creative-plan-v1'),planId:canvasEntity,planDigest:digest,projectId:canvasEntity,canvasId:canvasEntity,kind:z.string().max(100),brief:z.object({goal:z.string().max(65536)}),ready:z.boolean(),expiresAt:z.iso.datetime(),approvalBinding:z.object({action:z.literal('creative.apply'),sessionId:z.uuid(),projectId:canvasEntity,canvasId:canvasEntity,planDigest:digest})});
export type CanvasPlanPresentation=Pick<z.infer<typeof projection>,'planId'|'planDigest'|'kind'|'ready'|'expiresAt'>&{goal:string};
/** A recorded result is display metadata; it never authorizes applying or running a plan. */
export function canvasPlanPresentation(block:{isError:boolean;content:readonly {type:string;text?:string}[]}):CanvasPlanPresentation|null{
  if(block.isError)return null;let bytes=0;const found:CanvasPlanPresentation[]=[];
  for(const item of block.content){
    if(item.type!=='text'||typeof item.text!=='string')continue;
    if(item.text.length>256*1024||(bytes+=new TextEncoder().encode(item.text).length)>256*1024)return null;
    try{
      const raw:unknown=JSON.parse(item.text);if(raw&&typeof raw==='object'&&'isError'in raw&&raw.isError===true)continue;
      const packet=canvasPlanResultSchema.safeParse(raw&&typeof raw==='object'&&'structuredContent'in raw?raw.structuredContent:raw);if(!packet.success)continue;
      const parsed=projection.safeParse(packet.data.data);if(!parsed.success)continue;const plan=parsed.data,binding=plan.approvalBinding;
      if(plan.projectId!==packet.data.request.projectId||plan.canvasId!==packet.data.request.canvasId||binding.projectId!==plan.projectId||binding.canvasId!==plan.canvasId||binding.planDigest!==plan.planDigest)continue;
      const letters=Array.from(plan.brief.goal),goal=letters.slice(0,240).join('')+(letters.length>240?'…':'');
      found.push({planId:plan.planId,planDigest:plan.planDigest,kind:plan.kind,ready:plan.ready,expiresAt:plan.expiresAt,goal});
    }catch{/* Malformed or legacy records retain the original Inspect action. */}
  }
  return found.length===1?found[0]!:null;
}
type PlanApi=Pick<ZhenRemote,'canvasCandidates'|'canvasCandidateAdopt'>;
/** Recheck current server-owned candidates before selecting the exact original plan. */
export async function reviewCanvasPlan(api:PlanApi,plan:CanvasPlanPresentation,callId:string):Promise<CanvasWorkflowView>{
  if(Date.parse(plan.expiresAt)<=Date.now())throw Error('这份方案已过期，请在会话中重新规划。');
  const listed=await api.canvasCandidates();if(!listed.ok)throw listed.error;
  const matches=listed.value.filter(item=>item.sourceCallId===callId&&item.preview.planId===plan.planId&&item.preview.planDigest===plan.planDigest);
  if(matches.length!==1)throw Error('这份方案已过期、已选取或连接已变化。请到画布连接页查看，或在本会话重新规划。');
  const result=await api.canvasCandidateAdopt(matches[0]!.id);if(!result.ok)throw result.error;
  if(result.value.planId!==plan.planId||result.value.planDigest!==plan.planDigest||result.value.phase!=='preview')throw Error('方案状态已变化，请到画布连接页查看。');
  return result.value;
}
const kinds:Record<string,string>={image:'图像方案','edit-image':'图片编辑方案',video:'视频方案','edit-video':'视频编辑方案',audio:'音频方案',script:'剧本方案',story:'Story 方案'};
export function CanvasPlanCard({plan,busy,notice,onReview,onConnections,inspect}:{plan:CanvasPlanPresentation;busy:boolean;notice:string;onReview:()=>void;onConnections:()=>void;inspect?:()=>void}):React.ReactElement{
  const expired=Date.parse(plan.expiresAt)<=Date.now();
  return <div className="zhen-rag-card" aria-label="画布创作方案">
    <strong>{kinds[plan.kind]??'创作方案'} · {expired?'已过期':plan.ready?'待审阅':'需要补充信息'}</strong>
    <p>{plan.goal}</p><p className="zhen-rag-note">这是可审阅方案，尚未应用到画布或生成作品。应用与生成会分别确认。</p>
    <div><button type="button" disabled={busy||expired} onClick={()=>{if(!busy&&!expired)onReview();}}>{busy?'正在打开方案…':'审阅画布方案'}</button>{' '}<button type="button" disabled={busy} onClick={()=>{if(!busy)onConnections();}}>画布连接</button>{inspect&&<>{' '}<button type="button" onClick={inspect}>查看工具记录</button></>}</div>
    {notice&&<p role="status">{notice}</p>}
  </div>;
}
export function CanvasPlanToolView(props:ToolCallViewProps&{api:PlanApi;onOpen:()=>void}):React.ReactElement{
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),working=useRef(false),generation=useRef(0),alive=useRef(true);
  useEffect(()=>{alive.current=true;working.current=false;generation.current++;setBusy(false);setNotice('');return()=>{alive.current=false;generation.current++;};},[props.api,props.callId]);
  if(props.phase!=='result')return <div className="zhen-rag-card" role="status">正在准备画布创作方案…</div>;
  const plan=canvasPlanPresentation(props.block);
  if(!plan)return <div className="zhen-rag-card"><p>{props.block.isError?'画布方案未准备好，请打开画布连接页处理连接或权限提示。':'此工具记录没有可直接审阅的原生方案，请查看工具记录。'}</p><button type="button" onClick={props.onOpen}>打开画布连接</button>{props.inspect&&<>{' '}<button type="button" onClick={props.inspect}>查看工具记录</button></>}</div>;
  async function review():Promise<void>{
    if(working.current)return;working.current=true;const version=++generation.current;setBusy(true);setNotice('');
    try{await reviewCanvasPlan(props.api,plan!,props.callId);if(alive.current&&version===generation.current)props.onOpen();}
    catch(error){if(alive.current&&version===generation.current)setNotice(error instanceof Error?error.message:'方案暂时无法打开，请到画布连接页查看当前状态。');}
    finally{if(alive.current&&version===generation.current){working.current=false;setBusy(false);}}
  }
  return <CanvasPlanCard plan={plan} busy={busy} notice={notice} onReview={()=>void review()} onConnections={props.onOpen} inspect={props.inspect}/>;
}
