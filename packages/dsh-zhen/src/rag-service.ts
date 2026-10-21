import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,rmSync,statSync,lstatSync,openSync,fstatSync,closeSync,realpathSync,readSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {HarnessError} from '@deepseek-ai/dsh-llm';
import {z} from 'zod';
import type {KnowledgeStore,KnowledgeHit,KnowledgeSource,KnowledgeSelection,KnowledgeIndexPage} from './knowledge.ts';
import {ragBackendId,ragBackendSettingsSchema,ragBackendStatusSchema,ragBackendMessages} from './rag-backend-schema.ts';
import type {RagBackendStatus} from './rag-backend-schema.ts';
export interface RagContext{sessionId:string;provider:string;directory:string;}
export interface RagProviderScope{readonly project:string;readonly collections:readonly {readonly id:string;readonly epoch:number}[];readonly signal:AbortSignal;lexical():readonly KnowledgeSelection[];scan(after?:string|null):Promise<KnowledgeIndexPage>;}
/** Trusted Host extension. Returns identifiers, never its own snippets or permission decisions. */
export interface RagSearchProvider{readonly id:string;readonly label:string;search(query:string,scope:RagProviderScope):Promise<readonly KnowledgeSelection[]>|readonly KnowledgeSelection[];}
export interface RagBackupState {settings:{schemaVersion:1;selected:string;enabled:boolean};status:RagBackendStatus;persisted:{present:boolean;bytesBase64:string;valid:boolean};}
const selections=z.array(z.object({id:z.uuid(),epoch:z.number().int().positive()}).strict()).max(12);
function failure(code:keyof typeof ragBackendMessages):HarnessError{return new HarnessError(ragBackendMessages[code],code);}
export class ZhenRag{
  private readonly providers=new Map<string,RagSearchProvider>();
  private settings={schemaVersion:1 as const,selected:'lexical',enabled:true};
  private valid=true;private closed=false;private revision=randomUUID();private operations=new AbortController();
  constructor(private readonly store:()=>KnowledgeStore,private readonly file?:string,private readonly timeoutMs=10000){
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Invalid RAG deadline.');
    if(file&&existsSync(file)){try{if(statSync(file).size>8192)throw Error('RAG settings limit.');this.settings=ragBackendSettingsSchema.parse(JSON.parse(readFileSync(file,'utf8')));}catch{this.valid=false;}}
    this.register({id:'lexical',label:'本地关键词检索',search:(_query,scope)=>scope.lexical()});
  }
  register(provider:RagSearchProvider):()=>void{
    const id=ragBackendId.parse(provider.id),label=z.string().trim().min(1).max(100).parse(provider.label);
    if(this.closed||this.providers.has(id)||this.providers.size>=16||typeof provider.search!=='function')throw Error('RAG backend registration refused.');
    const owned={id,label,search:provider.search.bind(provider)};this.providers.set(id,owned);this.changed();
    let active=true;return()=>{if(!active)return;active=false;if(this.providers.get(id)===owned){this.providers.delete(id);this.changed();}};
  }
  private changed():void{this.operations.abort();this.operations=new AbortController();this.revision=randomUUID();}
  snapshot():RagBackendStatus{return ragBackendStatusSchema.parse({selected:this.settings.selected,enabled:this.settings.enabled,state:!this.valid?'invalid':!this.settings.enabled?'paused':this.closed||!this.providers.has(this.settings.selected)?'unavailable':'ready',revision:this.revision,providers:[...this.providers.values()].map(({id,label})=>({id,label}))});}
  /** Own settings only. Preserve invalid/orphaned disk state as data, while
   * keeping it distinct from the settings currently active in this Host. */
  backupState():RagBackupState{
    if(this.closed)throw Error('BACKUP_SOURCE_CHANGED');let bytes=Buffer.alloc(0),present=false,valid=false;
    if(this.file){let fd:number|undefined;try{
      const before=lstatSync(this.file,{bigint:true});if(before.isSymbolicLink()||!before.isFile()||before.size>8192n)throw Error();const path=realpathSync(this.file);fd=openSync(this.file,'r');const initial=fstatSync(fd,{bigint:true});if(initial.dev!==before.dev||initial.ino!==before.ino||initial.size!==before.size)throw Error();
      // Fixed buffer refuses growth instead of allocating an unbounded read.
      bytes=Buffer.alloc(8193);let size=0;while(size<bytes.length){const read=readSync(fd,bytes,size,bytes.length-size,null);if(!read)break;size+=read;}if(size>8192||BigInt(size)!==before.size)throw Error();bytes=bytes.subarray(0,size);
      const after=lstatSync(this.file,{bigint:true}),end=fstatSync(fd,{bigint:true});for(const key of ['dev','ino','size','mtimeNs','ctimeNs'] as const)if(before[key]!==after[key]||before[key]!==end[key])throw Error();if(after.isSymbolicLink()||realpathSync(this.file)!==path)throw Error();present=true;
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw Error('BACKUP_RAG_SETTINGS_CHANGED');}finally{if(fd!==undefined)closeSync(fd);}}
    if(present){try{valid=ragBackendSettingsSchema.safeParse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))).success;}catch{valid=false;}}
    return {settings:structuredClone(this.settings),status:this.snapshot(),persisted:{present,bytesBase64:bytes.toString('base64'),valid}};
  }
  configure(selected:string,enabled:boolean,expectedRevision:string):RagBackendStatus{
    if(this.closed||expectedRevision!==this.revision)throw failure('RAG_SETTINGS_CONFLICT');
    const next=ragBackendSettingsSchema.parse({schemaVersion:1,selected,enabled});if(!this.providers.has(next.selected))throw failure('RAG_BACKEND_UNAVAILABLE');
    if(this.file){const temporary=this.file+'.'+randomUUID()+'.tmp';try{mkdirSync(dirname(this.file),{recursive:true});writeFileSync(temporary,JSON.stringify(next)+'\n',{flag:'wx',mode:0o600});renameSync(temporary,this.file);}catch{try{rmSync(temporary,{force:true});}catch{}throw failure('RAG_CONFIGURATION_INVALID');}}
    this.settings=next;this.valid=true;this.changed();return this.snapshot();
  }
  assertAvailable():void{
    const state=this.snapshot().state;if(state!=='ready')throw failure(state==='paused'?'RAG_PAUSED':state==='invalid'?'RAG_CONFIGURATION_INVALID':'RAG_BACKEND_UNAVAILABLE');
  }
  assertRevision(revision:string):void{this.assertAvailable();if(this.revision!==revision)throw failure('RAG_BACKEND_CHANGED');}
  async search(context:RagContext,query:string,signal:AbortSignal):Promise<KnowledgeHit[]>{
    if(typeof query!=='string'||!query.trim()||query.length>200)throw failure('RAG_INVALID_QUERY');
    this.assertAvailable();signal.throwIfAborted();const revision=this.revision,provider=this.providers.get(this.settings.selected)!;
    const check=()=>{signal.throwIfAborted();if(this.revision!==revision)throw failure('RAG_BACKEND_CHANGED');this.assertAvailable();};
    const hits=await this.store().retrieveForAgent(context.sessionId,context.provider,context.directory,query,async scope=>{
      check();const lease=new AbortController(),timeout=AbortSignal.timeout(this.timeoutMs),combined=AbortSignal.any([signal,this.operations.signal,timeout,lease.signal]);
      let remove=()=>{};
      try{
        const stopped=new Promise<never>((_resolve,reject)=>{const onAbort=()=>reject(Error('RAG_STOPPED'));combined.addEventListener('abort',onAbort,{once:true});remove=()=>combined.removeEventListener('abort',onAbort);if(combined.aborted)onAbort();});
        const view:RagProviderScope=Object.freeze({project:scope.project,collections:scope.collections,signal:combined,lexical:()=>{check();combined.throwIfAborted();return this.store().search(scope.project,query,context.provider).map(hit=>({id:hit.id,epoch:hit.epoch}));},scan:async(after:string|null=null)=>{check();combined.throwIfAborted();const page=await this.store().retrievalPage(context.sessionId,context.provider,context.directory,scope,after);check();combined.throwIfAborted();return page;}});
        const value=await Promise.race([Promise.resolve().then(()=>{check();combined.throwIfAborted();return provider.search(query,view);}),stopped]);
        check();if(timeout.aborted)throw failure('RAG_BACKEND_TIMEOUT');const parsed=selections.safeParse(value);if(!parsed.success)throw failure('RAG_INVALID_RESULT');return parsed.data;
      }catch(error){check();if(timeout.aborted)throw failure('RAG_BACKEND_TIMEOUT');if(error instanceof HarnessError&&Object.hasOwn(ragBackendMessages,error.code)&&error.message===ragBackendMessages[error.code as keyof typeof ragBackendMessages])throw error;throw failure('RAG_BACKEND_FAILED');}
      finally{remove();lease.abort();}
    });check();return hits;
  }
  async source(context:RagContext,id:string,epoch:number,signal:AbortSignal):Promise<KnowledgeSource>{
    this.assertAvailable();signal.throwIfAborted();const revision=this.revision;const source=await this.store().sourceForAgent(context.sessionId,context.provider,context.directory,id,epoch);signal.throwIfAborted();if(this.revision!==revision)throw failure('RAG_BACKEND_CHANGED');this.assertAvailable();return source;
  }
  close():void{this.closed=true;this.changed();this.providers.clear();}
}
