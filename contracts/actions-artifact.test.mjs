import test from 'node:test';import assert from 'node:assert/strict';import {zipSync,unzipSync} from 'fflate';import {crc32,deflateRawSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {readArtifactZip,downloadActionArtifact,verifyArtifactDigest,ACTIONS_ARCHIVE_LIMIT} from '../scripts/actions-artifact.mjs';import {releaseApi} from '../scripts/publish-release-core.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),example=Buffer.from('EXAMPLE_ONLY_资料'),zip=(files={'report.json':example},level=0)=>Buffer.from(zipSync(files,{level}));
function layout(b){const e=b.length-22,c=b.readUInt32LE(e+16);return{e,c};}
function streamZip({wideEnd=false,wideEntry=false,compress=false}={}){
 const name=Buffer.from('report.json'),body=compress?deflateRawSync(example):example,crc=crc32(example),extra=wideEntry?Buffer.alloc(20):Buffer.alloc(0);if(wideEntry){extra.writeUInt16LE(1);extra.writeUInt16LE(16,2);extra.writeBigUInt64LE(BigInt(example.length),4);extra.writeBigUInt64LE(BigInt(body.length),12);}
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(wideEntry?45:20,4);local.writeUInt16LE(8,6);local.writeUInt16LE(compress?8:0,8);if(wideEntry){local.writeUInt32LE(0xffffffff,18);local.writeUInt32LE(0xffffffff,22);}local.writeUInt16LE(name.length,26);local.writeUInt16LE(extra.length,28);
 const descriptor=Buffer.alloc(wideEntry?24:16);descriptor.writeUInt32LE(0x08074b50);descriptor.writeUInt32LE(crc,4);if(wideEntry){descriptor.writeBigUInt64LE(BigInt(body.length),8);descriptor.writeBigUInt64LE(BigInt(example.length),16);}else{descriptor.writeUInt32LE(body.length,8);descriptor.writeUInt32LE(example.length,12);}
 const start=Buffer.concat([local,name,extra,body,descriptor]),central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(45,4);central.writeUInt16LE(wideEntry?45:20,6);central.writeUInt16LE(8,8);central.writeUInt16LE(compress?8:0,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(wideEntry?0xffffffff:body.length,20);central.writeUInt32LE(wideEntry?0xffffffff:example.length,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(extra.length,30);
 const directory=Buffer.concat([central,name,extra]),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(wideEnd?0xffff:1,8);end.writeUInt16LE(wideEnd?0xffff:1,10);end.writeUInt32LE(wideEnd?0xffffffff:directory.length,12);end.writeUInt32LE(wideEnd?0xffffffff:start.length,16);let tail=Buffer.alloc(0);
 if(wideEnd){const record=Buffer.alloc(56),locator=Buffer.alloc(20);record.writeUInt32LE(0x06064b50);record.writeBigUInt64LE(44n,4);record.writeUInt16LE(45,12);record.writeUInt16LE(45,14);record.writeBigUInt64LE(1n,24);record.writeBigUInt64LE(1n,32);record.writeBigUInt64LE(BigInt(directory.length),40);record.writeBigUInt64LE(BigInt(start.length),48);locator.writeUInt32LE(0x07064b50);locator.writeBigUInt64LE(BigInt(start.length+directory.length),8);locator.writeUInt32LE(1,16);tail=Buffer.concat([record,locator]);}
 return Buffer.concat([start,directory,tail,end]);
}

test('C77: stored and deflated ordinary artifacts decode fixed files without extracting a filesystem tree',()=>{
 for(const level of [0,6]){const b=zip({'report.json':example,'bundle.tgz':Buffer.from('EXAMPLE_BINARY')},level),out=readArtifactZip(b,['report.json','bundle.tgz']);assert.ok(out.get('report.json').equals(example));assert.equal(out.get('bundle.tgz').toString(),'EXAMPLE_BINARY');assert.deepEqual([...out.keys()].sort(),['bundle.tgz','report.json']);}
});
test('C77: streaming descriptors and ZIP64 return exact bytes; supported reference formats also match fflate',()=>{
 for(const wideEnd of[false,true])for(const wideEntry of[false,true])for(const compress of[false,true]){const b=streamZip({wideEnd,wideEntry,compress});
  // fflate0.8.3 zh/z64hs only expands central 64-bit sizes when it found a
  // ZIP64 end record. Do not claim its oversized slice validates entry-only
  // ZIP64. A real Actions ZIP64-end archive was also checked against server
  // archive SHA and the known package SHA; all fixtures return exact bytes.
  if(wideEnd||!wideEntry)assert.ok(Buffer.from(unzipSync(b)['report.json']).equals(example));
  assert.ok(readArtifactZip(b,['report.json']).get('report.json').equals(example));
 }
});
test('C77: traversal, nested names, duplicates, Unicode alternate names, symlinks and directories are rejected',()=>{
 for(const name of['../report.json','folder/report.json','REPORT.json','report.json/','资料.json'])assert.throws(()=>readArtifactZip(zip({[name]:example}),['report.json']));
 for(const attr of[0xa1ff0000,0x41ed0010,0x89a40000]){const b=zip();b.writeUInt32LE(attr>>>0,layout(b).c+38);assert.throws(()=>readArtifactZip(b,['report.json']));}
 const b=zip({'a.json':example,'b.json':example});let at=0;while((at=b.indexOf(Buffer.from('b.json'),at))>=0){b.write('a.json',at);at+=6;}assert.throws(()=>readArtifactZip(b,['a.json','b.json']));
 for(const expected of[['../x'],['report.json','report.json'],[]])assert.throws(()=>readArtifactZip(zip(),expected));
});
test('C77: CRC, local/central disagreements, encryption, disk split and trailing data cannot pass',()=>{
 const base=zip(),{c,e}=layout(base);for(const[offset,width,value]of[[c+16,4,0],[14,4,0],[6,2,1],[c+8,2,1],[c+10,2,99],[c+42,4,7],[e+4,2,1],[e+6,2,1],[e+8,2,2],[c+34,2,1]]){const b=Buffer.from(base);width===2?b.writeUInt16LE(value,offset):b.writeUInt32LE(value,offset);assert.throws(()=>readArtifactZip(b,['report.json']));}
 const wrongName=Buffer.from(base);wrongName[30]^=1;assert.throws(()=>readArtifactZip(wrongName,['report.json']));assert.throws(()=>readArtifactZip(Buffer.concat([base,Buffer.from('EXAMPLE_TRAILING')]),['report.json']));
 const streamed=streamZip(),descriptor=streamed.indexOf(Buffer.from([0x50,0x4b,0x07,0x08]));streamed[descriptor+4]^=1;assert.throws(()=>readArtifactZip(streamed,['report.json']));
});
test('C77: bounds, forged expanded sizes, invalid ZIP64 offsets and an extra DEFLATE stream fail closed',()=>{
 const b=zip({'report.json':Buffer.alloc(20000,65)},6);assert.throws(()=>readArtifactZip(b,['report.json'],{maxExpanded:1000}));assert.throws(()=>readArtifactZip(b,['report.json'],{maxBytes:12}));const small=Buffer.from(b);small.writeUInt32LE(1,layout(small).c+24);assert.throws(()=>readArtifactZip(small,['report.json']));
 const wide=streamZip({wideEnd:true});wide.writeBigUInt64LE(BigInt(Number.MAX_SAFE_INTEGER)+1n,wide.length-22-20+8);assert.throws(()=>readArtifactZip(wide,['report.json']));
 const plain=zip({'report.json':example},6),{c,e}=layout(plain),insertion=plain.readUInt32LE(18),start=30+plain.readUInt16LE(26)+plain.readUInt16LE(28),extra=Buffer.from([0,0,255,255]),grown=Buffer.concat([plain.subarray(0,start+insertion),extra,plain.subarray(start+insertion)]);grown.writeUInt32LE(insertion+extra.length,18);grown.writeUInt32LE(insertion+extra.length,c+extra.length+20);grown.writeUInt32LE(c+extra.length,e+extra.length+16);assert.throws(()=>readArtifactZip(grown,['report.json']));
});
test('C77: server archive digest and size must both match the downloaded bytes',()=>{
 const b=zip(),artifact={digest:'sha256:'+hash(b),size_in_bytes:b.length};verifyArtifactDigest(b,artifact);for(const changed of[{digest:'sha256:'+'0'.repeat(64)},{digest:undefined},{size_in_bytes:b.length+1}])assert.throws(()=>verifyArtifactDigest(b,{...artifact,...changed}));
});
test('C77: Actions download strips credentials at the signed Azure hop and never logs signed URLs',async()=>{
 const b=zip(),seen=[],token='EXAMPLE_ACTIONS_READ_AUTHORITY';const out=await downloadActionArtifact(token,31,async(url,options)=>{seen.push({url,options});return seen.length===1?new Response(null,{status:302,headers:{location:'https://productionresultssa1.blob.core.windows.net/EXAMPLE?sig=EXAMPLE_PRIVATE'}}):new Response(b);});assert.ok(out.equals(b));assert.equal(seen.length,2);assert.equal(seen[0].options.headers.Authorization,'Bearer '+token);assert.equal(seen[1].options.headers.Authorization,undefined);assert.ok(seen.every(x=>x.options.redirect==='manual'));
 for(const target of['https://example.invalid/EXAMPLE?sig=EXAMPLE_PRIVATE','http://productionresultssa1.blob.core.windows.net/EXAMPLE','https://user:EXAMPLE@productionresultssa1.blob.core.windows.net/x'])await assert.rejects(downloadActionArtifact(token,31,async()=>new Response(null,{status:302,headers:{location:target}})),e=>!e.message.includes('EXAMPLE_PRIVATE')&&!e.message.includes('https://'));
});
test('C77: artifact download limits redirects, bodies, status and IDs without retrying requests',async()=>{
 let calls=0;await assert.rejects(downloadActionArtifact('EXAMPLE',2,async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://productionresultssa2.blob.core.windows.net/EXAMPLE'}});}));assert.equal(calls,3);
 for(const response of[new Response(Buffer.alloc(ACTIONS_ARCHIVE_LIMIT+1)),new Response('EXAMPLE_PRIVATE_BODY',{status:403})])await assert.rejects(downloadActionArtifact('EXAMPLE',2,async()=>response),e=>!e.message.includes('PRIVATE_BODY'));
 for(const id of[0,-1,1.5,'2'])await assert.rejects(downloadActionArtifact('EXAMPLE',id,async()=>{throw Error('Must not send');}));
});
test('C77: anonymous read-only release client rejects every mutation before a request',async()=>{
 let calls=0;const api=releaseApi(undefined,{readOnly:true,fetchImpl:async(url,options)=>{calls++;assert.equal(options.headers.Authorization,undefined);return Response.json({example:true});}});assert.equal((await api.request('/releases/latest')).example,true);for(const method of['POST','PATCH','DELETE','PUT'])await assert.rejects(api.request('/git/refs',{method,body:{example:true}}));assert.equal(calls,1);assert.throws(()=>releaseApi(undefined));assert.throws(()=>releaseApi('EXAMPLE\nTOKEN',{readOnly:true}));
});
