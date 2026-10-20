import {inflateRawSync,crc32} from 'node:zlib';
import {SaxesParser} from 'saxes';
import type {SaxesTagNS} from 'saxes';

export const DOCX_LIMITS=Object.freeze({inputBytes:2*1024*1024,xmlBytes:8*1024*1024,metadataBytes:256*1024,textBytes:2*1024*1024,entries:512,depth:128,timeoutMs:30000,heapMiB:256,pending:4});
const WORD=new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main']);
const RELS='http://schemas.openxmlformats.org/package/2006/relationships',TYPES='http://schemas.openxmlformats.org/package/2006/content-types';
const OFFICE=new Set(['http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument','http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument']);
function refuse(code='INVALID'):never{throw Error(code);}
const utf8=(bytes:Uint8Array)=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
function partName(value:string):string{const name=decodeURIComponent(value).replace(/^\//,'');if(!name||name.length>1024||/[\\\0?#:]/.test(name)||name.split('/').some(item=>!item||item==='.'||item==='..'))refuse();return name;}

/** Read only the three selected OPC parts in memory. No archive paths are
 * materialized. Native zlib maxOutputLength also caps a forged ZIP size. */
function zipReader(input:Uint8Array):(name:string,limit:number)=>Buffer {
 if(input.byteLength>DOCX_LIMITS.inputBytes)refuse('LIMIT');const b=Buffer.from(input);if(b.length<22||b.readUInt32LE(0)!==0x04034b50)refuse();
 let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50&&i+22+b.readUInt16LE(i+20)===b.length){end=i;break;}if(end<0)refuse();
 const count=b.readUInt16LE(end+10),central=b.readUInt32LE(end+16),length=b.readUInt32LE(end+12);
 if(b.readUInt16LE(end+4)||b.readUInt16LE(end+6)||b.readUInt16LE(end+8)!==count||!count||count>DOCX_LIMITS.entries||central+length!==end)refuse('LIMIT');
 type Entry={name:string;flags:number;method:number;crc:number;compressed:number;size:number;offset:number};const files=new Map<string,Entry>();let at=central;
 for(let index=0;index<count;index++){
  if(at+46>end||b.readUInt32LE(at)!==0x02014b50)refuse();const names=b.readUInt16LE(at+28),extra=b.readUInt16LE(at+30),comment=b.readUInt16LE(at+32);if(!names||at+46+names+extra+comment>end||b.readUInt16LE(at+34))refuse();
  const name=utf8(b.subarray(at+46,at+46+names));if(name.includes('\0')||name.includes('\\')||name.startsWith('/')||name.split('/').some(item=>item==='.'||item==='..')||files.has(name))refuse();
  files.set(name,{name,flags:b.readUInt16LE(at+8),method:b.readUInt16LE(at+10),crc:b.readUInt32LE(at+16),compressed:b.readUInt32LE(at+20),size:b.readUInt32LE(at+24),offset:b.readUInt32LE(at+42)});at+=46+names+extra+comment;
 }
 if(at!==end)refuse();
 return(name,limit)=>{
  const entry=files.get(name);if(!entry)refuse();const p=entry.offset;
  if(entry.flags&0x41||![0,8].includes(entry.method))refuse('UNSUPPORTED');if(entry.size>limit||p+30>central||entry.compressed>DOCX_LIMITS.inputBytes)refuse('LIMIT');
  if(b.readUInt32LE(p)!==0x04034b50||b.readUInt16LE(p+6)!==entry.flags||b.readUInt16LE(p+8)!==entry.method)refuse();const names=b.readUInt16LE(p+26),extra=b.readUInt16LE(p+28),start=p+30+names+extra;
  if(start>central||start+entry.compressed>central||utf8(b.subarray(p+30,p+30+names))!==name)refuse();
  const compressed=b.subarray(start,start+entry.compressed);let result:Buffer;
  try{result=entry.method===0?compressed:inflateRawSync(compressed,{maxOutputLength:limit});}catch(error){if((error as NodeJS.ErrnoException).code==='ERR_BUFFER_TOO_LARGE')refuse('LIMIT');refuse();}
  if(result.length!==entry.size||crc32(result)!==entry.crc)refuse();return result;
 };
}

function xml(bytes:Uint8Array,handlers:{open?:(tag:SaxesTagNS,depth:number)=>void;close?:(tag:SaxesTagNS,depth:number)=>void;text?:(text:string)=>void}):void {
 let text:string;if(bytes[0]===0xff&&bytes[1]===0xfe)text=new TextDecoder('utf-16le',{fatal:true}).decode(bytes);else if(bytes[0]===0xfe&&bytes[1]===0xff)text=new TextDecoder('utf-16be',{fatal:true}).decode(bytes);else text=utf8(bytes);
 const parser=new SaxesParser({xmlns:true});let depth=0,events=0;parser.on('error',()=>refuse());parser.on('doctype',()=>refuse('UNSUPPORTED'));
 parser.on('opentag',tag=>{if(++depth>DOCX_LIMITS.depth||++events>500000)refuse('LIMIT');handlers.open?.(tag,depth);});parser.on('closetag',tag=>{handlers.close?.(tag,depth);depth--;});parser.on('text',value=>handlers.text?.(value));parser.on('cdata',value=>handlers.text?.(value));parser.write(text).close();if(depth!==0)refuse();
}
const attr=(tag:SaxesTagNS,name:string)=>Object.values(tag.attributes).find(item=>item.local===name&&!item.uri)?.value??'';

/** Main-story paragraphs/table cells in document order. Does not render Word,
 * execute fields/macros, load relationships or infer layout/page numbers. */
export function parseDocx(input:Uint8Array):string {
 const read=zipReader(input);let main='',relationsRoot=false;
 xml(read('_rels/.rels',DOCX_LIMITS.metadataBytes),{open(tag,depth){if(depth===1){if(tag.uri!==RELS||tag.local!=='Relationships')refuse();relationsRoot=true;}if(depth===2&&tag.uri===RELS&&tag.local==='Relationship'&&OFFICE.has(attr(tag,'Type'))){if(main||attr(tag,'TargetMode').toLowerCase()==='external')refuse('UNSUPPORTED');main=partName(attr(tag,'Target'));}}});if(!relationsRoot||!main)refuse();
 let contentType='',typesRoot=false;xml(read('[Content_Types].xml',DOCX_LIMITS.metadataBytes),{open(tag,depth){if(depth===1){if(tag.uri!==TYPES||tag.local!=='Types')refuse();typesRoot=true;}if(depth===2&&tag.uri===TYPES&&tag.local==='Override'&&partName(attr(tag,'PartName'))===main){if(contentType)refuse();contentType=attr(tag,'ContentType');}}});
 if(!typesRoot||contentType!=='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')refuse('UNSUPPORTED');
 let body=0,bodies=0,blocked=0,textDepth=0,run=0,hidden=false,total=0;const pieces:string[]=[];
 const append=(value:string)=>{if(!value)return;total+=Buffer.byteLength(value);if(total>DOCX_LIMITS.textBytes)refuse('TEXT_LIMIT');pieces.push(value);};
 xml(read(main,DOCX_LIMITS.xmlBytes),{
  open(tag,depth){const word=WORD.has(tag.uri);if(depth===1&&(!word||tag.local!=='document'))refuse();if(word&&tag.local==='body'){if(++bodies!==1||depth!==2)refuse();body=depth;}if(!body||blocked)return;
   if(word&&['del','moveFrom','drawing','pict','object'].includes(tag.local)){blocked=depth;return;}if(!word)return;
   if(['altChunk','subDoc'].includes(tag.local))refuse('UNSUPPORTED');if(tag.local==='r'){run=depth;hidden=false;}if(tag.local==='vanish'&&run){const value=Object.values(tag.attributes).find(item=>WORD.has(item.uri)&&item.local==='val')?.value;hidden=!['0','false','off'].includes(value??'');}
   if(tag.local==='t'&&!hidden)textDepth=depth;if(!hidden&&tag.local==='tab')append('\t');if(!hidden&&['br','cr'].includes(tag.local))append('\n');
  },
  text(value){if(body&&textDepth&&!blocked&&!hidden)append(value);},
  close(tag,depth){if(blocked){if(depth===blocked)blocked=0;return;}if(!body)return;const word=WORD.has(tag.uri);if(depth===textDepth)textDepth=0;if(depth===run){run=0;hidden=false;}if(word&&tag.local==='p')append('\n');if(word&&tag.local==='tc')append('\t');if(word&&tag.local==='tr')append('\n');if(depth===body)body=0;},
 });
 if(bodies!==1)refuse();return pieces.join('').replace(/\n\t/g,'\t').replace(/\t\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
