import {inflateRawSync,crc32} from 'node:zlib';
import {createHash} from 'node:crypto';

const bad=()=>{throw Error('Actions artifact archive is invalid or outside its bound.');};
const repository='T8mars/Deepseek-Harness-Zhenzhen';
export const ACTIONS_ARCHIVE_LIMIT=9*1024*1024;
const digest=x=>createHash('sha256').update(x).digest('hex');
function u64(b,at){if(at<0||at+8>b.length)bad();const n=b.readBigUInt64LE(at);if(n>BigInt(Number.MAX_SAFE_INTEGER))bad();return Number(n);}
function zip64(extra,values){let at=0,record;while(at<extra.length){if(at+4>extra.length)bad();const id=extra.readUInt16LE(at),size=extra.readUInt16LE(at+2);at+=4;if(at+size>extra.length)bad();if(id===1){if(record)bad();record=extra.subarray(at,at+size);}if(id===0x7075)bad();at+=size;}let pos=0;return values.map(n=>{if(n!==0xffffffff)return n;if(!record)bad();const v=u64(record,pos);pos+=8;return v;});}

/** In-memory only: fixed flat ordinary files, bounded ZIP/ZIP64, CRC and both headers. */
export function readArtifactZip(bytes,expectedFiles,{maxBytes=ACTIONS_ARCHIVE_LIMIT,maxExpanded=ACTIONS_ARCHIVE_LIMIT}={}){
  if(!Buffer.isBuffer(bytes)||bytes.length<22||bytes.length>maxBytes||!Array.isArray(expectedFiles)||expectedFiles.length<1||expectedFiles.length>4||new Set(expectedFiles).size!==expectedFiles.length||expectedFiles.some(x=>typeof x!=='string'||!/^[A-Za-z0-9][A-Za-z0-9.-]{0,149}$/.test(x)))bad();
  const eocd=bytes.length-22;if(bytes.readUInt32LE(eocd)!==0x06054b50||bytes.readUInt16LE(eocd+4)||bytes.readUInt16LE(eocd+6)||bytes.readUInt16LE(eocd+20))bad();
  let count=bytes.readUInt16LE(eocd+10),centralSize=bytes.readUInt32LE(eocd+12),centralAt=bytes.readUInt32LE(eocd+16),tail=eocd;
  if(bytes.readUInt16LE(eocd+8)!==count)bad();
  const locator=eocd-20;
  if(locator>=0&&bytes.readUInt32LE(locator)===0x07064b50){
    if(bytes.readUInt32LE(locator+4)!==0||bytes.readUInt32LE(locator+16)!==1)bad();const at=u64(bytes,locator+8);if(at+56>locator||bytes.readUInt32LE(at)!==0x06064b50||u64(bytes,at+4)!==44||at+56!==locator||bytes.readUInt32LE(at+16)||bytes.readUInt32LE(at+20))bad();
    const actualCount=u64(bytes,at+32),actualSize=u64(bytes,at+40),actualAt=u64(bytes,at+48);if(u64(bytes,at+24)!==actualCount||count!==0xffff&&count!==actualCount||centralSize!==0xffffffff&&centralSize!==actualSize||centralAt!==0xffffffff&&centralAt!==actualAt)bad();count=actualCount;centralSize=actualSize;centralAt=actualAt;tail=at;
  }
  if(count!==expectedFiles.length||centralAt<0||centralAt+centralSize!==tail)bad();
  const entries=[],names=new Set();let at=centralAt,total=0;
  for(let n=0;n<count;n++){
    if(at+46>tail||bytes.readUInt32LE(at)!==0x02014b50)bad();const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),crc=bytes.readUInt32LE(at+16),nameLength=bytes.readUInt16LE(at+28),extraLength=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),attr=bytes.readUInt32LE(at+38),end=at+46+nameLength+extraLength+comment;
    if(flags&~0x808||![0,8].includes(method)||!nameLength||nameLength>150||extraLength>1024||comment||bytes.readUInt16LE(at+34)||end>tail||(attr&0x10)||![0,0x8000].includes((attr>>>16)&0xf000)||(attr>>>16)&0xe00)bad();
    const rawName=bytes.subarray(at+46,at+46+nameLength),name=rawName.toString('ascii');if(!rawName.equals(Buffer.from(name,'ascii'))||!expectedFiles.includes(name)||names.has(name))bad();names.add(name);
    const extra=bytes.subarray(at+46+nameLength,end),[size,compressed,offset]=zip64(extra,[bytes.readUInt32LE(at+24),bytes.readUInt32LE(at+20),bytes.readUInt32LE(at+42)]);total+=size;if(size>maxExpanded||compressed>maxBytes||total>maxExpanded||offset>=centralAt)bad();entries.push({name,rawName,flags,method,crc,size,compressed,offset});at=end;
  }
  if(at!==tail)bad();entries.sort((a,b)=>a.offset-b.offset);const files=new Map();let next=0;
  for(let n=0;n<entries.length;n++){
    const e=entries[n],at=e.offset,end=n+1<entries.length?entries[n+1].offset:centralAt;if(at!==next||at+30>end||bytes.readUInt32LE(at)!==0x04034b50||bytes.readUInt16LE(at+6)!==e.flags||bytes.readUInt16LE(at+8)!==e.method)bad();const nameLength=bytes.readUInt16LE(at+26),extraLength=bytes.readUInt16LE(at+28),start=at+30+nameLength+extraLength;if(extraLength>1024||start+e.compressed>end||!bytes.subarray(at+30,at+30+nameLength).equals(e.rawName))bad();
    const local=zip64(bytes.subarray(at+30+nameLength,start),[bytes.readUInt32LE(at+22),bytes.readUInt32LE(at+18)]);let finish=start+e.compressed;
    if(e.flags&8){let descriptor=finish;if(descriptor+4<=end&&bytes.readUInt32LE(descriptor)===0x08074b50)descriptor+=4;const remaining=end-descriptor;if(![12,20].includes(remaining)||bytes.readUInt32LE(descriptor)!==e.crc)bad();const compressed=remaining===20?u64(bytes,descriptor+4):bytes.readUInt32LE(descriptor+4),size=remaining===20?u64(bytes,descriptor+12):bytes.readUInt32LE(descriptor+8);if(compressed!==e.compressed||size!==e.size)bad();finish=end;
    }else if(bytes.readUInt32LE(at+14)!==e.crc||local[0]!==e.size||local[1]!==e.compressed)bad();
    if(finish!==end)bad();let data;try{const input=bytes.subarray(start,start+e.compressed);if(e.method===0)data=input;else{const decoded=inflateRawSync(input,{maxOutputLength:Math.max(1,e.size),info:true});if(decoded.engine.bytesWritten!==input.length)bad();data=decoded.buffer;}}catch{bad();}if(data.length!==e.size||crc32(data)!==e.crc)bad();files.set(e.name,data);next=end;
  }
  return files;
}

/** Redirect addresses are never logged; credentials are sent only to api.github.com. */
export async function downloadActionArtifact(token,id,fetchImpl=globalThis.fetch){
  if(!Number.isSafeInteger(id)||id<=0)throw Error('Actions artifact identity refused.');let url='https://api.github.com/repos/'+repository+'/actions/artifacts/'+id+'/zip';
  for(let n=0;n<3;n++){
    let response;try{response=await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(45000),headers:n===0?{...(token?{Authorization:'Bearer '+token}:{}),Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}:{}});}catch{throw Error('Actions artifact download unavailable.');}
    if([301,302,303,307,308].includes(response.status)){let target;try{target=new URL(response.headers.get('location'));}catch{throw Error('Actions artifact redirect refused.');}await response.body?.cancel();if(target.protocol!=='https:'||target.port||target.username||target.password||!/^productionresultssa[a-z0-9]+\.blob\.core\.windows\.net$/.test(target.hostname))throw Error('Actions artifact redirect refused.');url=target.href;continue;}
    if(!response.ok||!response.body)throw Error('Actions artifact download refused.');const chunks=[];let size=0;try{for await(const chunk of response.body){size+=chunk.length;if(size>ACTIONS_ARCHIVE_LIMIT)throw Error();chunks.push(chunk);}}catch{throw Error('Actions artifact download exceeded its bound.');}return Buffer.concat(chunks);
  }throw Error('Actions artifact redirect limit exceeded.');
}

export function verifyArtifactDigest(bytes,artifact){if(!/^sha256:[a-f0-9]{64}$/.test(artifact?.digest??'')||artifact.digest!=='sha256:'+digest(bytes)||artifact.size_in_bytes!==bytes.length)throw Error('Actions server artifact digest or size differs.');}
