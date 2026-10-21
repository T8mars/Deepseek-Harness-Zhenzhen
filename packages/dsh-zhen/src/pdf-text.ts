import {documentFailure,assertDocumentAuthority} from './document-error.ts';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export interface PdfTextPage { page: number; text: string; }
export const PDF_TEXT_LIMITS = Object.freeze({inputBytes:2*1024*1024,textBytes:2*1024*1024,pages:200,timeoutMs:30000,heapMiB:256,pending:4});
let tail=Promise.resolve(),pending=0;

function pagesFrom(value: unknown): PdfTextPage[] {
 if(value&&typeof value==='object'&&'ok'in value&&value.ok===false){
  const code='code'in value?value.code:'';
  if(code==='TEXT_LIMIT')throw documentFailure('DOCUMENT_LIMIT','PDF 提取文字超出 2 MiB。');
  if(code==='PAGE_LIMIT')throw documentFailure('DOCUMENT_LIMIT','PDF 超出 200 页。');
  if(code==='PASSWORD')throw documentFailure('DOCUMENT_PASSWORD','PDF 需要密码，未导入该文件。');
  throw documentFailure('DOCUMENT_INVALID','PDF 已损坏或无法读取，未导入该文件。');
 }
 if(!value||typeof value!=='object'||!('ok'in value)||value.ok!==true||!('pages'in value)||!Array.isArray(value.pages)||!('pageCount'in value)||!Number.isInteger(value.pageCount)||Number(value.pageCount)<1||Number(value.pageCount)>PDF_TEXT_LIMITS.pages||value.pages.length>PDF_TEXT_LIMITS.pages)throw documentFailure('DOCUMENT_INVALID','PDF 没有可读取的文字，或超出支持范围。');
 let bytes=0,previous=0;const result:PdfTextPage[]=[];
 for(const item of value.pages){if(!item||typeof item!=='object'||!Number.isInteger(item.page)||item.page<=previous||item.page>Number(value.pageCount)||typeof item.text!=='string'||item.text.includes('\0'))throw documentFailure('DOCUMENT_INVALID','PDF 提取结果无法校验。');bytes+=Buffer.byteLength(item.text);if(bytes>PDF_TEXT_LIMITS.textBytes)throw documentFailure('DOCUMENT_LIMIT','PDF 提取文字超出 2 MiB。');previous=item.page;result.push({page:item.page,text:item.text});}
 return result;
}

/** Fixed local decoder only; no user paths, credentials or source text in argv/logs.
 * The heap flag bounds the V8 heap, not all native decoder memory. Completion
 * waits for process close, including timeout and authorization cancellation. */
export async function extractPdfPages(input: Uint8Array,assertCurrent:()=>void=()=>{},timeoutMs:number=PDF_TEXT_LIMITS.timeoutMs): Promise<PdfTextPage[]> {
 const current=()=>assertDocumentAuthority('PDF',assertCurrent);
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>PDF_TEXT_LIMITS.timeoutMs)throw Error('PDF 处理时限无效。');
 if(input.byteLength>PDF_TEXT_LIMITS.inputBytes||!Buffer.from(input.buffer,input.byteOffset,Math.min(input.byteLength,1024)).includes(Buffer.from('%PDF-')))throw documentFailure('DOCUMENT_INVALID','不是受支持的 PDF，或文件超出 2 MiB。');
 if(pending>=PDF_TEXT_LIMITS.pending)throw documentFailure('DECODER_BUSY','PDF 解析正在处理其他资料，请稍后重新导入。');
 const data=Buffer.from(input);pending++;const previous=tail;let release!:()=>void;tail=new Promise<void>(done=>{release=done;});
 try{
  await previous;current();
  return await new Promise<PdfTextPage[]>((resolve,reject)=>{
   const env:NodeJS.ProcessEnv={};for(const key of Object.keys(process.env))if(['systemroot','windir','temp','tmp','lang','lc_all'].includes(key.toLowerCase()))env[key]=process.env[key];
   const child=spawn(process.execPath,[`--max-old-space-size=${PDF_TEXT_LIMITS.heapMiB}`,fileURLToPath(new URL('./pdf-text-worker.js',import.meta.url))],{env,windowsHide:true,serialization:'advanced',stdio:['ignore','ignore','ignore','ipc']});
   let result:PdfTextPage[]|undefined,failure:Error|undefined;
   const fail=(error:Error)=>{failure??=error;child.kill();};
   const deadline=setTimeout(()=>fail(documentFailure('DECODE_TIMEOUT','PDF 处理超时，未导入该文件。')),timeoutMs);
   const authority=setInterval(()=>{try{current();}catch{fail(Error('资料权限已变化，PDF 导入已停止。'));}},50);
   child.once('message',message=>{try{current();result=pagesFrom(message);}catch(error){fail(error instanceof Error?error:Error('PDF 提取失败。'));}});
   child.once('error',()=>{failure??=documentFailure('DOCUMENT_INVALID','PDF 解析进程无法启动。');});
   child.once('close',code=>{clearTimeout(deadline);clearInterval(authority);if(!failure&&code===0&&result!==undefined){try{current();resolve(result);return;}catch{failure=Error('资料权限已变化，PDF 导入已停止。');}}reject(failure??documentFailure('DOCUMENT_INVALID','PDF 已损坏、受密码保护，或超出支持范围。'));});
   child.send({bytes:data},error=>{if(error)fail(Error('PDF 数据无法交给本机解析进程。'));});
  });
 }finally{pending--;release();}
}
