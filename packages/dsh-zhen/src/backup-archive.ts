import {createCipheriv,createDecipheriv,createHash,randomBytes,scrypt} from 'node:crypto';
import {constants} from 'node:fs';
import {copyFile,link,lstat,mkdtemp,open,realpath,rmdir,unlink} from 'node:fs/promises';
import type {FileHandle} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,relative} from 'node:path';
import {tmpdir} from 'node:os';

const MAGIC=Buffer.from('DSHZBKP1'),HEADER_BYTES=36,TAG_BYTES=16,CHUNK=64*1024;
export class BackupError extends Error {
  constructor(readonly code:string){super(code);this.name='BackupError';}
}
export interface BackupLimits {archiveBytes:number;recordBytes:number;metadataBytes:number;records:number;}
export const DEFAULT_BACKUP_LIMITS:Readonly<BackupLimits>=Object.freeze({archiveBytes:4*1024**3,recordBytes:1024**3,metadataBytes:64*1024,records:100_000});
export interface BackupOptions {signal?:AbortSignal;limits?:Partial<BackupLimits>;}
export interface BackupRecord {metadata:Record<string,unknown>;size:number;data:AsyncIterable<Uint8Array>;}
export interface BackupReceipt {schema:'dsh-zhen-encrypted-backup-v1';records:number;bytes:number;sha256:string;}
function limitsFor(options:BackupOptions):BackupLimits {
  const result={...DEFAULT_BACKUP_LIMITS,...options.limits};
  for(const value of Object.values(result))if(!Number.isSafeInteger(value)||value<1)throw new BackupError('BACKUP_LIMIT_INVALID');
  if(result.metadataBytes>1024*1024||result.archiveBytes<HEADER_BYTES+TAG_BYTES+4)throw new BackupError('BACKUP_LIMIT_INVALID');
  return result;
}
function check(signal?:AbortSignal){signal?.throwIfAborted();}
function plain(value:unknown,depth=0):void {
  if(depth>32)throw new BackupError('BACKUP_METADATA_INVALID');
  if(value===null||typeof value==='boolean'||typeof value==='string')return;
  if(typeof value==='number'&&Number.isFinite(value)&&!Object.is(value,-0))return;
  if(!value||typeof value!=='object'||(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new BackupError('BACKUP_METADATA_INVALID');
  if(Array.isArray(value)&&(Object.keys(value).length!==value.length||Object.keys(value).some((key,index)=>key!==String(index))))throw new BackupError('BACKUP_METADATA_INVALID');
  for(const[key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(value))){
    if(Array.isArray(value)&&key==='length')continue;
    if(['__proto__','prototype','constructor'].includes(key)||!('value'in descriptor)||!descriptor.enumerable)throw new BackupError('BACKUP_METADATA_INVALID');
    plain(descriptor.value,depth+1);
  }
  if(Object.getOwnPropertySymbols(value).length)throw new BackupError('BACKUP_METADATA_INVALID');
}
function metadataBytes(metadata:Record<string,unknown>,limit:number):Buffer {
  if(!metadata||Array.isArray(metadata)||typeof metadata!=='object')throw new BackupError('BACKUP_METADATA_INVALID');
  plain(metadata);const bytes=Buffer.from(JSON.stringify(metadata));
  if(!bytes.length||bytes.length>limit)throw new BackupError('BACKUP_METADATA_LIMIT');
  return bytes;
}
async function keyFor(password:string,salt:Uint8Array):Promise<Buffer>{
  if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>1024)throw new BackupError('BACKUP_PASSWORD_INVALID');
  const bytes=Buffer.from(password);
  try{return await new Promise((resolve,reject)=>scrypt(bytes,salt,32,{N:16384,r:8,p:1,maxmem:64*1024**2},(error,key)=>error?reject(new BackupError('BACKUP_KEY_FAILED')):resolve(key)));}
  finally{bytes.fill(0);}
}
async function writeAll(file:FileHandle,bytes:Uint8Array){
  let offset=0;
  while(offset<bytes.length){const written=(await file.write(bytes,offset,bytes.length-offset,null)).bytesWritten;if(!written)throw new BackupError('BACKUP_WRITE_FAILED');offset+=written;}
}
async function exact(file:FileHandle,length:number,position:number):Promise<Buffer>{
  const bytes=Buffer.alloc(length);let offset=0;
  while(offset<length){const read=(await file.read(bytes,offset,length-offset,position+offset)).bytesRead;if(!read)throw new BackupError('BACKUP_TRUNCATED');offset+=read;}
  return bytes;
}
async function* decrypt(file:FileHandle,key:Buffer,header:Buffer,size:number,signal?:AbortSignal):AsyncGenerator<Buffer>{
  const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(24,36));
  decipher.setAAD(header);decipher.setAuthTag(await exact(file,TAG_BYTES,size-TAG_BYTES));
  let position=HEADER_BYTES;
  while(position<size-TAG_BYTES){
    check(signal);const bytes=await exact(file,Math.min(CHUNK,size-TAG_BYTES-position),position);position+=bytes.length;
    const output=decipher.update(bytes);if(output.length)yield output;
  }
  check(signal);
  try{const last=decipher.final();if(last.length)yield last;}
  catch{throw new BackupError('BACKUP_AUTHENTICATION_FAILED');}
}

/** Encrypt directly to an exclusive sibling file. No plaintext backup is written. */
export async function writeBackupArchive(destination:string,password:string,records:AsyncIterable<BackupRecord>,options:BackupOptions={}):Promise<BackupReceipt>{
  const limits=limitsFor(options);check(options.signal);
  if(!isAbsolute(destination)||!basename(destination)||['.','..'].includes(basename(destination)))throw new BackupError('BACKUP_PATH_INVALID');
  const parent=await realpath(dirname(destination)),target=join(parent,basename(destination));
  const temporary=join(parent,'.dsh-zhen-backup-'+randomBytes(16).toString('hex')+'.tmp');
  const header=Buffer.concat([MAGIC,randomBytes(16),randomBytes(12)]),key=await keyFor(password,header.subarray(8,24));
  let file:FileHandle|undefined,created=false,bytes=0,count=0;
  const hash=createHash('sha256');
  try{
    file=await open(temporary,'wx',0o600);created=true;
    const output=async(data:Uint8Array)=>{check(options.signal);if(bytes+data.length>limits.archiveBytes)throw new BackupError('BACKUP_ARCHIVE_LIMIT');await writeAll(file!,data);bytes+=data.length;hash.update(data);};
    const cipher=createCipheriv('aes-256-gcm',key,header.subarray(24,36));cipher.setAAD(header);
    const encrypt=async(data:Uint8Array)=>{for(let i=0;i<data.length;i+=CHUNK)await output(cipher.update(data.subarray(i,i+CHUNK)));};
    await output(header);
    for await(const record of records){
      check(options.signal);
      if(++count>limits.records)throw new BackupError('BACKUP_RECORD_LIMIT');
      if(!Number.isSafeInteger(record.size)||record.size<0||record.size>limits.recordBytes)throw new BackupError('BACKUP_RECORD_SIZE_INVALID');
      const metadata=metadataBytes(record.metadata,limits.metadataBytes),prefix=Buffer.alloc(12);prefix.writeUInt32BE(metadata.length);prefix.writeBigUInt64BE(BigInt(record.size),4);
      await encrypt(prefix);await encrypt(metadata);let remaining=record.size;
      for await(const chunk of record.data){
        check(options.signal);if(!(chunk instanceof Uint8Array)||chunk.length>remaining)throw new BackupError('BACKUP_RECORD_SIZE_MISMATCH');
        remaining-=chunk.length;await encrypt(chunk);
      }
      if(remaining)throw new BackupError('BACKUP_RECORD_SIZE_MISMATCH');
    }
    await encrypt(Buffer.alloc(4));await output(cipher.final());await output(cipher.getAuthTag());
    await file.sync();await file.close();file=undefined;check(options.signal);
    // Both operations refuse an existing destination. Never rename over a file.
    try{await link(temporary,target);}
    catch(error){
      const code=(error as NodeJS.ErrnoException).code;
      if(!['ENOTSUP','EOPNOTSUPP','EXDEV','EPERM'].includes(code??''))throw error;
      await copyFile(temporary,target,constants.COPYFILE_EXCL);
    }
    return {schema:'dsh-zhen-encrypted-backup-v1',records:count,bytes,sha256:hash.digest('hex')};
  }finally{
    key.fill(0);try{await file?.close();}finally{if(created)await unlink(temporary);}
  }
}

class PlainReader {
  private current:Buffer=Buffer.alloc(0);private offset=0;private closed=false;
  constructor(private readonly input:AsyncGenerator<Buffer>){}
  private async available():Promise<boolean>{
    if(this.closed)throw new BackupError('BACKUP_READER_CLOSED');
    while(this.offset===this.current.length){const next=await this.input.next();if(next.done)return false;this.current=next.value;this.offset=0;}
    return true;
  }
  async take(length:number):Promise<Buffer>{
    const bytes=Buffer.alloc(length);let offset=0;
    while(offset<length){if(!await this.available())throw new BackupError('BACKUP_TRUNCATED');const n=Math.min(length-offset,this.current.length-this.offset);this.current.copy(bytes,offset,this.offset,this.offset+n);offset+=n;this.offset+=n;}
    return bytes;
  }
  async *payload(length:number):AsyncGenerator<Uint8Array>{
    let remaining=length;
    while(remaining){if(!await this.available())throw new BackupError('BACKUP_TRUNCATED');const n=Math.min(remaining,this.current.length-this.offset);const bytes=this.current.subarray(this.offset,this.offset+n);this.offset+=n;remaining-=n;yield bytes;}
  }
  async end(){if(await this.available())throw new BackupError('BACKUP_TRAILING_DATA');}
  async close(){this.closed=true;this.current=Buffer.alloc(0);await this.input.return(undefined);}
}

/** An owned encrypted snapshot, authenticated in full before records are exposed. */
export interface OpenBackupArchive {records():AsyncGenerator<BackupRecord>;close():Promise<void>;}
export async function openBackupArchive(source:string,password:string,options:BackupOptions={}):Promise<OpenBackupArchive>{
  const limits=limitsFor(options);check(options.signal);
  if(!isAbsolute(source))throw new BackupError('BACKUP_PATH_INVALID');
  const stat=await lstat(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limits.archiveBytes||stat.size<HEADER_BYTES+TAG_BYTES+4)throw new BackupError('BACKUP_ARCHIVE_INVALID');
  const base=await realpath(tmpdir()),directory=await mkdtemp(join(base,'dsh-zhen-sealed-backup-')),owned=join(directory,'archive.encrypted');
  let file:FileHandle|undefined,key:Buffer|undefined,closed=false,started=false,active:AsyncGenerator<BackupRecord>|undefined;
  const cleanup=async()=>{
    await file?.close();file=undefined;key?.fill(0);key=undefined;
    const actual=await realpath(directory),part=relative(base,actual);
    if(!part||isAbsolute(part)||part.startsWith('..')||/[\\/]/.test(part)||!part.startsWith('dsh-zhen-sealed-backup-'))throw new BackupError('BACKUP_TEMP_BOUNDARY');
    await unlink(owned).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;});await rmdir(directory);
  };
  try{
    // Bound the encrypted copy even if an external process grows the source.
    const input=await open(source,'r');let output:FileHandle|undefined;
    try{
      if((await input.stat()).size!==stat.size)throw new BackupError('BACKUP_SOURCE_CHANGED');
      output=await open(owned,'wx',0o600);
      for(let position=0;position<stat.size;position+=CHUNK){check(options.signal);await writeAll(output,await exact(input,Math.min(CHUNK,stat.size-position),position));}
      if((await input.stat()).size!==stat.size)throw new BackupError('BACKUP_SOURCE_CHANGED');
      await output.sync();
    }finally{try{await output?.close();}finally{await input.close();}}
    check(options.signal);file=await open(owned,'r');
    const size=(await file.stat()).size;if(size!==stat.size||size>limits.archiveBytes)throw new BackupError('BACKUP_SOURCE_CHANGED');
    const header=await exact(file,HEADER_BYTES,0);if(!header.subarray(0,8).equals(MAGIC))throw new BackupError('BACKUP_FORMAT_UNSUPPORTED');
    key=await keyFor(password,header.subarray(8,24));
    // Authentication first: no domain adapter or restore side effect can run here.
    for await(const _bytes of decrypt(file,key,header,size,options.signal)){/* discard plaintext */}
    async function* records():AsyncGenerator<BackupRecord>{
      const reader=new PlainReader(decrypt(file!,key!,header,size,options.signal));let count=0;
      try{
        while(true){
          check(options.signal);const metadataLength=(await reader.take(4)).readUInt32BE();
          if(metadataLength===0){await reader.end();return;}
          if(metadataLength>limits.metadataBytes||++count>limits.records)throw new BackupError('BACKUP_RECORD_LIMIT');
          const length=(await reader.take(8)).readBigUInt64BE();if(length>BigInt(limits.recordBytes))throw new BackupError('BACKUP_RECORD_SIZE_INVALID');
          const text=await reader.take(metadataLength);let metadata:Record<string,unknown>;
          try{metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(text));}catch{throw new BackupError('BACKUP_METADATA_INVALID');}
          metadataBytes(metadata,limits.metadataBytes);
          const size=Number(length);let consumed=0;
          const data=(async function*(){for await(const bytes of reader.payload(size)){consumed+=bytes.length;yield bytes;}})();
          yield {metadata,size,data};
          if(consumed!==size)throw new BackupError('BACKUP_RECORD_NOT_CONSUMED');
        }
      }finally{await reader.close();}
    }
    return {
      records(){if(closed||started)throw new BackupError('BACKUP_READER_CLOSED');started=true;active=records();return active;},
      async close(){if(closed)return;closed=true;try{await active?.return(undefined);}finally{await cleanup();}},
    };
  }catch(error){await cleanup();throw error;}
}
