import {createHash,randomUUID} from 'node:crypto';
import {closeSync,existsSync,fstatSync,fsyncSync,lstatSync,openSync,readSync,realpathSync,renameSync,unlinkSync,writeFileSync,watchFile,unwatchFile} from 'node:fs';
import type {BigIntStats} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {BackupError} from './backup-archive.ts';
import {backupJsonString,parseBackupJson} from './backup-data.ts';
import {verifySkill} from './market.ts';
import {FileManagedSkillRuntimePolicy} from './managed-skill-runtime-policy.ts';
import type {ManagedSkillRuntimePolicy} from './managed-skill-runtime-policy.ts';
import {prepareManagedRuntimeCopy,discardManagedRuntimeCopy,managedRuntimeRoleSchema} from './managed-skill-runtime-copy.ts';
import type {ManagedRuntimeCopy,ManagedRuntimeOwners,ManagedRuntimeRole} from './managed-skill-runtime-copy.ts';
import {restoredManagedRuntimeRequest,restoredManagedRuntimeView} from './restored-managed-runtime-schema.ts';
import type {RestoredManagedRuntimeRequest,RestoredManagedRuntimeView} from './restored-managed-runtime-schema.ts';

const digest=z.string().regex(/^[a-f0-9]{64}$/),entrySchema=z.object({profile:z.string().min(1).max(255),epoch:z.uuid(),leaf:z.string().regex(/^m[a-f0-9]{12}$/),origin:digest,rootIdentity:z.string().regex(/^\d+:\d+$/),seal:digest,enabled:z.boolean()}).strict();
const storeSchema=z.object({schema:z.literal('dsh-zhen-managed-runtime-v1'),revision:z.uuid(),roles:z.array(entrySchema).max(128)}).strict().refine(doc=>new Set(doc.roles.map(row=>row.profile)).size===doc.roles.length&&doc.roles.every(row=>['epoch','leaf','origin','rootIdentity','seal'].every(key=>row[key as keyof typeof row]===doc.roles[0]?.[key as keyof typeof row])));
type Store=z.infer<typeof storeSchema>;
export interface ManagedRuntimeSelection {entry:z.infer<typeof entrySchema>;role:ManagedRuntimeRole;root:string;granted:boolean;}
const queues=new Map<string,Promise<void>>(),stamp=(stat:BigIntStats)=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':'),node=(stat:BigIntStats)=>stat.dev+':'+stat.ino,hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const same=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
function fail(code='BACKUP_MANAGED_RUNTIME_CHANGED'):never{throw new BackupError(code);}

/** Owner-only role selection. The immutable restore and its original managed
 * state are retained; only a fresh, explicitly accepted copy becomes writable. */
export class RestoredManagedRuntime {
  private readonly file:string;
  private readonly homeIdentity?:string;
  private readonly dataIdentity?:string;
  private readonly original?:string;
  private readonly files=new Map<string,{version:string;hash:string;value:unknown}>();
  private readonly policies=new Map<string,ManagedSkillRuntimePolicy>();
  private readonly listeners=new Set<()=>void>();
  private readonly watchedData=new Set<string>();
  private closed=false;
  constructor(private readonly home:string,private readonly profile:string|undefined,private readonly restored:boolean,private readonly owners:()=>ManagedRuntimeOwners,private readonly validateHost:()=>Promise<void>,private readonly isCurrent:()=>boolean){
    this.file=join(home,'dsh-zhen','managed-runtime.json');if(restored&&profile){const a=lstatSync(home,{bigint:true}),b=lstatSync(join(home,'dsh-zhen'),{bigint:true});if(a.isSymbolicLink()||b.isSymbolicLink()||!a.isDirectory()||!b.isDirectory()||!same(realpathSync.native(home),home)||!same(realpathSync.native(join(home,'dsh-zhen')),join(home,'dsh-zhen')))fail();this.homeIdentity=node(a);this.dataIdentity=node(b);this.original=this.origin();watchFile(this.file,{persistent:false,interval:250},this.changed);}
  }
  private boundary():void{if(this.closed)fail();for(const[path,id]of[[this.home,this.homeIdentity],[join(this.home,'dsh-zhen'),this.dataIdentity]]){const stat=lstatSync(path!,{bigint:true});if(stat.isSymbolicLink()||!stat.isDirectory()||node(stat)!==id||!same(realpathSync.native(path!),path!))fail();}}
  private read<T>(path:string,limit:number,parse:(value:unknown)=>T):{value:T;hash:string;version:string}{
    this.boundary();const before=lstatSync(path,{bigint:true});if(before.isSymbolicLink()||!before.isFile()||before.size>BigInt(limit))fail();const cached=this.files.get(path);if(cached?.version===stamp(before))return {...cached,value:cached.value as T};
    const fd=openSync(path,'r');let bytes:Buffer;try{if(stamp(fstatSync(fd,{bigint:true}))!==stamp(before))fail();bytes=Buffer.alloc(Number(before.size));let at=0;while(at<bytes.length){const count=readSync(fd,bytes,at,bytes.length-at,at);if(!count)fail();at+=count;}if(stamp(fstatSync(fd,{bigint:true}))!==stamp(before)||stamp(lstatSync(path,{bigint:true}))!==stamp(before))fail();}finally{closeSync(fd);}
    const result={version:stamp(before),hash:hash(bytes),value:parse(parseBackupJson(bytes))};this.files.set(path,result);return result;
  }
  private origin():string{
    this.boundary();const base=join(this.home,'dsh-zhen'),marker=this.read(join(base,'skills-recovery.json'),64*1024**2,value=>value).hash;
    const parts=['skills.sqlite','local-skills.json','github-skills'].map(name=>{const path=join(base,name);try{const stat=lstatSync(path,{bigint:true});if(stat.isSymbolicLink()||(name==='github-skills'?!stat.isDirectory():!stat.isFile()))fail();let value=stamp(stat);if(name==='github-skills'){const state=join(path,'state.json');try{const file=lstatSync(state,{bigint:true});if(file.isSymbolicLink()||!file.isFile())fail();value=node(stat)+':'+stamp(file);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;value=node(stat)+':absent';}}return value;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return 'absent';throw error;}});
    return hash([this.homeIdentity,this.dataIdentity,marker,...parts].join('\0'));
  }
  private assertContext():void{if(!this.restored||!this.profile||!this.isCurrent()||this.origin()!==this.original)fail();}
  private store(){this.boundary();try{lstatSync(this.file);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;this.files.delete(this.file);return {value:null as Store|null,hash:'absent'};}return this.read(this.file,256*1024,value=>storeSchema.parse(value));}
  selection():ManagedRuntimeSelection|null{
    if(!this.restored||!this.profile)return null;this.assertContext();const roles=this.store().value?.roles??[],own=roles.find(row=>row.profile===this.profile),base=roles[0];if(!base)return null;const entry=own??{...base,profile:this.profile,enabled:false};
    const root=join(this.home,entry.leaf),stat=lstatSync(root,{bigint:true});if(stat.isSymbolicLink()||!stat.isDirectory()||node(stat)!==entry.rootIdentity||!same(realpathSync.native(root),root)||entry.origin!==this.original)fail();
    const record=this.read(join(root,'role.json'),16*1024**2,value=>{const role=managedRuntimeRoleSchema.parse(value);for(const item of[...role.catalog,...role.bundled])verifySkill(item);return role;}),role=record.value;
    if(record.hash!==entry.seal||!same(role.home,this.home)||!roles.some(row=>row.profile===role.profile)||role.epoch!==entry.epoch||role.origin!==entry.origin||role.leaf!==entry.leaf||role.rootIdentity!==entry.rootIdentity)fail();
    for(const name of['s.db','l.json',join('g','state.json'),'f.json','policy.json']){const path=join(root,name);if(!this.watchedData.has(path)){watchFile(path,{persistent:false,interval:250},this.changed);this.watchedData.add(path);}}
    return {entry,role,root,granted:!!own};
  }
  policy(selection:ManagedRuntimeSelection):ManagedSkillRuntimePolicy{
    let policy=this.policies.get(selection.entry.epoch);if(!policy){let file:FileManagedSkillRuntimePolicy|undefined;const get=()=>file??=new FileManagedSkillRuntimePolicy(selection.root,selection.entry.epoch,()=>{this.assertContext();const current=this.selection();if(!current?.granted||!current.entry.enabled||current.entry.epoch!==selection.entry.epoch||current.entry.seal!==selection.entry.seal||current.root!==selection.root)fail('BACKUP_MANAGED_RUNTIME_PAUSED');},this.profile!);policy={assertWritable:()=>get().assertWritable(),automatic:(...args)=>{try{return get().automatic(...args);}catch{return false;}},setAutomatic:(...args)=>get().setAutomatic(...args),verifiedFeed:value=>get().verifiedFeed(value),canStageAutomatic:value=>{try{return get().canStageAutomatic(value);}catch{return false;}},authorizePending:(...args)=>get().authorizePending(...args),allowPending:(...args)=>{try{return get().allowPending(...args);}catch{return false;}},forgetPending:(...args)=>get().forgetPending(...args)};this.policies.set(selection.entry.epoch,policy);}return policy;
  }
  subscribe(listener:()=>void):()=>void{this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  private readonly changed=()=>{this.files.delete(this.file);for(const listener of this.listeners){try{listener();}catch{/* Invalid role data stays unavailable; never run a fallback. */}}};
  private async state(){
    this.assertContext();await this.validateHost();this.assertContext();const selected=this.selection(),store=this.store(),root=selected?.root??join(this.home,'dsh-zhen'),paths=selected?['s.db','l.json',join('g','state.json'),'policy.json']:['skills.sqlite','local-skills.json',join('github-skills','state.json')];
    const versions=()=>paths.map(name=>{try{const stat=lstatSync(join(root,name),{bigint:true});if(stat.isSymbolicLink()||!stat.isFile())fail();return stamp(stat);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return 'absent';throw error;}}).join('\0'),before=versions(),owners=this.owners(),rows=[...owners.market.recoveryInvocationRows(),...owners.local.recoveryInvocationRows(),...owners.github.recoveryInvocationRows()],market=owners.market.recoveryManagementSummary(),github=owners.github.recoveryManagementSummary();
    let repairRequired=false;if(selected?.granted){try{new FileManagedSkillRuntimePolicy(selected.root,selected.entry.epoch,()=>{},this.profile!);}catch{repairRequired=true;}}
    if(rows.length>40032||new Set(rows.map(row=>row.key)).size!==rows.length||before!==versions()||this.store().hash!==store.hash)fail();this.assertContext();return {selected,store,owners,rows,repairRequired,pending:market.pending+github.pending,originalAutomatic:selected?.role.originalAutomatic??(market.automatic||github.automatic||owners.feed.snapshot().automatic),snapshot:hash(this.original+'\0'+this.profile+'\0'+store.hash+'\0'+before+'\0'+backupJsonString(rows))};
  }
  async view(page=0):Promise<RestoredManagedRuntimeView>{
    try{
    if(!this.restored||!this.profile)return restoredManagedRuntimeView.parse({available:false,reason:this.restored?'profile-unavailable':'not-restored',profile:this.profile??null,snapshot:null,active:false,paused:false,repairRequired:false,total:0,page:0,nextPage:null,pending:0,originalAutomatic:false,items:[],applicationActivated:false});
    if(!Number.isInteger(page)||page<0||page>2002)fail();const state=await this.state(),offset=page*20;if(page&&offset>=state.rows.length)fail();return restoredManagedRuntimeView.parse({available:true,reason:'ready',profile:this.profile,snapshot:state.snapshot,active:!!state.selected?.granted,paused:state.selected?.granted?!state.selected.entry.enabled:false,repairRequired:state.repairRequired,total:state.rows.length,page,nextPage:offset+20<state.rows.length?page+1:null,pending:state.pending,originalAutomatic:state.originalAutomatic,items:state.rows.slice(offset,offset+20),applicationActivated:false});
    }catch(error){if(error instanceof BackupError)throw error;return fail();}
  }
  private save(document:Store,expected:string):void{
    this.assertContext();const path=join(this.home,'dsh-zhen','.mr-'+randomUUID().slice(0,12)),fd=openSync(path,'wx',0o600),identity=node(fstatSync(fd,{bigint:true}));
    try{try{writeFileSync(fd,backupJsonString(storeSchema.parse(document))+'\n');fsyncSync(fd);}finally{closeSync(fd);}this.assertContext();if(this.store().hash!==expected)fail();const stat=lstatSync(path,{bigint:true});if(stat.isSymbolicLink()||!stat.isFile()||node(stat)!==identity)fail();renameSync(path,this.file);this.files.delete(this.file);}
    finally{this.boundary();if(existsSync(path)){const stat=lstatSync(path,{bigint:true});if(!stat.isSymbolicLink()&&stat.isFile()&&node(stat)===identity)unlinkSync(path);}}
  }
  async change(input:RestoredManagedRuntimeRequest):Promise<RestoredManagedRuntimeView>{
    const request=restoredManagedRuntimeRequest.parse(input),key=process.platform==='win32'?this.home.toLowerCase():this.home,previous=queues.get(key)??Promise.resolve();let release!:()=>void;const done=new Promise<void>(resolve=>{release=resolve;}),tail=previous.catch(()=>{}).then(()=>done);queues.set(key,tail);await previous.catch(()=>{});let prepared:ManagedRuntimeCopy|undefined,published=false;
    try{
      const before=await this.state();if(request.snapshot!==before.snapshot)fail();let entry=before.selected?.entry;
      if(request.action==='enable'&&!entry){prepared=await prepareManagedRuntimeCopy(this.home,this.profile!,this.original!,before.owners,async()=>{const state=await this.state();if(state.snapshot!==before.snapshot||Object.keys(state.owners).some(kind=>state.owners[kind as keyof ManagedRuntimeOwners]!==before.owners[kind as keyof ManagedRuntimeOwners]))fail();});entry={profile:this.profile!,epoch:prepared.role.epoch,leaf:prepared.role.leaf,origin:prepared.role.origin,rootIdentity:prepared.role.rootIdentity,seal:prepared.seal,enabled:true};}
      else if(!entry||request.action==='pause'&&!before.selected?.granted)fail();
      const current=await this.state();if(current.snapshot!==before.snapshot)fail();
      if(request.action==='enable'&&before.selected&&(!before.selected.granted||!before.selected.entry.enabled||before.repairRequired))FileManagedSkillRuntimePolicy.reset(before.selected.root,entry.epoch,()=>{this.assertContext();const selected=this.selection();if(!selected||selected.entry.epoch!==entry!.epoch||selected.granted!==before.selected!.granted||selected.entry.enabled!==before.selected!.entry.enabled)fail();},this.profile!);
      const document=structuredClone(before.store.value??{schema:'dsh-zhen-managed-runtime-v1' as const,revision:randomUUID(),roles:[]});document.revision=randomUUID();document.roles=document.roles.filter(row=>row.profile!==this.profile);document.roles.push({...entry,enabled:request.action==='enable'});this.save(document,before.store.hash);published=true;
      this.changed();return await this.view();
    }catch(error){if(error instanceof BackupError)throw error;return fail();}finally{try{if(prepared&&!published){this.boundary();await discardManagedRuntimeCopy(this.home,prepared);}}finally{release();if(queues.get(key)===tail)queues.delete(key);}}
  }
  close():void{if(this.closed)return;this.closed=true;if(this.restored&&this.profile)unwatchFile(this.file,this.changed);for(const path of this.watchedData)unwatchFile(path,this.changed);this.watchedData.clear();this.listeners.clear();this.policies.clear();this.files.clear();}
}
