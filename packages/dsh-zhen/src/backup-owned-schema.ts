import {z} from 'zod';
import {gatewayCheckReceiptSchema} from './gateway-check-schema.ts';
import {gatewayTaskRecordSchema} from './gateway-task-schema.ts';
import {gatewayMediaReceiptSchema} from './gateway-media-schema.ts';
import {BackupError} from './backup-archive.ts';
import {parseBackupJson} from './backup-data.ts';

export const OWNED_BACKUP_SCHEMA='dsh-zhen-owned-state-v1',OWNED_ROWS_LIMIT=100_000,OWNED_METADATA_LIMIT=64*1024**2;
const uuid=z.uuid(),text=z.string(),digest=z.string().regex(/^[a-f0-9]{64}$/),ordinal=text.regex(/^(?:0|-?[1-9]\d*)$/).refine(value=>{try{const n=BigInt(value);return n>=-(2n**63n)&&n<2n**63n;}catch{return false;}});
const check=z.object({ordinal,id:uuid,owner:uuid,created:z.number().int().safe().nonnegative(),state:text,receipt:text.max(4096)}).strict();
const task=z.object({ordinal,id:uuid,protocol:text,task_id:text,record:text.max(4096)}).strict();
const media=z.object({ordinal,id:uuid,receipt:text.max(32768)}).strict();
const file=z.object({id:uuid,originPath:text.min(1).max(4096),state:z.enum(['present','changed','missing','excluded']),reason:z.enum(['','absent','not-selected','protected']),actualBytes:z.number().int().safe().nonnegative().nullable(),actualSha256:digest.nullable()}).strict();
const coverage=z.object({knownOwnSqlite:z.literal(true),completedMediaReferences:z.literal(true),credentialStores:z.literal(false),memoryTicketsAndUrls:z.literal(false),activation:z.literal(false),wholeApplicationRestore:z.literal(false)}).strict();
export const OWNED_COVERAGE={knownOwnSqlite:true,completedMediaReferences:true,credentialStores:false,memoryTicketsAndUrls:false,activation:false,wholeApplicationRestore:false} as const;
export const ownedDocumentSchema=z.object({schema:z.literal(OWNED_BACKUP_SCHEMA),originRoot:text.min(1).max(4096),stores:z.object({checks:z.object({present:z.boolean(),rows:z.array(check).max(OWNED_ROWS_LIMIT)}).strict(),tasks:z.object({present:z.boolean(),rows:z.array(task).max(OWNED_ROWS_LIMIT)}).strict(),media:z.object({present:z.boolean(),rows:z.array(media).max(OWNED_ROWS_LIMIT)}).strict()}).strict(),files:z.array(file).max(OWNED_ROWS_LIMIT),coverage}).strict();
export type OwnedStateDocument=z.infer<typeof ownedDocumentSchema>;
export const OWNED_STORES=[
  {kind:'checks',file:['gateway-checks.sqlite'],table:'checks',columns:['id','owner','created','state','receipt'],types:['TEXT','TEXT','INTEGER','TEXT','TEXT'],sql:'CREATE TABLE checks(id TEXT PRIMARY KEY,owner TEXT NOT NULL,created INTEGER NOT NULL,state TEXT NOT NULL,receipt TEXT NOT NULL)'},
  {kind:'tasks',file:['gateway-tasks.sqlite'],table:'tasks',columns:['id','protocol','task_id','record'],types:['TEXT','TEXT','TEXT','TEXT'],sql:'CREATE TABLE tasks(id TEXT PRIMARY KEY,protocol TEXT NOT NULL,task_id TEXT NOT NULL,record TEXT NOT NULL,UNIQUE(protocol,task_id))'},
  {kind:'media',file:['media-exports','receipts.sqlite'],table:'receipts',columns:['id','receipt'],types:['TEXT','TEXT'],sql:'CREATE TABLE receipts(id TEXT PRIMARY KEY,receipt TEXT NOT NULL)'},
] as const;
export function ownedReceipt(text:string){return gatewayMediaReceiptSchema.parse(parseBackupJson(Buffer.from(text)));}
export function validateOwnedDocument(input:unknown):OwnedStateDocument{
  try{
    const value=ownedDocumentSchema.parse(input);let total=0;
    for(const descriptor of OWNED_STORES){const store=value.stores[descriptor.kind],ids=new Set<string>(),ordinals=new Set<string>(),pairs=new Set<string>();let previous:bigint|undefined;if(!store.present&&store.rows.length)throw Error('absent');for(const row of store.rows){const position=BigInt(row.ordinal);if(++total>OWNED_ROWS_LIMIT||ids.has(row.id)||ordinals.has(row.ordinal)||previous!==undefined&&position<=previous)throw Error('duplicate');previous=position;ids.add(row.id);ordinals.add(row.ordinal);if(descriptor.kind==='checks'){const item=row as OwnedStateDocument['stores']['checks']['rows'][number],receipt=gatewayCheckReceiptSchema.parse(parseBackupJson(Buffer.from(item.receipt)));if(receipt.id!==item.id||receipt.state!==item.state)throw Error('identity');}else if(descriptor.kind==='tasks'){const item=row as OwnedStateDocument['stores']['tasks']['rows'][number],record=gatewayTaskRecordSchema.parse(parseBackupJson(Buffer.from(item.record))),key=item.protocol+':'+item.task_id;if(record.id!==item.id||record.protocol!==item.protocol||record.taskId!==item.task_id||pairs.has(key))throw Error('identity');pairs.add(key);}else{const item=row as OwnedStateDocument['stores']['media']['rows'][number];if(ownedReceipt(item.receipt).id!==item.id)throw Error('identity');}}}
    const receipts=new Map(value.stores.media.rows.map(row=>[row.id,ownedReceipt(row.receipt)])),seen=new Set<string>();if(value.files.length!==receipts.size)throw Error('files');
    for(const file of value.files){const receipt=receipts.get(file.id);if(!receipt||seen.has(file.id)||file.originPath!==receipt.path)throw Error('files');seen.add(file.id);if(['present','changed'].includes(file.state)){if(file.reason!==''||file.actualBytes===null||file.actualSha256===null)throw Error('file');const same=file.actualBytes===receipt.bytes&&file.actualSha256===receipt.sha256;if(same!==(file.state==='present'))throw Error('file');}else if(file.actualBytes!==null||file.actualSha256!==null||file.reason!==(file.state==='missing'?'absent':file.reason)||file.state==='excluded'&&!['not-selected','protected'].includes(file.reason))throw Error('file');}
    return value;
  }catch(error){if(error instanceof BackupError&&error.code==='BACKUP_OWN_STATE_LIMIT')throw error;throw new BackupError('BACKUP_OWN_STATE_INVALID');}
}
