import {createHash,randomUUID} from 'node:crypto';
import {lstatSync,realpathSync,openSync,readSync,fstatSync,closeSync} from 'node:fs';
import {lstat,open,rename,unlink} from 'node:fs/promises';
import type {BigIntStats} from 'node:fs';
import {join,dirname} from 'node:path';
import {z} from 'zod';
import {BackupError} from './backup-archive.ts';
import {backupJsonString,parseBackupJson} from './backup-data.ts';
import {readRestoredSkillProjects,skillPathKey,assertRestoredSkillPin,assertRestoredSkillDirectory,assertRestoredSkillBoundary} from './restored-skill-projects.ts';
import {restoredSkillConsentRequestSchema,restoredSkillConsentViewSchema} from './restored-skill-consent-schema.ts';
import type {RestoredSkillConsentRequest,RestoredSkillConsentView} from './restored-skill-consent-schema.ts';

export const RESTORED_SKILL_CONSENT_FILE='skill-project-consent.json';
const LIMIT=128*1024,sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const stamp=(value:BigIntStats)=>[value.dev,value.ino,value.size,value.mtimeNs,value.ctimeNs].join(':');
const schema=z.object({schema:z.literal('dsh-zhen-restored-skill-consent-v1'),profiles:z.array(z.object({profile:z.string().min(1).max(255),source:z.string().regex(/^[a-f0-9]{64}$/),approved:z.boolean(),revision:z.uuid(),reviewedAt:z.iso.datetime()}).strict()).max(128)}).strict().refine(value=>new Set(value.profiles.map(row=>row.profile)).size===value.profiles.length);
type Consent=z.infer<typeof schema>;
type Source=NonNullable<ReturnType<typeof readRestoredSkillProjects>>;
function fail(code='BACKUP_SKILL_CONSENT_INVALID'):never{throw new BackupError(code);}
function parents(home:string):string{
  return [home,join(home,'dsh-zhen')].map(path=>{const stat=lstatSync(path,{bigint:true});if(stat.isSymbolicLink()||!stat.isDirectory()||skillPathKey(realpathSync.native(path))!==skillPathKey(path))fail();return stat.dev+':'+stat.ino;}).join(':');
}
/** Only owned, bounded consent metadata. No skill bodies or target files. */
export function readRestoredSkillConsent(home:string):{document:Consent;signature:string}|null{
  try{
    const boundary=parents(home),file=join(home,'dsh-zhen',RESTORED_SKILL_CONSENT_FILE);let before:BigIntStats;
    try{before=lstatSync(file,{bigint:true});}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
    if(before.isSymbolicLink()||!before.isFile()||before.size>BigInt(LIMIT))fail();const fd=openSync(file,'r');let bytes:Buffer;
    try{if(stamp(fstatSync(fd,{bigint:true}))!==stamp(before))fail();bytes=Buffer.alloc(Number(before.size));let at=0;while(at<bytes.length){const length=readSync(fd,bytes,at,bytes.length-at,at);if(!length)fail();at+=length;}if(stamp(fstatSync(fd,{bigint:true}))!==stamp(before)||stamp(lstatSync(file,{bigint:true}))!==stamp(before)||parents(home)!==boundary)fail();}finally{closeSync(fd);}
    return {document:schema.parse(parseBackupJson(bytes)),signature:sha(bytes)};
  }catch{fail();}
}

/** Approval is scoped to ONE profile and the exact immutable source document.
 * Source edits invalidate it. A malformed consent file denies every profile.
 * The old pending=false form remains readable for existing library callers. */
export function effectiveRestoredSkillSnapshot(home:string,profile:string,source:Source):Source{
  try{
    const consent=readRestoredSkillConsent(home);if(!consent)return source;
    const row=consent.document.profiles.find(row=>row.profile===profile),approved=!!row?.approved&&row.source===source.signature;
    return {...source,signature:sha(source.signature+'\0'+consent.signature),document:{...source.document,pending:!approved}};
  }catch{return {...source,signature:sha(source.signature+'\0invalid-consent'),document:{...source.document,pending:true}};}
}

// Normal startup owns one Host for a home. Serialize same-process owners as
// well; a queued request still must match its original snapshot after waiting.
const mutations=new Map<string,Promise<void>>();
export class RestoredSkillConsent {
  constructor(private readonly home:string,private readonly profile:string|undefined,private readonly prepareHost:()=>Promise<()=>Promise<void>>){}
  private state(){const source=readRestoredSkillProjects(this.home),consent=source?readRestoredSkillConsent(this.home):null;return {source,consent,snapshot:source?sha(source.signature+'\0'+(consent?.signature??'absent')+'\0'+this.profile):null};}
  async view(page=0):Promise<RestoredSkillConsentView>{
    try{
      if(!Number.isInteger(page)||page<0||page>102)fail();const {source,snapshot}=this.state(),rows=source?.document.providers.filter(row=>row.profile===this.profile)??[];
      if(!source||this.profile===undefined)return restoredSkillConsentViewSchema.parse({available:false,profile:this.profile??null,snapshot:null,approved:false,providers:[],projects:[],totalProviders:0,enabledProviders:0,totalProjects:0,page:0,nextPage:null,reason:source?'profile-unavailable':'not-restored',managedSkillsPaused:true,applicationActivated:false});
      const assertCurrent=await this.prepareHost();await assertCurrent();if(this.state().snapshot!==snapshot)fail('BACKUP_SKILL_CONSENT_CHANGED');const start=page*20,projects=source.document.projects,total=Math.max(rows.length,projects.length);if(page>0&&start>=total)fail();
      return restoredSkillConsentViewSchema.parse({available:true,profile:this.profile,snapshot,approved:!effectiveRestoredSkillSnapshot(this.home,this.profile,source).document.pending,providers:rows.slice(start,start+20).map(row=>({id:row.id,name:String(row.config.providerName??'filesystem'),enabled:row.enabled,roots:row.pins.map(pin=>pin.path)})),projects:projects.slice(start,start+20).map(row=>({originalDirectory:row.originalDirectory,directory:row.directory})),totalProviders:rows.length,enabledProviders:rows.filter(row=>row.enabled).length,totalProjects:projects.length,page,nextPage:start+20<total?page+1:null,reason:'ready',managedSkillsPaused:true,applicationActivated:false});
    }catch(error){if(error instanceof BackupError)throw error;return fail();}
  }
  async change(input:RestoredSkillConsentRequest):Promise<RestoredSkillConsentView>{
    const request=restoredSkillConsentRequestSchema.parse(input),key=skillPathKey(this.home),previous=mutations.get(key)??Promise.resolve();let release!:()=>void;const done=new Promise<void>(resolve=>{release=resolve;}),tail=previous.catch(()=>{}).then(()=>done);mutations.set(key,tail);await previous.catch(()=>{});
    let temporary:string|undefined,temporaryIdentity:string|undefined;
    try{
      const {source,consent,snapshot}=this.state();if(!source||!this.profile||snapshot!==request.snapshot)fail('BACKUP_SKILL_CONSENT_CHANGED');
      const assertCurrent=await this.prepareHost();await assertCurrent();
      if(request.action==='approve'){
        for(const row of source.document.providers.filter(row=>row.profile===this.profile&&row.enabled))for(const pin of row.pins)await assertRestoredSkillPin(source.document.root,pin);
        for(const row of source.document.projects){await assertRestoredSkillDirectory(row.directory,row.identity);await assertRestoredSkillDirectory(row.root,row.rootIdentity);await assertRestoredSkillBoundary(row.root,row.boundaryIdentity);for(const pin of row.pins)await assertRestoredSkillPin(source.document.root,pin);}
      }
      const document=schema.parse({schema:'dsh-zhen-restored-skill-consent-v1',profiles:[...(consent?.document.profiles??[]).filter(row=>row.profile!==this.profile),{profile:this.profile,source:source.signature,approved:request.action==='approve',revision:randomUUID(),reviewedAt:new Date().toISOString()}]});
      const boundary=parents(this.home),file=join(this.home,'dsh-zhen',RESTORED_SKILL_CONSENT_FILE),bytes=Buffer.from(backupJsonString(document)+'\n');if(bytes.length>LIMIT)fail();temporary=join(dirname(file),'.sc-'+randomUUID().replaceAll('-','').slice(0,16)+'.json');const handle=await open(temporary,'wx',0o600);
      try{const stat=await handle.stat({bigint:true});temporaryIdentity=stat.dev+':'+stat.ino;await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
      await assertCurrent();if(this.state().snapshot!==snapshot||parents(this.home)!==boundary)fail('BACKUP_SKILL_CONSENT_CHANGED');const temporaryStat=await lstat(temporary,{bigint:true});if(temporaryStat.isSymbolicLink()||!temporaryStat.isFile()||temporaryStat.dev+':'+temporaryStat.ino!==temporaryIdentity)fail();
      await rename(temporary,file);temporary=undefined;
      // Post-write source drift cannot keep a usable grant: runtime readers
      // bind approval to the old source hash and recheck every resource pin.
      return await this.view();
    }catch(error){if(error instanceof BackupError)throw error;return fail();}
    finally{
      try{if(temporary){parents(this.home);const stat=await lstat(temporary,{bigint:true});if(!stat.isSymbolicLink()&&stat.isFile()&&stat.dev+':'+stat.ino===temporaryIdentity)await unlink(temporary);}}finally{release();if(mutations.get(key)===tail)mutations.delete(key);}
    }
  }
}
