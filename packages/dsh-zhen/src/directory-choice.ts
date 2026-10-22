import {randomUUID} from 'node:crypto';
import {isAbsolute} from 'node:path';
import type {DirectoryPickerCapability} from '@deepseek-ai/dsh-host-directory-picker';
import {directoryChoiceRequestSchema,directoryChoiceBrowseRequestSchema,directoryChoiceListingSchema,directoryChoiceResultSchema} from './directory-choice-schema.ts';
import type {DirectoryChoiceInfo,DirectoryChoiceRequest,DirectoryChoiceBrowseRequest,DirectoryChoiceListing,DirectoryChoiceResult,DirectoryChoiceBrowseResult} from './directory-choice-schema.ts';

type Code='UNAVAILABLE'|'CHANGED'|'BUSY'|'REPLAY'|'LIMIT'|'CANCELLED'|'TIMEOUT'|'INVALID'|'FAILED'|'CLOSED';
const messages:Record<Code,string>={UNAVAILABLE:'当前环境无法选择目录，请手动填写完整路径。',CHANGED:'目录选择服务已变化，请重新点击选择文件夹。',BUSY:'上一次目录选择窗口尚未结束，请先关闭该窗口。',REPLAY:'这次目录选择已结束，请重新点击选择文件夹。',LIMIT:'目录选择请求过多，请稍后再试。',CANCELLED:'已取消目录选择，原路径保留。',TIMEOUT:'目录选择超时，请关闭旧窗口后重新选择。',INVALID:'目录选择器返回的信息无效，请重新选择或手动填写路径。',FAILED:'目录暂时无法读取，请选择其他位置或手动填写路径。',CLOSED:'目录选择服务已关闭，请刷新后再试。'};
export class DirectoryChoiceError extends Error{constructor(readonly code:Code){super(messages[code]);}}
export interface DirectoryChoiceSource{owner:object;capability:DirectoryPickerCapability;}
type Snapshot={source:DirectoryChoiceSource|undefined;kind:DirectoryChoiceInfo['kind'];generation:string;};
type Operation={id:string;controller:AbortController;timer:ReturnType<typeof setTimeout>;native:boolean;};
/** Adapter of the published directoryPicker seam. Selection never grants access,
 * creates a workspace, reads file contents, or performs the caller's later action. */
export class DirectoryChoices{
  private snapshot?:Snapshot;private closed=false;private readonly pending=new Map<string,Operation>();private readonly recent=new Map<string,number>();private native?:Operation;
  constructor(private readonly resolve:()=>DirectoryChoiceSource|undefined,private readonly budgets={nativeMs:120000,browseMs:15000},private readonly now=Date.now){}
  invalidate():void{this.snapshot=undefined;for(const operation of this.pending.values()){clearTimeout(operation.timer);operation.controller.abort(new DirectoryChoiceError('CHANGED'));}}
  close():void{if(this.closed)return;this.closed=true;for(const operation of this.pending.values()){clearTimeout(operation.timer);operation.controller.abort(new DirectoryChoiceError('CLOSED'));}this.snapshot=undefined;this.recent.clear();}
  private current():Snapshot{
    if(this.closed)throw new DirectoryChoiceError('CLOSED');let source:DirectoryChoiceSource|undefined;try{source=this.resolve();}catch{source=undefined;}
    const raw=source?.capability?.kind,kind=raw==='native'||raw==='browse'?raw:'unavailable';
    if(!this.snapshot||this.snapshot.source?.owner!==source?.owner||this.snapshot.source?.capability!==source?.capability||this.snapshot.kind!==kind){this.invalidate();this.snapshot={source,kind,generation:randomUUID()};}
    return this.snapshot;
  }
  info():DirectoryChoiceInfo{const{kind,generation}=this.current();return{kind,generation};}
  cancel(request:DirectoryChoiceRequest):void{const parsed=directoryChoiceRequestSchema.parse(request),operation=this.pending.get(parsed.id);if(operation&&this.snapshot?.generation===parsed.generation)operation.controller.abort(new DirectoryChoiceError('CANCELLED'));}
  private qualified(path:string):boolean{return path.length<=4096&&!path.includes('\0')&&isAbsolute(path)&&(process.platform!=='win32'||/^[A-Za-z]:[\\/]/.test(path)||/^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(path));}
  private same(snapshot:Snapshot):void{if(this.current()!==snapshot)throw new DirectoryChoiceError('CHANGED');}
  private async run<T>(request:DirectoryChoiceRequest,kind:'native'|'browse',work:(capability:DirectoryPickerCapability,signal:AbortSignal)=>Promise<T>):Promise<T>{
    const snapshot=this.current();if(snapshot.generation!==request.generation)throw new DirectoryChoiceError('CHANGED');if(snapshot.kind!==kind||!snapshot.source)throw new DirectoryChoiceError('UNAVAILABLE');
    const now=this.now();for(const[id,expires]of this.recent)if(expires<=now)this.recent.delete(id);
    if(this.recent.has(request.id))throw new DirectoryChoiceError('REPLAY');if(kind==='native'&&this.native)throw new DirectoryChoiceError('BUSY');if(this.pending.size>=8||this.recent.size>=2048)throw new DirectoryChoiceError('LIMIT');
    const controller=new AbortController(),operation:Operation={id:request.id,controller,native:kind==='native',timer:setTimeout(()=>controller.abort(new DirectoryChoiceError('TIMEOUT')),kind==='native'?this.budgets.nativeMs:this.budgets.browseMs)};
    this.pending.set(request.id,operation);this.recent.set(request.id,now+10*60*1000);if(operation.native)this.native=operation;
    let detach=()=>{};const aborted=new Promise<never>((_resolve,reject)=>{const stop=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',stop,{once:true});detach=()=>controller.signal.removeEventListener('abort',stop);});
    const pending=Promise.resolve().then(()=>{this.same(snapshot);controller.signal.throwIfAborted();return work(snapshot.source!.capability,controller.signal);});
    const cleanup=()=>{clearTimeout(operation.timer);this.pending.delete(request.id);if(this.native===operation)this.native=undefined;};void pending.then(cleanup,cleanup);
    try{const result=await Promise.race([pending,aborted]);controller.signal.throwIfAborted();this.same(snapshot);return result;}
    catch(error){if(error instanceof DirectoryChoiceError)throw error;throw new DirectoryChoiceError('FAILED');}
    finally{detach();}
  }
  async pick(request:DirectoryChoiceRequest):Promise<DirectoryChoiceResult>{
    const parsed=directoryChoiceRequestSchema.parse(request),path=await this.run(parsed,'native',async(capability,signal)=>{if(capability.kind!=='native')throw new DirectoryChoiceError('CHANGED');const value=await capability.pick(signal);if(value!==null&&(typeof value!=='string'||!this.qualified(value)))throw new DirectoryChoiceError('INVALID');return value;});
    return directoryChoiceResultSchema.parse({...parsed,path});
  }
  async browse(request:DirectoryChoiceBrowseRequest):Promise<DirectoryChoiceBrowseResult>{
    const parsed=directoryChoiceBrowseRequestSchema.parse(request);if(parsed.path!==undefined&&!this.qualified(parsed.path))throw new DirectoryChoiceError('INVALID');
    const listing=await this.run(parsed,'browse',async(capability,signal)=>{
      if(capability.kind!=='browse')throw new DirectoryChoiceError('CHANGED');const raw=await capability.list(parsed.path,signal);
      try{if(!Array.isArray(raw.entries)||raw.entries.length>100000||typeof raw.truncated!=='boolean')throw new Error();const value:DirectoryChoiceListing=directoryChoiceListingSchema.parse({...raw,entries:raw.entries.slice(0,1000),truncated:raw.truncated||raw.entries.length>1000});if(![value.path,value.home,...value.crumbs.map(row=>row.path),...value.entries.map(row=>row.path)].every(path=>this.qualified(path))||value.crumbs.at(-1)!.path!==value.path||new Set(value.entries.map(row=>row.path)).size!==value.entries.length)throw new Error();return value;}catch{throw new DirectoryChoiceError('INVALID');}
    });
    return{generation:parsed.generation,id:parsed.id,listing};
  }
}
