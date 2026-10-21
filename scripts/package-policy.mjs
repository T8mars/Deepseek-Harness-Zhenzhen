import {checkPackList} from './check-private.mjs';
export const PACKAGE_FILE_PATTERN=/^(package\.json|NOTICE\.md|THIRD_PARTY_NOTICES\.md|LICENSE|lib\/(index\.js|client\.js|remote\.js|typert\.js|backup\.js|canvas-server\.js|mcp-server\.js|(?:pdf-text|docx-text)-worker\.js|(?:types|client-types)\/.*\.d\.ts)|cordis\.patch\.yml|skills\/[^/]+\/(SKILL\.md|manifest\.json)|catalog\/[^/]+\.json)$/;
export function checkPackagePaths(entries){
  const paths=entries.map(entry=>typeof entry==='string'?entry:entry.path);
  checkPackList(paths);
  if(paths.length>5000||new Set(paths.map(x=>x.normalize('NFKC').toLowerCase())).size!==paths.length)throw Error('Package paths are duplicated or ambiguous.');
  for(const path of paths)if(!PACKAGE_FILE_PATTERN.test(path)||path!==path.normalize('NFKC')||path.includes('\\')||/[\x00-\x1f\x7f:]/.test(path)||path.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Unexpected package path.');
  return paths;
}
