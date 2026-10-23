import {createHash,randomUUID} from 'node:crypto';
import {closeSync,existsSync,fstatSync,lstatSync,openSync,readFileSync,realpathSync,renameSync,unlinkSync,writeFileSync,fsyncSync} from 'node:fs';
import type {BigIntStats} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {BackupError} from './backup-archive.ts';
import {backupJsonString,parseBackupJson} from './backup-data.ts';

export type ManagedAutomaticKind='market-updates'|'market-checks'|'github-checks';
export type ManagedPendingKind='market'|'github';
export type ManagedPendingMode='manual'|'automatic';
export interface ManagedSkillRuntimePolicy {
  assertWritable():void;
  automatic(kind:ManagedAutomaticKind,id?:string):boolean;
  setAutomatic(kind:ManagedAutomaticKind,enabled:boolean,id?:string):void;
  verifiedFeed(revision:string):void;
  canStageAutomatic(revision:string):boolean;
  authorizePending(kind:ManagedPendingKind,id:string,digest:string,mode:ManagedPendingMode,revision?:string):void;
  allowPending(kind:ManagedPendingKind,id:string,digest:string,mode:string,revision?:string):boolean;
  forgetPending(kind:ManagedPendingKind,id:string):void;
}

const digest=z.string().regex(/^[a-f0-9]{64}$/),name=z.string().min(1).max(128);
const scopeSchema=z.string().max(255),revisionSchema=z.string().regex(/^[a-f0-9]{40}$/);
const automaticSchema=z.object({scope:scopeSchema,kind:z.enum(['market-updates','market-checks','github-checks']),id:z.string().max(128),enabled:z.boolean()}).strict().refine(row=>row.kind==='github-checks'?digest.safeParse(row.id).success:row.id==='');
const pendingSchema=z.object({scope:scopeSchema,kind:z.enum(['market','github']),id:name,digest,mode:z.enum(['manual','automatic']),revision:z.string().regex(/^(?:[a-f0-9]{40})?$/)}).strict().refine(row=>row.kind==='market'?(row.mode==='automatic'?!!row.revision:!row.revision):row.mode==='manual'&&!row.revision&&digest.safeParse(row.id).success);
const documentSchema=z.object({schema:z.literal('dsh-zhen-managed-runtime-policy-v1'),epoch:z.uuid(),revision:z.uuid(),automatic:z.array(automaticSchema).max(2304),verified:z.array(z.object({scope:scopeSchema,revision:revisionSchema}).strict()).max(128),pending:z.array(pendingSchema).max(40032)}).strict().refine(doc=>new Set(doc.automatic.map(row=>row.scope+'\0'+row.kind+'\0'+row.id)).size===doc.automatic.length&&new Set(doc.pending.map(row=>row.kind+'\0'+row.id)).size===doc.pending.length&&new Set(doc.verified.map(row=>row.scope)).size===doc.verified.length);
type Document=z.infer<typeof documentSchema>;
const LIMIT=16*1024**2,stamp=(stat:BigIntStats)=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':'),node=(stat:BigIntStats)=>stat.dev+':'+stat.ino;
const same=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
function fail():never{throw new BackupError('BACKUP_MANAGED_RUNTIME_CHANGED');}

/** Receipts belong to one NEW active copy. They are deliberately absent from
 * skill inventory backups: an old pending/manual flag is never a new approval.
 * The owner supplies a fixed root and a current role/profile permission check. */
export class FileManagedSkillRuntimePolicy implements ManagedSkillRuntimePolicy {
  private readonly file:string;
  private readonly rootIdentity:string;
  private cache?:{version:string;hash:string;document:Document;automatic:Map<string,boolean>;pending:Map<string,z.infer<typeof pendingSchema>>;verified:Map<string,string>};
  constructor(private readonly root:string,private readonly epoch:string,private readonly current:()=>void,private readonly scope=''){
    z.uuid().parse(epoch);scopeSchema.parse(scope);this.file=join(root,'policy.json');
    const stat=lstatSync(root,{bigint:true});if(stat.isSymbolicLink()||!stat.isDirectory()||!same(realpathSync.native(root),root))fail();this.rootIdentity=node(stat);this.read();
  }
  static initialize(root:string,epoch:string):void{
    z.uuid().parse(epoch);const stat=lstatSync(root,{bigint:true});if(stat.isSymbolicLink()||!stat.isDirectory()||!same(realpathSync.native(root),root))fail();
    const bytes=backupJsonString(documentSchema.parse({schema:'dsh-zhen-managed-runtime-policy-v1',epoch,revision:randomUUID(),automatic:[],verified:[],pending:[]}))+'\n';
    const fd=openSync(join(root,'policy.json'),'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  }
  /** Explicitly resuming management starts with no prior update approvals. */
  static reset(root:string,epoch:string,assertCurrent:()=>void,scope=''):void{
    z.uuid().parse(epoch);scopeSchema.parse(scope);assertCurrent();const before=lstatSync(root,{bigint:true});if(before.isSymbolicLink()||!before.isDirectory()||!same(realpathSync.native(root),root))fail();
    const currentVersion=()=>{try{return stamp(lstatSync(join(root,'policy.json'),{bigint:true}));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return 'absent';throw error;}},previousVersion=currentVersion();
    let document:Document;try{document=structuredClone(new FileManagedSkillRuntimePolicy(root,epoch,()=>{},scope).read().document);document.revision=randomUUID();document.automatic=document.automatic.filter(row=>row.scope!==scope);document.verified=document.verified.filter(row=>row.scope!==scope);document.pending=document.pending.filter(row=>row.scope!==scope);}catch{document=documentSchema.parse({schema:'dsh-zhen-managed-runtime-policy-v1',epoch,revision:randomUUID(),automatic:[],verified:[],pending:[]});}
    const temporary=join(root,'.p-'+randomUUID().slice(0,12)),fd=openSync(temporary,'wx',0o600),identity=node(fstatSync(fd,{bigint:true}));
    try{try{writeFileSync(fd,backupJsonString(documentSchema.parse(document))+'\n');fsyncSync(fd);}finally{closeSync(fd);}assertCurrent();const after=lstatSync(root,{bigint:true});if(after.isSymbolicLink()||node(after)!==node(before)||!same(realpathSync.native(root),root)||currentVersion()!==previousVersion)fail();renameSync(temporary,join(root,'policy.json'));}
    finally{const after=lstatSync(root,{bigint:true});if(!after.isSymbolicLink()&&node(after)===node(before)&&same(realpathSync.native(root),root)&&existsSync(temporary)){const stat=lstatSync(temporary,{bigint:true});if(!stat.isSymbolicLink()&&stat.isFile()&&node(stat)===identity)unlinkSync(temporary);}}
  }
  private boundary():void{const stat=lstatSync(this.root,{bigint:true});if(stat.isSymbolicLink()||!stat.isDirectory()||node(stat)!==this.rootIdentity||!same(realpathSync.native(this.root),this.root))fail();}
  assertWritable():void{this.boundary();this.current();this.boundary();this.read();}
  private read(){
    this.boundary();const before=lstatSync(this.file,{bigint:true});if(before.isSymbolicLink()||!before.isFile()||before.size>BigInt(LIMIT))fail();
    if(this.cache?.version===stamp(before))return this.cache;
    const fd=openSync(this.file,'r');let bytes:Buffer;try{if(stamp(fstatSync(fd,{bigint:true}))!==stamp(before))fail();bytes=readFileSync(fd);if(bytes.length!==Number(before.size)||stamp(fstatSync(fd,{bigint:true}))!==stamp(before)||stamp(lstatSync(this.file,{bigint:true}))!==stamp(before))fail();}finally{closeSync(fd);}
    let document:Document;try{document=documentSchema.parse(parseBackupJson(bytes));}catch{return fail();}if(document.epoch!==this.epoch)fail();
    return this.cache={version:stamp(before),hash:createHash('sha256').update(bytes).digest('hex'),document,automatic:new Map(document.automatic.map(row=>[row.scope+'\0'+row.kind+'\0'+row.id,row.enabled])),pending:new Map(document.pending.map(row=>[row.kind+'\0'+row.id,row])),verified:new Map(document.verified.map(row=>[row.scope,row.revision]))};
  }
  private change(update:(document:Document)=>void):void{
    this.assertWritable();const before=this.read(),document=structuredClone(before.document);update(document);document.revision=randomUUID();
    const bytes=Buffer.from(backupJsonString(documentSchema.parse(document))+'\n');if(bytes.length>LIMIT)fail();
    const temporary=join(this.root,'.p-'+randomUUID().slice(0,12)),fd=openSync(temporary,'wx',0o600),identity=node(fstatSync(fd,{bigint:true}));
    try{try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}this.assertWritable();if(this.read().hash!==before.hash)fail();const stat=lstatSync(temporary,{bigint:true});if(stat.isSymbolicLink()||!stat.isFile()||node(stat)!==identity)fail();renameSync(temporary,this.file);this.cache=undefined;}
    finally{this.boundary();if(existsSync(temporary)){const stat=lstatSync(temporary,{bigint:true});if(!stat.isSymbolicLink()&&stat.isFile()&&node(stat)===identity)unlinkSync(temporary);}}
  }
  automatic(kind:ManagedAutomaticKind,id=''):boolean{try{this.assertWritable();return this.read().automatic.get(this.scope+'\0'+kind+'\0'+id)===true;}catch{return false;}}
  setAutomatic(kind:ManagedAutomaticKind,enabled:boolean,id=''):void{
    const row=automaticSchema.parse({scope:this.scope,kind,id,enabled});this.change(document=>{document.automatic=document.automatic.filter(item=>item.scope!==this.scope||item.kind!==kind||item.id!==id);if(enabled)document.automatic.push(row);if(kind==='market-updates'&&!enabled){document.verified=document.verified.filter(item=>item.scope!==this.scope);document.pending=document.pending.filter(item=>item.kind!=='market'||item.mode!=='automatic');}});
  }
  verifiedFeed(revision:string):void{revisionSchema.parse(revision);this.change(document=>{document.verified=document.verified.filter(row=>row.scope!==this.scope);document.verified.push({scope:this.scope,revision});});}
  canStageAutomatic(revision:string):boolean{try{return /^[a-f0-9]{40}$/.test(revision)&&this.automatic('market-updates')&&this.read().verified.get(this.scope)===revision;}catch{return false;}}
  authorizePending(kind:ManagedPendingKind,id:string,digest:string,mode:ManagedPendingMode,revision=''):void{
    const row=pendingSchema.parse({scope:this.scope,kind,id,digest,mode,revision});this.change(document=>{if(mode==='automatic'&&(!document.automatic.some(row=>row.scope===this.scope&&row.kind==='market-updates'&&row.enabled)||document.verified.find(row=>row.scope===this.scope)?.revision!==revision))fail();document.pending=document.pending.filter(item=>item.kind!==kind||item.id!==id);document.pending.push(row);});
  }
  allowPending(kind:ManagedPendingKind,id:string,digest:string,mode:string,revision=''):boolean{
    try{this.assertWritable();const row=this.read().pending.get(kind+'\0'+id);return !!row&&row.scope===this.scope&&row.digest===digest&&row.mode===mode&&row.revision===revision&&(mode!=='automatic'||this.canStageAutomatic(revision));}catch{return false;}
  }
  forgetPending(kind:ManagedPendingKind,id:string):void{this.change(document=>{document.pending=document.pending.filter(row=>row.kind!==kind||row.id!==id);});}
}
