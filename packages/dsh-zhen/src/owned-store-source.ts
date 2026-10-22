import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,realpathSync,lstatSync,existsSync} from 'node:fs';
import {dirname,basename,join} from 'node:path';

export interface OwnedDatabaseSource {path:string;identity:string;}
const identity=(path:string,directory=false)=>{const stat=lstatSync(path,{bigint:true});if(stat.isSymbolicLink()||(directory?!stat.isDirectory():!stat.isFile()))throw Error('OWN_DATABASE_SOURCE_INVALID');return stat.dev+':'+stat.ino;};
/** Open the resolved file, and retain the opened store's origin instead of
 * rediscovering it through a directory alias during a later backup. */
export function openOwnedDatabase(file:string):{db:DatabaseSync;source:OwnedDatabaseSource|null}{
  if(file===':memory:')return{db:new DatabaseSync(file),source:null};
  mkdirSync(dirname(file),{recursive:true});const path=existsSync(file)?realpathSync.native(file):join(realpathSync.native(dirname(file)),basename(file)),parent=dirname(path),parentIdentity=identity(parent,true),before=existsSync(path)?identity(path):null,db=new DatabaseSync(path);
  try{const source={path:realpathSync.native(path),identity:identity(path)};if(identity(parent,true)!==parentIdentity||before!==null&&before!==source.identity)throw Error('OWN_DATABASE_SOURCE_CHANGED');return{db,source};}catch(error){db.close();throw error;}
}
