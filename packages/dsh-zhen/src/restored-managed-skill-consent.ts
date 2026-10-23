import {createHash,randomUUID} from 'node:crypto';
import {lstatSync,realpathSync,openSync,fstatSync,readSync,closeSync,watchFile,unwatchFile} from 'node:fs';
import {lstat,open,rename,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import type {BigIntStats} from 'node:fs';
import {z} from 'zod';
import {BackupError} from './backup-archive.ts';
import {backupJsonString,parseBackupJson} from './backup-data.ts';
import {restoredManagedSkillRequest,restoredManagedSkillView} from './restored-managed-skill-schema.ts';
import type {RestoredManagedSkillRequest,RestoredManagedSkillView} from './restored-managed-skill-schema.ts';
import type {ManagedSkillInvocationGate,ManagedSkillInvocationRow,ManagedSkillKind} from './managed-skill-invocation.ts';

export const RESTORED_MANAGED_SKILL_CONSENT_FILE='managed-skill-consent.json';
interface SourceOwner{recoveryInvocationRows():ManagedSkillInvocationRow[];verifyRecoveryInvocation(key:string):Promise<void>;}
type Owners=Record<ManagedSkillKind,SourceOwner>;
const LIMIT=16*1024**2,sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex'),equal=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const stamp=(s:BigIntStats)=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
const schema=z.object({schema:z.literal('dsh-zhen-managed-skill-consent-v1'),revision:z.uuid(),grants:z.array(z.object({profile:z.string().min(1).max(255),key:z.string().regex(/^[a-f0-9]{64}$/),origin:z.string().regex(/^[a-f0-9]{64}$/),nonce:z.uuid(),reviewedAt:z.iso.datetime()}).strict()).max(65536)}).strict().refine(value=>new Set(value.grants.map(row=>row.profile+'\0'+row.key)).size===value.grants.length);
type Store={document:z.infer<typeof schema>;signature:string;version:string;index:Map<string,z.infer<typeof schema>['grants'][number]>};
const queues=new Map<string,Promise<void>>();
function fail(code='BACKUP_MANAGED_SKILL_REVIEW_INVALID'):never{throw new BackupError(code);}

/** Invocation only. All three owners remain in their original read-only mode;
 * archived pending versions and downloads are never activated by this class. */
export class RestoredManagedSkillConsent implements ManagedSkillInvocationGate {
  private readonly file:string;
  private readonly initialOrigin:string|undefined;
  private cached:Store|null=null;
  private knownAbsent=false;
  private closed=false;
  private readonly listeners=new Set<()=>void>();
  constructor(private readonly home:string,private readonly profile:string|undefined,private readonly enabled:boolean,private readonly owners:()=>Owners,private readonly validateHost:()=>Promise<void>,private readonly isCurrent:()=>boolean=()=>true){
    this.file=join(home,'dsh-zhen',RESTORED_MANAGED_SKILL_CONSENT_FILE);
    if(enabled){this.initialOrigin=this.origin();for(const path of[this.file,...this.sourceFiles()])watchFile(path,{interval:250,persistent:false},this.changed);}
  }
  private sourceFiles():string[]{return ['skills-recovery.json','skills.sqlite','local-skills.json',join('github-skills','state.json')].map(name=>join(this.home,'dsh-zhen',name));}
  private boundary():string{return [this.home,join(this.home,'dsh-zhen')].map(path=>{const stat=lstatSync(path,{bigint:true});if(stat.isSymbolicLink()||!stat.isDirectory()||!equal(realpathSync.native(path),path))fail();return stat.dev+':'+stat.ino;}).join(':');}
  private origin():string{
    const boundary=this.boundary(),files=this.sourceFiles().map(path=>{let parents='';for(let parent=dirname(path);!equal(parent,join(this.home,'dsh-zhen'));parent=dirname(parent)){const node=lstatSync(parent,{bigint:true});if(node.isSymbolicLink()||!node.isDirectory()||!equal(realpathSync.native(parent),parent))fail();parents+=node.dev+':'+node.ino+';';}try{const stat=lstatSync(path,{bigint:true});if(stat.isSymbolicLink()||!stat.isFile())fail();return parents+stamp(stat);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return parents+'absent';throw error;}});if(files[0]==='absent')fail('BACKUP_MANAGED_SKILL_SOURCE_CHANGED');return sha(boundary+'\0'+files.join('\0'));
  }
  private assertOrigin():void{if(this.closed||!this.enabled||!this.isCurrent()||this.origin()!==this.initialOrigin)fail('BACKUP_MANAGED_SKILL_SOURCE_CHANGED');}
  private store():Store|null{
    this.boundary();let before:BigIntStats;try{before=lstatSync(this.file,{bigint:true});this.knownAbsent=false;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){this.cached=null;this.knownAbsent=true;return null;}throw error;}
    if(before.isSymbolicLink()||!before.isFile()||before.size>BigInt(LIMIT))fail();if(this.cached?.version===stamp(before))return this.cached;
    const fd=openSync(this.file,'r');let bytes:Buffer;try{if(stamp(fstatSync(fd,{bigint:true}))!==stamp(before))fail();bytes=Buffer.alloc(Number(before.size));let at=0;while(at<bytes.length){const length=readSync(fd,bytes,at,bytes.length-at,at);if(!length)fail();at+=length;}if(stamp(fstatSync(fd,{bigint:true}))!==stamp(before)||stamp(lstatSync(this.file,{bigint:true}))!==stamp(before))fail();}finally{closeSync(fd);}
    const document=schema.parse(parseBackupJson(bytes));this.cached={document,signature:sha(bytes),version:stamp(before),index:new Map(document.grants.map(row=>[row.profile+'\0'+row.key,row]))};return this.cached;
  }
  token(key:string):string|undefined{try{if(this.closed||!this.profile||!this.enabled||!this.isCurrent()||this.knownAbsent||this.cached&&!this.cached.index.has(this.profile+'\0'+key))return;this.assertOrigin();const store=this.store(),grant=store?.index.get(this.profile+'\0'+key);this.assertOrigin();if(grant&&grant.origin===this.initialOrigin)return store!.document.revision+':'+grant.nonce;}catch{return;}}
  subscribe(listener:()=>void):()=>void{this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  private readonly changed=()=>{this.cached=null;this.knownAbsent=false;for(const listener of this.listeners)listener();};
  private async state(){this.assertOrigin();await this.validateHost();this.assertOrigin();const owners=this.owners(),rows=Object.values(owners).flatMap(owner=>owner.recoveryInvocationRows());if(rows.length>40032||new Set(rows.map(row=>row.key)).size!==rows.length)fail('BACKUP_MANAGED_SKILL_LIMIT');const store=this.store();this.assertOrigin();return {owners,rows,store,snapshot:sha(this.initialOrigin+'\0'+this.profile+'\0'+backupJsonString(rows)+'\0'+(store?.signature??'absent'))};}
  async view(page=0):Promise<RestoredManagedSkillView>{
    try{if(!this.enabled||!this.profile)return restoredManagedSkillView.parse({available:false,reason:this.enabled?'profile-unavailable':'not-restored',profile:this.profile??null,snapshot:null,items:[],total:0,page:0,nextPage:null,updatesPaused:true,applicationActivated:false});if(!Number.isInteger(page)||page<0||page>2002)fail();const {rows,snapshot}=await this.state(),offset=page*20;if(page&&offset>=rows.length)fail();return restoredManagedSkillView.parse({available:true,reason:'ready',profile:this.profile,snapshot,items:rows.slice(offset,offset+20).map(row=>({...row,approved:!!this.token(row.key)})),total:rows.length,page,nextPage:offset+20<rows.length?page+1:null,updatesPaused:true,applicationActivated:false});}catch(error){if(error instanceof BackupError)throw error;return fail();}
  }
  async change(input:RestoredManagedSkillRequest):Promise<RestoredManagedSkillView>{
    const request=restoredManagedSkillRequest.parse(input),queueKey=process.platform==='win32'?this.home.toLowerCase():this.home,previous=queues.get(queueKey)??Promise.resolve();let release!:()=>void;const done=new Promise<void>(resolve=>{release=resolve;}),tail=previous.catch(()=>{}).then(()=>done);queues.set(queueKey,tail);await previous.catch(()=>{});let temporary:string|undefined,node:string|undefined;
    try{
      if(!this.profile)fail('BACKUP_MANAGED_SKILL_PROFILE_REQUIRED');const before=await this.state();if(before.snapshot!==request.snapshot)fail('BACKUP_MANAGED_SKILL_SOURCE_CHANGED');const row=before.rows.find(row=>row.key===request.key);if(!row||request.action==='approve'&&!row.eligible)fail('BACKUP_MANAGED_SKILL_SOURCE_CHANGED');if(request.action==='approve')await before.owners[row.kind].verifyRecoveryInvocation(row.key);
      const grants=(before.store?.document.grants??[]).filter(row=>row.profile!==this.profile||row.key!==request.key);if(request.action==='approve')grants.push({profile:this.profile,key:request.key,origin:this.initialOrigin!,nonce:randomUUID(),reviewedAt:new Date().toISOString()});const document=schema.parse({schema:'dsh-zhen-managed-skill-consent-v1',revision:randomUUID(),grants}),bytes=Buffer.from(backupJsonString(document)+'\n');if(bytes.length>LIMIT)fail('BACKUP_MANAGED_SKILL_LIMIT');
      temporary=join(this.home,'dsh-zhen','.mc-'+randomUUID().replaceAll('-','').slice(0,16)+'.json');const handle=await open(temporary,'wx',0o600);try{const stat=await handle.stat({bigint:true});node=stat.dev+':'+stat.ino;await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
      const after=await this.state();if(after.snapshot!==before.snapshot||Object.keys(after.owners).some(kind=>after.owners[kind as ManagedSkillKind]!==before.owners[kind as ManagedSkillKind]))fail('BACKUP_MANAGED_SKILL_SOURCE_CHANGED');const stat=await lstat(temporary,{bigint:true});if(stat.isSymbolicLink()||!stat.isFile()||stat.dev+':'+stat.ino!==node)fail();await rename(temporary,this.file);temporary=undefined;this.changed();return await this.view(Math.floor(before.rows.indexOf(row)/20));
    }catch(error){if(error instanceof BackupError)throw error;return fail();}
    finally{try{if(temporary){this.boundary();try{const stat=await lstat(temporary,{bigint:true});if(!stat.isSymbolicLink()&&stat.isFile()&&stat.dev+':'+stat.ino===node)await unlink(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}}finally{release();if(queues.get(queueKey)===tail)queues.delete(queueKey);}}
  }
  close():void{if(this.closed)return;this.closed=true;if(this.enabled)for(const path of[this.file,...this.sourceFiles()])unwatchFile(path,this.changed);this.listeners.clear();this.cached=null;}
}
