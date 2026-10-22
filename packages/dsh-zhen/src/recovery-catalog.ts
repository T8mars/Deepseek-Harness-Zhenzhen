import {DatabaseSync} from 'node:sqlite';
import {closeSync,copyFileSync,constants,existsSync,linkSync,lstatSync,mkdirSync,openSync,realpathSync,unlinkSync} from 'node:fs';
import {basename,dirname,isAbsolute,join,parse,relative,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {lstat,open,realpath} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {BackupError} from './backup-archive.ts';
import {recoverySummarySchema} from './recovery-schema.ts';
import type {RecoveryBaseline} from './recovery-candidate.ts';

const MAX_RECORD=128*1024;
const number=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const baselineSchema=z.object({root:z.string().min(1).max(4096).refine(path=>isAbsolute(path)&&/^dsh-zhen-recovery-[A-Za-z0-9]+$/.test(basename(path))),createdAt:z.iso.datetime(),sha256:z.string().regex(/^[a-f0-9]{64}$/),files:number,bytes:number,links:number,components:z.array(recoverySummarySchema).min(1).max(6).refine(rows=>new Set(rows.map(row=>row.kind)).size===rows.length)}).strict();
const recordSchema=z.object({id:z.uuid(),baseline:baselineSchema}).strict();
export interface RecoveryCatalogRecord {id:string;baseline:RecoveryBaseline;}
export interface RecoveryCursor {createdAt:string;id:string;}
const cursorSchema=z.object({createdAt:z.iso.datetime(),id:z.uuid()}).strict();
export function recoveryCursor(value:string):RecoveryCursor|null{if(value==='')return null;try{if(value.length>256||!/^[A-Za-z0-9_-]+$/.test(value))throw Error();return cursorSchema.parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8')));}catch{throw new BackupError('BACKUP_CANDIDATE_CURSOR_INVALID');}}
export function encodeRecoveryCursor(record:RecoveryCatalogRecord):string{return Buffer.from(JSON.stringify({createdAt:record.baseline.createdAt,id:record.id})).toString('base64url');}
function validate(input:unknown):RecoveryCatalogRecord{const value=recordSchema.safeParse(input);if(!value.success||Buffer.byteLength(JSON.stringify(value.data))>MAX_RECORD)throw new BackupError('BACKUP_CANDIDATE_RECORD_INVALID');return value.data;}
function identity(file:string,directory=false):string{const value=lstatSync(file,{bigint:true});if(value.isSymbolicLink()||(directory?!value.isDirectory():!value.isFile()))throw new BackupError('BACKUP_CANDIDATE_CATALOG_CHANGED');return value.dev+':'+value.ino;}
const key=(value:string)=>process.platform==='win32'?value.toLowerCase():value;
function noLinks(file:string):void{const root=parse(file).root;let current=root;for(const part of relative(root,file).split(/[\\/]/).filter(Boolean)){current=join(current,part);try{if(lstatSync(current).isSymbolicLink())throw new BackupError('BACKUP_CANDIDATE_CATALOG_CHANGED');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}}}
function canonicalMissing(file:string):string{try{if(lstatSync(file).isSymbolicLink())throw new BackupError('BACKUP_CANDIDATE_CATALOG_CHANGED');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}let current=dirname(file);const tail=[basename(file)];while(!existsSync(current)){const parent=dirname(current);if(parent===current)throw new BackupError('BACKUP_CANDIDATE_CATALOG_FAILED');tail.unshift(basename(current));current=parent;}return join(realpathSync.native(current),...tail);}
/** Only the known composition receipt is inspected before any tree walk. An
 * edited catalog row cannot turn an arbitrary directory into a readable tree. */
export async function assertRecoveryReceipt(baseline:RecoveryBaseline):Promise<void>{
  let exists=false;
  try{
    const root=baseline.root,stat=await lstat(root);exists=true;if(stat.isSymbolicLink()||!stat.isDirectory()||key(await realpath(root))!==key(root)||!/^dsh-zhen-recovery-[A-Za-z0-9]+$/.test(basename(root)))throw new BackupError('BACKUP_CANDIDATE_CHANGED');
    const marker=join(root,'dsh-zhen-recovery.json'),before=await lstat(marker,{bigint:true});if(before.isSymbolicLink()||!before.isFile()||before.size>65536n||key(await realpath(marker))!==key(marker))throw new BackupError('BACKUP_CANDIDATE_CHANGED');
    const file=await open(marker,'r'),signature=(value:typeof before)=>[value.dev,value.ino,value.size,value.mtimeNs,value.ctimeNs].join(':');let data:Buffer;
    try{if(signature(await file.stat({bigint:true}))!==signature(before))throw new BackupError('BACKUP_CANDIDATE_CHANGED');data=Buffer.alloc(Number(before.size));let position=0;while(position<data.length){const size=(await file.read(data,position,data.length-position,position)).bytesRead;if(!size)throw new BackupError('BACKUP_CANDIDATE_CHANGED');position+=size;}if(signature(await file.stat({bigint:true}))!==signature(before)||signature(await lstat(marker,{bigint:true}))!==signature(before))throw new BackupError('BACKUP_CANDIDATE_CHANGED');}finally{await file.close();}
    const receipt=z.object({root:z.literal(root),components:z.array(z.string()).max(6),activated:z.literal(false),wholeApplicationRestore:z.literal(false),schema:z.literal('dsh-zhen-selected-backup-v1'),credentialStoresIncluded:z.literal(false),limitations:z.array(z.string().max(4096)).max(16),restored:z.array(z.object({kind:z.string(),root:z.string().max(4096),summary:recoverySummarySchema}).strict()).max(6)}).strict().safeParse(JSON.parse(data.toString('utf8')));
    if(!receipt.success||!isDeepStrictEqual(receipt.data.components,baseline.components.map(row=>row.kind))||!isDeepStrictEqual(receipt.data.restored.map(row=>row.summary),baseline.components)||receipt.data.restored.some(row=>{const part=relative(root,row.root);return !part||isAbsolute(part)||part==='..'||part.startsWith('../')||part.startsWith('..\\')||row.kind!==row.summary.kind;}))throw new BackupError('BACKUP_CANDIDATE_CHANGED');
  }catch(error){if(error instanceof BackupError)throw error;if((error as NodeJS.ErrnoException).code==='ENOENT')throw new BackupError(exists?'BACKUP_CANDIDATE_CHANGED':'BACKUP_CANDIDATE_UNAVAILABLE');if(error instanceof SyntaxError)throw new BackupError('BACKUP_CANDIDATE_CHANGED');throw new BackupError('BACKUP_CANDIDATE_UNAVAILABLE');}
}
function schema(db:DatabaseSync):void{
  if(db.prepare('PRAGMA user_version').get()?.user_version!==1)throw new BackupError('BACKUP_CANDIDATE_CATALOG_SCHEMA');
  const objects=db.prepare("SELECT type,name FROM sqlite_schema WHERE substr(name,1,7)!='sqlite_' LIMIT 3").all();if(objects.length!==1||objects[0].type!=='table'||objects[0].name!=='recovery_candidates')throw new BackupError('BACKUP_CANDIDATE_CATALOG_SCHEMA');
  const columns=db.prepare('PRAGMA table_xinfo(recovery_candidates)').all();if(columns.length!==3||columns.some((row,index)=>row.name!==['id','created_at','data'][index]||row.type!=='TEXT'||row.pk!==(index===0?1:0)||row.notnull!==1||row.dflt_value!==null||row.hidden!==0))throw new BackupError('BACKUP_CANDIDATE_CATALOG_SCHEMA');
}
/** Own schema only. Cold reads never create files; each bounded operation
 * closes its connection. SQLite transactions retain other Hosts' records. */
export class RecoveryCatalog {
  private readonly file:string;
  private readonly requested:string;
  private readonly initializationError?:BackupError;
  private origin?:{parent:string;file:string;};
  constructor(file:string){if(!isAbsolute(file))throw new BackupError('BACKUP_PATH_INVALID');this.requested=resolve(file);try{this.file=canonicalMissing(this.requested);}catch{this.file=this.requested;this.initializationError=new BackupError('BACKUP_CANDIDATE_CATALOG_CHANGED');}}
  private binding():void{if(this.initializationError)throw this.initializationError;if(key(canonicalMissing(this.requested))!==key(this.file))throw new BackupError('BACKUP_CANDIDATE_CATALOG_CHANGED');}
  private check():{parent:string;file:string;}{noLinks(this.file);const parent=dirname(this.file);if(key(realpathSync.native(parent))!==key(parent)||key(realpathSync.native(this.file))!==key(this.file))throw new BackupError('BACKUP_CANDIDATE_CATALOG_CHANGED');const current={parent:identity(parent,true),file:identity(this.file)};if(this.origin&&(current.parent!==this.origin.parent||current.file!==this.origin.file))throw new BackupError('BACKUP_CANDIDATE_CATALOG_CHANGED');return current;}
  private create():void{
    noLinks(this.file);mkdirSync(dirname(this.file),{recursive:true,mode:0o700});noLinks(this.file);if(existsSync(this.file))return;
    const parent=dirname(this.file),temporary=join(parent,'.dsh-recovery-index-'+randomUUID()+'.sqlite'),fd=openSync(temporary,'wx',0o600);closeSync(fd);let db:DatabaseSync|undefined;
    try{db=new DatabaseSync(temporary,{allowExtension:false,enableDoubleQuotedStringLiterals:false});db.exec('PRAGMA trusted_schema=OFF; BEGIN IMMEDIATE; CREATE TABLE recovery_candidates(id TEXT PRIMARY KEY NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL); PRAGMA user_version=1; COMMIT;');db.close();db=undefined;
      try{linkSync(temporary,this.file);}catch(error){const code=(error as NodeJS.ErrnoException).code;if(code!=='EEXIST'){if(!['ENOTSUP','EOPNOTSUPP','EXDEV','EPERM'].includes(code??''))throw error;try{copyFileSync(temporary,this.file,constants.COPYFILE_EXCL);}catch(copyError){if((copyError as NodeJS.ErrnoException).code!=='EEXIST')throw copyError;}}}
    }finally{db?.close();unlinkSync(temporary);}
  }
  private use<T>(write:boolean,missing:T,run:(db:DatabaseSync)=>T):T{
    let db:DatabaseSync|undefined;
    try{this.binding();noLinks(this.file);if(!existsSync(this.file)){if(this.origin)throw new BackupError('BACKUP_CANDIDATE_CATALOG_CHANGED');if(!write)return missing;this.create();}const before=this.check();db=new DatabaseSync(this.file,{readOnly:!write,allowExtension:false,enableDoubleQuotedStringLiterals:false});db.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=1000;');if(write)db.exec('PRAGMA synchronous=FULL;');schema(db);this.origin??=before;const value=run(db),after=this.check();this.binding();if(before.parent!==after.parent||before.file!==after.file)throw new BackupError('BACKUP_CANDIDATE_CATALOG_CHANGED');return value;}
    catch(error){if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_CANDIDATE_CATALOG_FAILED');}finally{db?.close();}
  }
  private decode(row:Record<string,unknown>):RecoveryCatalogRecord{if(typeof row.data!=='string'||row.data.length>MAX_RECORD)throw new BackupError('BACKUP_CANDIDATE_RECORD_INVALID');let value;try{value=JSON.parse(row.data);}catch{throw new BackupError('BACKUP_CANDIDATE_RECORD_INVALID');}const record=validate(value);if(record.id!==row.id||record.baseline.createdAt!==row.created_at)throw new BackupError('BACKUP_CANDIDATE_RECORD_INVALID');return record;}
  get(id:string):RecoveryCatalogRecord|null{return this.use(false,null,db=>{const row=db.prepare('SELECT id,created_at,CASE WHEN length(CAST(data AS BLOB))<=? THEN data ELSE NULL END AS data FROM recovery_candidates WHERE id=?').get(MAX_RECORD,id);return row?this.decode(row):null;});}
  page(cursor:RecoveryCursor|null):RecoveryCatalogRecord[]{return this.use(false,[],db=>{const rows=cursor?db.prepare('SELECT id,created_at,CASE WHEN length(CAST(data AS BLOB))<=? THEN data ELSE NULL END AS data FROM recovery_candidates WHERE created_at<? OR (created_at=? AND id<?) ORDER BY created_at DESC,id DESC LIMIT 21').all(MAX_RECORD,cursor.createdAt,cursor.createdAt,cursor.id):db.prepare('SELECT id,created_at,CASE WHEN length(CAST(data AS BLOB))<=? THEN data ELSE NULL END AS data FROM recovery_candidates ORDER BY created_at DESC,id DESC LIMIT 21').all(MAX_RECORD);return rows.map(row=>this.decode(row));});}
  put(input:RecoveryCatalogRecord):void{const record=validate(input),data=JSON.stringify(record);this.use(true,undefined,db=>{db.exec('BEGIN IMMEDIATE');try{const row=db.prepare('SELECT id,created_at,CASE WHEN length(CAST(data AS BLOB))<=? THEN data ELSE NULL END AS data FROM recovery_candidates WHERE id=?').get(MAX_RECORD,record.id);if(row){if(JSON.stringify(this.decode(row))!==data)throw new BackupError('BACKUP_CANDIDATE_ID_CONFLICT');}else db.prepare('INSERT INTO recovery_candidates(id,created_at,data) VALUES(?,?,?)').run(record.id,record.baseline.createdAt,data);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}});}
  forget(id:string):void{if(!this.get(id))return;this.use(true,undefined,db=>{db.prepare('DELETE FROM recovery_candidates WHERE id=?').run(id);});}
}
