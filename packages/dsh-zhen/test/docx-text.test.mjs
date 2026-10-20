import test from 'node:test';import assert from 'node:assert/strict';
import {parseDocx,DOCX_LIMITS} from '../lib/docx-parse.js';import {extractDocxText} from '../lib/docx-text.js';
import {exampleDocx} from '../../../contracts/fixtures/docx-document.mjs';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
test('C51: independent python-docx 1.2.0 document decodes exactly through the production child without changing source bytes',async()=>{
 const fixture=JSON.parse(readFileSync(new URL('../../../contracts/fixtures/docx-generated.json',import.meta.url))),bytes=Buffer.from(fixture.base64,'base64');assert.equal(fixture.producer,'python-docx');assert.equal(createHash('sha256').update(bytes).digest('hex'),fixture.sha256);assert.equal(await extractDocxText(bytes),fixture.expected);assert.equal(createHash('sha256').update(bytes).digest('hex'),fixture.sha256);
});
test('C51: Word text preserves run/entity/paragraph/table order without deleted, hidden, field instructions or linked URLs',async()=>{
 const body='<w:p><w:r><w:t>EXAMPLE 贞</w:t></w:r><w:r><w:t>贞 &amp; 海岸</w:t></w:r></w:p><w:p><w:r><w:t>镜头</w:t><w:tab/><w:t>一</w:t><w:br/><w:t>灯塔</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>人物</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>动机</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:del><w:r><w:delText>EXAMPLE_DELETED</w:delText></w:r></w:del><w:r><w:rPr><w:vanish/></w:rPr><w:t>EXAMPLE_HIDDEN</w:t></w:r><w:r><w:instrText>EXAMPLE_EXECUTE</w:instrText></w:r><w:hyperlink><w:r><w:t>可见标题</w:t></w:r></w:hyperlink></w:p>';
 const expected='EXAMPLE 贞贞 & 海岸\n镜头\t一\n灯塔\n人物\t动机\n可见标题',bytes=exampleDocx(body,{extra:{'word/_rels/document.xml.rels':Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="EXAMPLE" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid/EXAMPLE_HIDDEN" TargetMode="External"/></Relationships>')}});
 assert.equal(parseDocx(bytes),expected);assert.equal(await extractDocxText(bytes),expected);
});
test('C51: OPC main relationship, strict Word namespaces, stored ZIP and UTF16 text are honored without guessing a fixed main path',()=>{
 const text='<w:document xmlns:w="http://purl.oclc.org/ooxml/wordprocessingml/main"><w:body><w:p><w:r><w:t>EXAMPLE 正文😀</w:t></w:r></w:p></w:body></w:document>';
 const bytes=exampleDocx('',{main:'EXAMPLE/body.xml',level:0,mainBytes:Buffer.concat([Buffer.from([255,254]),Buffer.from(text,'utf16le')])});assert.equal(parseDocx(bytes),'EXAMPLE 正文😀');
});
test('C51: invalid namespaces, XML, DTD, unsupported main type and external main parts fail with fixed codes',async()=>{
 const values=[exampleDocx('',{namespace:'https://example.invalid/EXAMPLE_NAMESPACE'}),exampleDocx('',{document:'<EXAMPLE><bad></EXAMPLE>'}),exampleDocx('',{document:'<!DOCTYPE w:document [<!ENTITY EXAMPLE "EXAMPLE_HIDDEN">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&EXAMPLE;</w:t></w:r></w:p></w:body></w:document>'}),exampleDocx('<w:altChunk/>'),exampleDocx('',{types:'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/></Types>'}),exampleDocx('',{rels:'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="EXAMPLE" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="https://example.invalid/EXAMPLE_HIDDEN" TargetMode="External"/></Relationships>'})];
 for(const bytes of values){assert.throws(()=>parseDocx(bytes),error=>['INVALID','UNSUPPORTED'].includes(error.message));await assert.rejects(extractDocxText(bytes),error=>!error.message.includes('EXAMPLE_HIDDEN'));}
});
test('C51: CRC/duplicate/unsafe entries and compressed inflation bombs are refused before indexing',()=>{
 const good=Buffer.from(exampleDocx()),bad=Buffer.from(good),central=bad.indexOf(Buffer.from([80,75,1,2]));bad[central+16]^=1;assert.throws(()=>parseDocx(bad));
 const duplicate=Buffer.from(exampleDocx(undefined,{extra:{'word/EXAMPLE_.xml':Buffer.from('EXAMPLE')}}));for(let at=duplicate.indexOf('word/EXAMPLE_.xml');at>=0;at=duplicate.indexOf('word/EXAMPLE_.xml',at+17))duplicate.write('word/document.xml',at);assert.throws(()=>parseDocx(duplicate));
 assert.throws(()=>parseDocx(exampleDocx(undefined,{extra:{'../EXAMPLE.xml':Buffer.from('EXAMPLE')}})));
 const bomb=Buffer.from(exampleDocx('<w:p><w:r><w:t>'+'A'.repeat(DOCX_LIMITS.xmlBytes+1)+'</w:t></w:r></w:p>'));assert.ok(bomb.length<DOCX_LIMITS.inputBytes);assert.throws(()=>parseDocx(bomb),error=>error.message==='LIMIT');
 let at=0;while((at=bomb.indexOf(Buffer.from([80,75,1,2]),at))>=0){const n=bomb.readUInt16LE(at+28);if(bomb.subarray(at+46,at+46+n).toString()==='word/document.xml'){bomb.writeUInt32LE(1,at+24);break;}at+=46+n;}assert.throws(()=>parseDocx(bomb),error=>error.message==='LIMIT');
});
test('C51: text limit, timeout, revocation and bounded decoder queue reap the fixed child before returning',async()=>{
 await assert.rejects(extractDocxText(exampleDocx('<w:p><w:r><w:t>'+'A'.repeat(DOCX_LIMITS.textBytes+1)+'</w:t></w:r></w:p>')),/2 MiB/);
 await assert.rejects(extractDocxText(exampleDocx(),()=>{},1),/超时/);let calls=0;await assert.rejects(extractDocxText(exampleDocx(),()=>{if(++calls>1)throw Error('EXAMPLE_REVOKED');}),/权限/);
 const pending=Array.from({length:DOCX_LIMITS.pending},()=>extractDocxText(exampleDocx()));await assert.rejects(extractDocxText(exampleDocx()),/正在处理/);assert.equal((await Promise.all(pending)).length,DOCX_LIMITS.pending);
});
