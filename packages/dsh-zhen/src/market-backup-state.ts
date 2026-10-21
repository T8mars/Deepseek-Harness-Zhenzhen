import {createHash} from 'node:crypto';
import {z} from 'zod';
import {skillPackageSchema,skillId,digestSchema} from './market-schema.ts';
import type {SkillPackage} from './market-schema.ts';
import type {MarketBackupState} from './market.ts';
import {BackupError} from './backup-archive.ts';
import {backupJsonString} from './backup-data.ts';

const digestOrEmpty=z.union([z.literal(''),digestSchema]),revision=z.string().regex(/^(?:[a-f0-9]{40})?$/),bit=z.union([z.literal(0),z.literal(1)]);
const selection=z.object({id:skillId,active:digestOrEmpty,pending:digestOrEmpty,enabled:bit,pending_mode:z.enum(['','manual','automatic']),pending_revision:revision,auto_paused:bit,skipped:digestOrEmpty}).strict();
export const marketBackupStateSchema=z.object({schemaVersion:z.literal(3),versions:z.array(z.object({key:digestSchema,package:skillPackageSchema}).strict()).max(40000),selections:z.array(selection).max(40000),preferences:z.object({id:z.literal(1),enabled:bit,scope:z.literal('first-party-text-v1'),verified_revision:revision,verified_digest:digestOrEmpty}).strict(),bundled:z.array(skillPackageSchema).max(100),catalog:z.array(skillPackageSchema).max(200)}).strict();
/** Shared by capture and candidate import; no module loading or update policy
 * application. Package verification is supplied by the own market owner. */
export function validateMarketBackupState(input:unknown,verify:(input:unknown)=>SkillPackage):MarketBackupState{
  try{
    if(Buffer.byteLength(backupJsonString(input))>64*1024**2)throw Error();
    const value=marketBackupStateSchema.parse(input),versions=new Map<string,SkillPackage>(),versionIds=new Set<string>();
    for(const row of value.versions){const item=verify(row.package),id=item.manifest.id+'@'+item.manifest.version;if(versions.has(row.key)||versionIds.has(id)||createHash('sha256').update(JSON.stringify(item)).digest('hex')!==row.key)throw Error();versions.set(row.key,item);versionIds.add(id);}
    const ids=new Set<string>();for(const selected of value.selections){if(ids.has(selected.id))throw Error();ids.add(selected.id);for(const key of [selected.active,selected.pending,selected.skipped])if(key&&versions.get(key)?.manifest.id!==selected.id)throw Error();if(!!selected.pending!==!!selected.pending_mode||(selected.pending_mode==='automatic'?!selected.pending_revision:!!selected.pending_revision))throw Error();}
    for(const items of [value.bundled,value.catalog]){const names=new Set<string>();for(const item of items){verify(item);if(names.has(item.manifest.id))throw Error();names.add(item.manifest.id);}}
    return value;
  }catch{throw new BackupError('BACKUP_MARKET_STATE_INVALID');}
}
