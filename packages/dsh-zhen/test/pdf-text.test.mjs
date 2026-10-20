import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {extractPdfPages,PDF_TEXT_LIMITS} from '../lib/pdf-text.js';
import {examplePdf} from '../../../contracts/fixtures/pdf-document.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('PDF decoder preserves Chinese page identity and input bytes through the actual isolated process',async()=>{
 const bytes=examplePdf(['EXAMPLE ONLY\n示例角色蓝桥带着纸灯。','EXAMPLE ONLY\n示例场景雨夜古桥。'],{compress:true}),digest=sha(bytes),pages=await extractPdfPages(bytes);
 assert.equal(pages.length,2);assert.deepEqual(pages.map(p=>p.page),[1,2]);assert.match(pages[0].text,/蓝桥/);assert.match(pages[1].text,/雨夜古桥/);assert.equal(sha(bytes),digest);
});
test('PDF decoder reads a predefined Chinese CMap using only local package resources',async()=>{
 const pages=await extractPdfPages(examplePdf(['示例资料：雨夜古桥，蓝桥持灯。'],{predefinedCMap:true}));assert.equal(pages.length,1);assert.match(pages[0].text,/雨夜古桥/);
});
test('PDF decoder distinguishes no-text pages from malformed input and enforces page/input/output limits',async()=>{
 assert.deepEqual(await extractPdfPages(examplePdf([''])),[]);assert.deepEqual(await extractPdfPages(examplePdf([''],{imageOnly:true})),[]);await assert.rejects(extractPdfPages(Buffer.from('%PDF-1.7\nEXAMPLE_INVALID')));await assert.rejects(extractPdfPages(Buffer.alloc(PDF_TEXT_LIMITS.inputBytes+1)));
 await assert.rejects(extractPdfPages(examplePdf(Array.from({length:201},()=>''))),/200 页/);
 const inflated=examplePdf(['𠮷'.repeat(530000)],{compress:true,fontSize:0.0005,lineStep:1});assert.ok(inflated.length<PDF_TEXT_LIMITS.inputBytes);await assert.rejects(extractPdfPages(inflated),/提取文字超出 2 MiB/);
});
test('PDF timeout waits for child closure and releases the parser queue for the next real decode',async()=>{
 await assert.rejects(extractPdfPages(examplePdf(['EXAMPLE_TIMEOUT']),()=>{},1),/超时/);const pages=await extractPdfPages(examplePdf(['EXAMPLE_AFTER_TIMEOUT']));assert.equal(pages.length,1);assert.match(pages[0].text,/EXAMPLE_AFTER_TIMEOUT/);
});
test('PDF cancellation rejects all extracted data after authorization is withdrawn',async()=>{
 let allowed=true;const work=extractPdfPages(examplePdf(Array.from({length:20},()=>('示例权限').repeat(100))),()=>{if(!allowed)throw Error('EXAMPLE_REVOKED');});setTimeout(()=>{allowed=false;},5);await assert.rejects(work,/权限|REVOKED/);assert.equal((await extractPdfPages(examplePdf(['EXAMPLE_FRESH']))).length,1);
});
test('password-protected original PDF is refused without prompting or reading any credential',async()=>{
 const fixture=JSON.parse(readFileSync(new URL('../../../contracts/fixtures/pdf-encrypted.json',import.meta.url),'utf8')),bytes=Buffer.from(fixture.base64,'base64'),digest=sha(bytes);assert.ok(fixture.password.startsWith('EXAMPLE_'));await assert.rejects(extractPdfPages(bytes),/需要密码/);assert.equal(sha(bytes),digest);
});
