import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {McpMarket} from '../packages/dsh-zhen/lib/mcp-market.js';import {MCP_RECIPES} from '../packages/dsh-zhen/lib/mcp-market-schema.js';
import {fixtureInstallation} from './fixtures/mcp-market.mjs';import {ownedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';
const metadata=(id,extra={})=>{const r=MCP_RECIPES[id];return{name:r.package,version:'2026.9.1',repository:{url:'git+https://github.com/modelcontextprotocol/servers.git'},bin:{['mcp-server-'+id]:'dist/index.js'},dist:{tarball:'https://registry.npmjs.org/'+r.package+'/-/server-'+id+'-2026.9.1.tgz',integrity:r.integrity},gitHead:'2'.repeat(40),engines:{node:'>=22'},license:'SEE LICENSE IN LICENSE',...extra};};
const idOf=url=>String(url).includes('server-memory')?'memory':'filesystem';
async function fixture(work){const base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-mcp-guidance-EXAMPLE-'))),lease=ownedTempCleanup(base,root,'dsh-mcp-guidance-EXAMPLE-');let market,downloads=0;try{const store=join(root,'mcp');fixtureInstallation(store);const state={fetcher:async(url)=>new Response(JSON.stringify(metadata(idOf(url))),{status:200})};market=new McpMarket(store,(...args)=>state.fetcher(...args),async()=>{downloads++;throw Error('EXAMPLE_INSTALL_MUST_NOT_RUN');});market.select('memory','2026.8.31',root);await work({market,state,root,store,downloads:()=>downloads});}finally{market?.close();await lease.cleanup();}}

test('C213: current public MCP metadata explains Node24 and missing source revision while preserving the working selection and old state layout',()=>fixture(async({market,state,store,downloads})=>{
 state.fetcher=async(url)=>{const id=idOf(url),body=metadata(id,{version:id==='memory'?'2.0.0':'2.0.1',engines:{node:'>=24'}});delete body.gitHead;return new Response(JSON.stringify(body),{status:200});};
 const before=market.snapshot(),diskBefore=JSON.parse(readFileSync(join(store,'market.json'),'utf8')),after=await market.check();assert.deepEqual(after.selections,before.selections);assert.deepEqual(after.installations,before.installations);assert.equal(after.candidates.length,0);assert.equal(downloads(),0);
 for(const text of ['项目记忆','项目文件','2.0.0','2.0.1','>=24',process.versions.node,'固定提交','当前版本'])assert.ok(after.message.includes(text),text+': '+after.message);assert.ok(after.message.length<=300);
 const diskAfter=JSON.parse(readFileSync(join(store,'market.json'),'utf8'));assert.deepEqual(Object.keys(diskAfter).sort(),Object.keys(diskBefore).sort());for(const key of Object.keys(diskBefore).filter(key=>!['checkedAt','message'].includes(key)))assert.deepEqual(diskAfter[key],diskBefore[key],key);
 await assert.rejects(market.install('memory','2.0.0',MCP_RECIPES.memory.integrity));assert.equal(downloads(),0);assert.deepEqual(market.snapshot().selections,before.selections);
}));

test('C213: untrusted repository metadata is refused with a safe source-specific explanation and cannot inject registry text into saved notices',()=>fixture(async({market,state,downloads})=>{
 state.fetcher=async(url)=>new Response(JSON.stringify(metadata(idOf(url),{repository:{url:'https://EXAMPLE_UNTRUSTED.invalid/EXAMPLE_REGISTRY_PRIVATE_MESSAGE'},engines:{node:'EXAMPLE_REGISTRY_PRIVATE_MESSAGE'}})),{status:200});
 const before=market.snapshot(),after=await market.check();assert.deepEqual(after.candidates,before.candidates);assert.deepEqual(after.selections,before.selections);assert.match(after.message,/项目记忆.*来源/);assert.match(after.message,/项目文件.*来源/);assert.doesNotMatch(after.message,/EXAMPLE_REGISTRY_PRIVATE_MESSAGE|EXAMPLE_UNTRUSTED/);assert.equal(downloads(),0);
}));

test('C213: one unavailable source leaves the other usable and explicit rechecking clears the old network diagnosis without selecting or downloading',()=>fixture(async({market,state,downloads})=>{
 let failing=true,calls=0;state.fetcher=async(url)=>{calls++;if(failing&&idOf(url)==='filesystem')throw Error('EXAMPLE_PRIVATE_NETWORK_DETAIL');return new Response(JSON.stringify(metadata(idOf(url))),{status:200});};
 const before=market.snapshot(),first=await market.check();assert.equal(calls,2);assert.deepEqual(first.candidates.map(x=>x.id),['memory']);assert.match(first.message,/项目文件.*(?:网络|连接|读取)/);assert.doesNotMatch(first.message,/EXAMPLE_PRIVATE_NETWORK_DETAIL/);assert.deepEqual(first.selections,before.selections);
 failing=false;const second=await market.check();assert.equal(calls,4);assert.equal(second.candidates.length,2);assert.doesNotMatch(second.message,/暂时无法|网络|来源校验未通过/);assert.deepEqual(second.selections,before.selections);assert.equal(downloads(),0);
}));

test('C213: cancellation cannot replace an existing update diagnosis or modify selected versions',()=>fixture(async({market,state})=>{
 const before=market.snapshot(),controller=new AbortController();state.fetcher=async(_url,options)=>{await new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(Error('EXAMPLE_ABORT')),{once:true});});};
 const pending=market.check(controller.signal);controller.abort();assert.deepEqual(await pending,before);assert.deepEqual(market.snapshot(),before);
}));

test('C213: changed metadata for an already-known version identifies the affected tool and preserves its reviewed candidate and current program',()=>fixture(async({market,state,downloads})=>{
 const initial=await market.check(),original=initial.candidates.find(x=>x.id==='memory');assert.ok(original);state.fetcher=async(url)=>{const id=idOf(url),body=metadata(id);if(id==='memory')body.gitHead='3'.repeat(40);return new Response(JSON.stringify(body),{status:200});};
 const changed=await market.check();assert.deepEqual(changed.candidates.find(x=>x.id==='memory'),original);assert.deepEqual(changed.selections,initial.selections);assert.deepEqual(changed.installations,initial.installations);assert.match(changed.message,/项目记忆.*(?:校验信息|来源信息).*变化/);assert.equal(downloads(),0);
}));

test('C213: a complete publication with an incompatible runtime remains metadata only and explains why it cannot be installed',()=>fixture(async({market,state,downloads})=>{
 state.fetcher=async(url)=>new Response(JSON.stringify(metadata(idOf(url),{engines:{node:'>=999'}})),{status:200});const before=market.snapshot(),after=await market.check();assert.equal(after.candidates.length,2);assert.match(after.message,/项目记忆.*需要 Node >=999/);assert.ok(after.message.includes(process.versions.node));await assert.rejects(market.install('memory','2026.9.1',MCP_RECIPES.memory.integrity));assert.equal(downloads(),0);assert.deepEqual(market.snapshot().selections,before.selections);assert.deepEqual(market.snapshot().installations,before.installations);
}));
