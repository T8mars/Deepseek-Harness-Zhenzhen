import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {checkPackagePaths} from './package-policy.mjs';
import {canonicalVersion} from './upstream-policy.mjs';
export const MAX_RELEASE_ARCHIVE=8*1024*1024,MAX_RELEASE_EXPANDED=32*1024*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),refused=()=>{throw Error('Release archive is invalid or outside the permitted package.');};
const utf8=bytes=>new TextDecoder('utf8',{fatal:true}).decode(bytes);
function field(bytes){const end=bytes.indexOf(0);if(end>=0){if(bytes.subarray(end).some(x=>x!==0))refused();bytes=bytes.subarray(0,end);}return utf8(bytes);}
function octal(bytes){const text=bytes.toString('ascii').replace(/[\0 ]+$/,'').replace(/^ +/,'');if(!/^[0-7]+$/.test(text))refused();const n=parseInt(text,8);if(!Number.isSafeInteger(n)||n<0)refused();return n;}
function packagePath(value,directory=false){
  if(directory&&['package','package/'].includes(value))return '';
  if(directory)value=value.replace(/\/$/,'');
  if(!value.startsWith('package/')||value.length>512||value.includes('\\')||/[\x00-\x1f\x7f:]/.test(value)||value!==value.normalize('NFKC')||value.split('/').some(x=>!x||x==='.'||x==='..'))refused();
  return value.slice(8);
}
function pax(bytes){
  if(bytes.length>16384)refused();let at=0;const values={};
  while(at<bytes.length){
    const space=bytes.indexOf(32,at);if(space<0||space-at>6)refused();const raw=bytes.subarray(at,space).toString('ascii');if(!/^[1-9]\d*$/.test(raw))refused();const length=Number(raw);if(length<=space-at+2||at+length>bytes.length||bytes[at+length-1]!==10)refused();
    const line=utf8(bytes.subarray(space+1,at+length-1)),eq=line.indexOf('=');if(eq<1)refused();const key=line.slice(0,eq),value=line.slice(eq+1);if(Object.hasOwn(values,key)||!['path','size','mtime','atime','ctime','uid','gid','uname','gname'].includes(key))refused();
    if(['size','uid','gid'].includes(key)&&!/^\d+$/.test(value))refused();if(['mtime','atime','ctime'].includes(key)&&!/^\d+(?:\.\d+)?$/.test(value))refused();if(/[\x00-\x1f\x7f]/.test(value))refused();values[key]=value;at+=length;
    if(Object.keys(values).length>9)refused();
  }
  return values;
}
export function readReleaseArchive(archive){
  if(!Buffer.isBuffer(archive)||archive.length<18||archive.length>MAX_RELEASE_ARCHIVE)refused();
  const bytes=gunzipSync(archive,{maxOutputLength:MAX_RELEASE_EXPANDED});if(bytes.length%512!==0)refused();
  const files=new Map(),modes=new Map(),kinds=new Map();let pending,at=0,ended=false;
  while(at<bytes.length){
    const header=bytes.subarray(at,at+512);if(header.every(x=>x===0)){if(pending||bytes.length-at<1024||bytes.subarray(at).some(x=>x!==0))refused();ended=true;break;}
    let sum=0;for(let n=0;n<512;n++)sum+=n>=148&&n<156?32:header[n];if(sum!==octal(header.subarray(148,156)))refused();
    const magic=header.subarray(257,263).toString('ascii');if(!['ustar\0','ustar '].includes(magic))refused();
    const prefix=field(header.subarray(345,500)),name=(prefix?prefix+'/':'')+field(header.subarray(0,100)),size=octal(header.subarray(124,136)),mode=octal(header.subarray(100,108)),type=String.fromCharCode(header[156]||48);
    if(size>8*1024*1024||at+512+Math.ceil(size/512)*512>bytes.length||(mode&0o7000)!==0)refused();
    const content=bytes.subarray(at+512,at+512+size),next=at+512+Math.ceil(size/512)*512;if(bytes.subarray(at+512+size,next).some(x=>x!==0))refused();at=next;
    if(type==='x'){if(pending)refused();packagePath(name);pending=pax(content);continue;}
    if(!['0','5'].includes(type)||field(header.subarray(157,257)))refused();
    if(pending?.size!==undefined&&Number(pending.size)!==size)refused();
    packagePath(name,type==='5');const path=packagePath(pending?.path??name,type==='5');pending=undefined;
    if(path===''){if(type!=='5'||size!==0)refused();continue;}
    const folded=path.toLowerCase();if(kinds.has(folded))refused();kinds.set(folded,type);
    const parts=path.split('/');for(let n=1;n<parts.length;n++)if(kinds.get(parts.slice(0,n).join('/').toLowerCase())==='0')refused();
    if(type==='5'){if(size!==0)refused();continue;}
    if([...kinds.keys()].some(x=>x.startsWith(folded+'/')))refused();
    files.set(path,Buffer.from(content));modes.set(path,(mode&0o111)?'100755':'100644');if(files.size>5000)refused();
  }
  if(!ended||!files.size)refused();checkPackagePaths([...files.keys()]);
  for(const data of [archive,bytes,...files.values()]){
    const text=data===archive||data===bytes?data.toString('utf8'):utf8(data);
    for(const pattern of [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{40,})/,/\bsk-[A-Za-z0-9_-]{25,}\b/])if(pattern.test(text))refused();
  }
  let manifest;const manifestBytes=files.get('package.json')??Buffer.alloc(0);if(manifestBytes.length>128*1024)refused();try{manifest=JSON.parse(utf8(manifestBytes));}catch{refused();}
  if(manifest.name!=='dsh-zhen'||!canonicalVersion(manifest.version)||manifest.main!=='./lib/index.js'||manifest.dsh?.bundle?.patch!=='./cordis.patch.yml'||Object.keys(manifest.scripts??{}).length||manifest.workspaces)refused();
  for(const name of ['LICENSE','NOTICE.md','THIRD_PARTY_NOTICES.md','lib/index.js','lib/client.js','lib/remote.js','lib/typert.js','lib/canvas-server.js','lib/mcp-server.js','lib/pdf-text-worker.js','lib/docx-text-worker.js','cordis.patch.yml','catalog/skills.json'])if(!files.has(name))refused();
  return {files,modes,manifest,sha256:hash(archive),bytes:archive.length,payloadSha256:releasePayloadHash(files,modes)};
}
function canonical(value){return value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):Array.isArray(value)?value.map(canonical):value;}
export function releasePayloadHash(files,modes=new Map()){
  const digest=createHash('sha256');
  for(const name of [...files.keys()].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)))){
    let bytes=files.get(name);if(name==='package.json'){const m=JSON.parse(utf8(bytes));delete m.version;bytes=Buffer.from(JSON.stringify(canonical(m)));}
    digest.update(name+'\0'+(modes.get(name)??'100644')+'\0'+hash(bytes)+'\0');
  }
  return digest.digest('hex');
}
