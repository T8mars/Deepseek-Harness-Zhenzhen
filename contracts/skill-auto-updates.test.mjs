import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SkillRegistry from '@deepseek-ai/dsh-skill';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { readBundledCatalog, skillBody } from '../packages/dsh-zhen/lib/market.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';

test('C17: actual Host/SkillRegistry keeps live text and personal forks while trusted updates activate only at the next Host start',async()=>{
  const temp=realpathSync.native(tmpdir()),home=mkdtempSync(join(temp,'dsh-zhen-skill-auto-host-'));
  const previous=process.env.DSH_HOME,fetcher=globalThis.fetch;process.env.DSH_HOME=home;
  const base=readBundledCatalog()[0],parts=base.manifest.version.split('.').map(BigInt),version=`${parts[0]}.${parts[1]+1n}.0`;
  const content=base.content+'\nEXAMPLE ONLY: trusted new creative instructions.\n',update={manifest:{...base.manifest,version,digest:createHash('sha256').update(content).digest('hex')},content};
  const revision='c'.repeat(40);let requests=0,credentialReads=0,ctx;
  globalThis.fetch=async(url,options)=>{
    requests++;assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(Object.keys(options.headers).some(key=>key.toLowerCase()==='authorization'),false);
    if(url==='https://api.github.com/repos/T8mars/Deepseek-Harness-Zhenzhen/commits/main')return Response.json({sha:revision});
    assert.equal(url,`https://raw.githubusercontent.com/T8mars/Deepseek-Harness-Zhenzhen/${revision}/market/skills.v1.json`);
    return Response.json({schemaVersion:1,publisher:'T8mars/Deepseek-Harness-Zhenzhen',skills:[update]});
  };
  const boot=async()=>{const context=new Context();context.provide('credentials',{describe:async ref=>{assert.equal(ref,'DSH_ZHEN_GITHUB_TOKEN');return{configured:false,writable:true};},resolve:async()=>{credentialReads++;throw Error('EXAMPLE_ONLY_CREDENTIAL_NOT_NEEDED');}});await context.plugin(SkillRegistry);await context.plugin(ZhenService);return context;};
  try{
    ctx=await boot();const service=ctx.get('zhen');
    assert.equal(service.marketAutoPolicy().enabled,false);
    service.marketSelect(base.manifest.id,base.manifest.digest,base.manifest.version);
    const personal=service.marketFork(base.manifest.id,base.manifest.digest,'EXAMPLE ONLY: personal wording must remain independent.',base.manifest.version);
    const original=await ctx.skills.get(base.manifest.id),personalBefore=await ctx.skills.get(personal);
    service.marketAutoUpdates(true);await service.marketFeedCheck();
    assert.equal(requests,2);assert.equal(service.marketAutoPolicy().pendingAutomatic,1);
    assert.equal((await ctx.skills.get(base.manifest.id)).content,original.content);
    const item=service.marketList().find(item=>item.manifest.id===base.manifest.id);
    assert.equal(item.pendingMode,'automatic');assert.equal(item.pendingRevision,revision);assert.equal(item.installedVersion,base.manifest.version);
    const codec=TYPERT_REMOTE.methods['zhen/marketAutoPolicy'].result.create();assert.deepEqual(codec.parse(service.marketAutoPolicy()),service.marketAutoPolicy());
    await ctx.fiber.dispose();ctx=undefined;ctx=await boot();
    const after=ctx.get('zhen');assert.equal(after.marketList().find(item=>item.manifest.id===base.manifest.id).installedVersion,version);
    assert.equal((await ctx.skills.get(base.manifest.id)).content,skillBody(content));assert.equal((await ctx.skills.get(personal)).content,personalBefore.content);
    assert.equal(after.marketVersions(base.manifest.id).length,2);assert.equal(after.marketAutoPolicy().enabled,true);assert.equal(after.marketAutoPolicy().pendingAutomatic,0);assert.equal(requests,2);assert.equal(credentialReads,0);
    after.marketPauseAuto(base.manifest.id,true);assert.equal(after.marketList().find(item=>item.manifest.id===base.manifest.id).automaticPaused,true);
    after.marketAutoUpdates(false);assert.equal(after.marketAutoPolicy().enabled,false);
  }finally{
    await ctx?.fiber.dispose();globalThis.fetch=fetcher;if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;
    const absolute=realpathSync.native(home),rel=relative(temp,absolute);if(!rel||isAbsolute(rel)||rel.startsWith('..')||rel.includes('/')||rel.includes('\\'))throw Error('Host cleanup refused.');rmSync(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});

test('C17: public policy codecs accept an explicit boolean and never an arbitrary source or expanded capability class',()=>{
  const enable=TYPERT_REMOTE.methods['zhen/marketAutoUpdates'].input({strict:true}).create();
  assert.deepEqual(enable.parse({enabled:true}),{enabled:true});assert.throws(()=>enable.parse({enabled:'true'}));assert.throws(()=>enable.parse({enabled:true,source:'https://example.invalid/EXAMPLE_ONLY'}));
  const pause=TYPERT_REMOTE.methods['zhen/marketPauseAuto'].input({strict:true}).create();
  assert.throws(()=>pause.parse({id:'../EXAMPLE_ONLY',paused:true}));assert.throws(()=>pause.parse({id:'zhen-example',paused:true,permissions:['network']}));
});
