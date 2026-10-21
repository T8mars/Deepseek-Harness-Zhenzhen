import {BackupError} from './backup-archive.ts';

/** Preserve JSON data and expression markers without invoking accessors or toJSON. */
export function assertBackupJson(value:unknown,depth=0):void {
  if(depth>64)throw new BackupError('BACKUP_DATA_JSON_INVALID');
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'&&Number.isFinite(value)&&!Object.is(value,-0))return;
  if(!value||typeof value!=='object'||(!Array.isArray(value)&&![null,Object.prototype].includes(Object.getPrototypeOf(value))))throw new BackupError('BACKUP_DATA_JSON_INVALID');
  if(Object.getOwnPropertySymbols(value).length)throw new BackupError('BACKUP_DATA_JSON_INVALID');
  if(Array.isArray(value)&&(Object.keys(value).length!==value.length||Object.keys(value).some((key,index)=>key!==String(index))))throw new BackupError('BACKUP_DATA_JSON_INVALID');
  for(const[key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(value))){
    if(Array.isArray(value)&&key==='length')continue;
    if(!('value'in descriptor)||!descriptor.enumerable)throw new BackupError('BACKUP_DATA_JSON_INVALID');assertBackupJson(descriptor.value,depth+1);
  }
}
export function backupJsonString(value:unknown):string{assertBackupJson(value);return JSON.stringify(value);}
export function parseBackupJson(bytes:Uint8Array):unknown{
  try{const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));assertBackupJson(value);return value;}
  catch{throw new BackupError('BACKUP_DATA_JSON_INVALID');}
}
