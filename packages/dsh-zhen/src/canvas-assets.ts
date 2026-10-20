import {createHash} from 'node:crypto';
import {z} from 'zod';
import {CanvasError} from './canvas.ts';
import {canvasEntity} from './canvas-contract.ts';
import {canvasAssetSchema,canvasAssetsSchema} from './canvas-reference-schema.ts';
import type {CanvasAsset,CanvasAssets,CanvasAssetsQuery,CanvasReferenceKey} from './canvas-reference-schema.ts';
const numeric=(value:unknown):number=>{const result=typeof value==='number'||typeof value==='string'?Number(value):0;return Number.isFinite(result)?result:0;};
const integer=(value:unknown):number=>Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.trunc(numeric(value))));
/** Metadata only: do not retain native locators, media URLs, settings or prompts. */
export function canvasAssetView(projectId:string,input:unknown):CanvasAsset {
  const raw=z.object({id:canvasEntity.max(160),projectId:canvasEntity,kind:z.enum(['image','video','audio']),filename:z.string().max(16384).optional(),name:z.string().max(16384).optional(),availability:z.string().max(80),contentHash:z.string().max(128).nullish(),mimeType:z.string().max(120).nullish()}).passthrough().safeParse(input);
  if(!raw.success||raw.data.projectId!==projectId)throw new CanvasError('WORKFLOW_ASSET_INVALID','素材内容或项目归属无法校验，请重新读取。');
  const data=raw.data,metadata=z.record(z.string(),z.unknown()).safeParse(data.metadata),meta=metadata.success?metadata.data:{};
  const hash=(data.contentHash??'').trim().toLowerCase().replace(/^sha256:/,''),contentHash=/^[a-f0-9]{64}$/.test(hash)?hash:null;
  const contentRevision=Math.max(1,integer(data.contentRevision||data.revision)),mimeType=(data.mimeType??'').trim().toLowerCase(),size=integer(data.sizeBytes??data.size);
  const pixel=(value:unknown)=>numeric(value)>0?Math.max(1,integer(value)):0;
  const name=(data.filename||data.name||data.id).replaceAll('\\','/').split('/').at(-1)!.split(/[?#]/)[0].slice(0,240)||data.id;
  // The native persisted asset projection currently omits top-level byte size.
  // Zero means unknown here; retain that exact value for its receipt digest.
  return canvasAssetSchema.parse({id:data.id,projectId,name,kind:data.kind,contentHash,contentRevision,mimeType,size,width:pixel(data.width??meta.width),height:pixel(data.height??meta.height),duration:Math.max(0,Math.min(86400,numeric(data.duration??data.durationSec??meta.duration??meta.durationSec))),selectable:data.availability==='available'&&contentHash!==null&&mimeType.length>0});
}
export function canvasAssetsView(input:CanvasAssetsQuery,data:unknown):CanvasAssets {
  const page=z.object({projectId:canvasEntity,canvasId:canvasEntity,canvasRevision:z.number().int().positive(),catalogRevision:z.number().int().nonnegative(),offset:z.number().int().nonnegative(),limit:z.literal(25),total:z.number().int().min(0).max(1000000),items:z.array(z.unknown()).max(25)}).safeParse(data);
  if(!page.success||page.data.projectId!==input.projectId||page.data.canvasId!==input.canvasId||page.data.offset!==(input.offset??0)||page.data.offset+page.data.items.length>page.data.total||page.data.items.length===0&&page.data.offset<page.data.total)throw new CanvasError('WORKFLOW_ASSET_PAGE_INVALID','素材目录或分页归属无法校验，请重新读取。');
  const items=page.data.items.map(row=>canvasAssetView(input.projectId,row));if(new Set(items.map(item=>item.id)).size!==items.length||items.some(item=>item.kind!==input.kind))throw new CanvasError('WORKFLOW_ASSET_PAGE_INVALID','素材目录出现重复或类型变化，请重新读取。');
  const next=page.data.offset+items.length;return canvasAssetsSchema.parse({...input,query:input.query??'',...page.data,items,nextOffset:next<page.data.total?next:null});
}
export function canvasAssetKey(asset:CanvasAsset):CanvasReferenceKey {
  if(!asset.selectable||!asset.contentHash)throw new CanvasError('WORKFLOW_REFERENCE_UNAVAILABLE','参考素材不可用或尚未完成内容校验，请重新选择。');
  return{assetId:asset.id,contentRevision:asset.contentRevision,contentHash:asset.contentHash};
}
const canonical=(value:unknown):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}':JSON.stringify(value);
/** Compare the published t8-model-decision-receipt-v1 attachment evidence.
 * C50 includes fixed vectors produced independently by the original native
 * function and a separate original-native fresh-TEMP integration probe. */
export function nativeAttachmentDigest(assets:CanvasAsset[]):string {
  return createHash('sha256').update(canonical(assets.map(asset=>({assetId:asset.id,contentHash:asset.contentHash??'',contentRevision:asset.contentRevision,kind:asset.kind,mimeType:asset.mimeType,size:asset.size,width:asset.width,height:asset.height,duration:asset.duration,observationDigest:''})))).digest('hex');
}
