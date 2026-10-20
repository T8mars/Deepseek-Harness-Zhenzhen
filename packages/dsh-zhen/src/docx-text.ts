import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {DOCX_LIMITS} from './docx-parse.ts';
export {DOCX_LIMITS} from './docx-parse.ts';
let tail=Promise.resolve(),pending=0;
function decoded(value:unknown):string {
 if(value&&typeof value==='object'&&'ok'in value&&value.ok===true&&'text'in value&&typeof value.text==='string'&&!value.text.includes('\0')&&Buffer.byteLength(value.text)<=DOCX_LIMITS.textBytes)return value.text;
 const code=value&&typeof value==='object'&&'code'in value?value.code:'';
 throw Error(code==='TEXT_LIMIT'?'Word 提取文字超出 2 MiB。':code==='LIMIT'?'Word 压缩包或 XML 内容超出支持范围。':code==='UNSUPPORTED'?'Word 包含暂不支持的文档类型或内容，未导入。':'Word 文档损坏、加密或格式无法读取，未导入。');
}
/** Fixed local child, binary IPC only. The archive inflater has its own bounded
 * output; heapMiB is an additional V8 limit, not an OS memory guarantee. */
export async function extractDocxText(input:Uint8Array,assertCurrent:()=>void=()=>{},timeoutMs:number=DOCX_LIMITS.timeoutMs):Promise<string>{
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>DOCX_LIMITS.timeoutMs)throw Error('Word 处理时限无效。');if(input.byteLength>DOCX_LIMITS.inputBytes||input.byteLength<4||Buffer.from(input.buffer,input.byteOffset,4).readUInt32LE()!==0x04034b50)throw Error('不是受支持的 DOCX，或文件超出 2 MiB。');if(pending>=DOCX_LIMITS.pending)throw Error('Word 解析正在处理其他资料，请稍后重新导入。');
 const bytes=Buffer.from(input);pending++;const previous=tail;let release!:()=>void;tail=new Promise<void>(done=>{release=done;});
 try{await previous;assertCurrent();return await new Promise<string>((resolve,reject)=>{
  const env:NodeJS.ProcessEnv={};for(const key of Object.keys(process.env))if(['systemroot','windir','temp','tmp','lang','lc_all'].includes(key.toLowerCase()))env[key]=process.env[key];
  const child=spawn(process.execPath,[`--max-old-space-size=${DOCX_LIMITS.heapMiB}`,fileURLToPath(new URL('./docx-text-worker.js',import.meta.url))],{env,windowsHide:true,serialization:'advanced',stdio:['ignore','ignore','ignore','ipc']});let result:string|undefined,failure:Error|undefined;
  const fail=(error:Error)=>{failure??=error;child.kill();},deadline=setTimeout(()=>fail(Error('Word 处理超时，未导入该文件。')),timeoutMs),authority=setInterval(()=>{try{assertCurrent();}catch{fail(Error('资料权限已变化，Word 导入已停止。'));}},50);
  child.once('message',message=>{try{assertCurrent();result=decoded(message);}catch(error){fail(error instanceof Error?error:Error('Word 提取失败。'));}});child.once('error',()=>{failure??=Error('Word 解析进程无法启动。');});
  child.once('close',code=>{clearTimeout(deadline);clearInterval(authority);if(!failure&&code===0&&result!==undefined){try{assertCurrent();resolve(result);return;}catch{failure=Error('资料权限已变化，Word 导入已停止。');}}reject(failure??Error('Word 文档无法读取，未导入。'));});child.send({bytes},error=>{if(error)fail(Error('Word 数据无法交给本机解析进程。'));});
 });}finally{pending--;release();}
}
