import {existsSync,lstatSync,readdirSync,realpathSync,unlinkSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';

export function validDeclaration(root,path) {
  if(path.includes('\\')||path.split('/').some(part=>part==='.'||part==='..'))return false;
  const match=/^lib\/(types|client-types)\/(.+)\.d\.ts$/.exec(path);if(!match)return false;
  if(match[1]==='client-types'&&!match[2].startsWith('client/'))return false;
  return ['.ts','.tsx'].some(ext=>{const source=join(root,'packages/dsh-zhen/src',match[2]+ext);try{const stat=lstatSync(source);return stat.isFile()&&!stat.isSymbolicLink();}catch{return false;}});
}
export function checkDeclarations(root,files,manifest) {
  const paths=files.map(file=>typeof file==='string'?file:file.path);
  for(const path of paths)if(/^lib\/(?:types|client-types)\//.test(path)&&!validDeclaration(root,path))throw new Error(`Stale declaration output: ${path}. Run npm run typecheck:clean.`);
  const declared=[manifest.types,...Object.values(manifest.exports??{}).map(value=>value&&typeof value==='object'?value.types:undefined)].filter(Boolean);
  for(const path of declared)if(!paths.includes(path.replace(/^\.\//,'')))throw new Error(`Missing declared type export: ${path}. Run npm run typecheck:clean.`);
}
export function pruneDeclarations(root) {
  root=realpathSync.native(root);const pkg=join(root,'packages/dsh-zhen'),stale=[];let examined=0;
  function inside(file){const rel=relative(root,file);if(!rel||isAbsolute(rel)||rel.startsWith('..'))throw new Error('Declaration cleanup escaped the workspace.');}
  function walk(directory) {
    if(!existsSync(directory))return;
    const stat=lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Declaration output is not an ordinary directory.');
    const physical=realpathSync.native(directory);inside(physical);
    const norm=path=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);
    if(norm(physical)!==norm(directory))throw new Error('Declaration output has a redirected ancestor.');
    for(const entry of readdirSync(directory,{withFileTypes:true})){
      if(++examined>5000)throw new Error('Declaration output exceeds the bounded scan.');
      const path=join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Linked declaration output refused.');
      if(entry.isDirectory())walk(path);else if(entry.isFile()&&entry.name.endsWith('.d.ts')){
        inside(path);const packaged=relative(pkg,path).replaceAll('\\','/');if(!validDeclaration(root,packaged))stale.push(path);
      }
    }
  }
  for(const name of ['types','client-types'])walk(join(pkg,'lib',name));
  // Validate the whole plan before unlinking only stale generated declarations.
  for(const path of stale)unlinkSync(path);
  return stale.map(path=>relative(pkg,path).replaceAll('\\','/'));
}
