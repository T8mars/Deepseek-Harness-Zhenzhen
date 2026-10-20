import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pruneDeclarations} from './declaration-output.mjs';
const root=process.cwd(),removed=pruneDeclarations(root);
if(removed.length)console.log(`Removed ${removed.length} stale generated declaration files.`);
try{execFileSync(process.execPath,[resolve(root,'node_modules/typescript/bin/tsc'),'--build','tsconfig.host.json','tsconfig.client.json','--force'],{cwd:root,stdio:'inherit',windowsHide:true});}catch(error){process.exitCode=Number.isInteger(error.status)?error.status:1;}
