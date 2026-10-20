import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, symlinkSync, unlinkSync, rmdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { maintenanceFixture } from '../../../contracts/fixtures/mcp-maintenance.mjs';

test('re-download and verified restore retain program copies/data and require a fresh trust generation',async()=>{
  const fixture=maintenanceFixture(),{market,root,old}=fixture;
  try{
    market.select('memory',old.release.version,root);market.grant('EXAMPLE_OLD_SESSION','memory');
    const data=market.dataPath('memory',root);writeFileSync(data,'EXAMPLE ONLY persistent memory');
    let drained=0;
    await market.repair('memory',old.release.version,async()=>{assert.equal(market.active().length,0);assert.equal(market.isMaintaining('memory'),true);assert.throws(()=>market.select('memory',old.release.version,root),/维护/);drained++;});
    assert.equal(drained,1);assert.equal(market.active().length,0);assert.equal(readFileSync(data,'utf8'),'EXAMPLE ONLY persistent memory');
    const snapshot=market.snapshot(),backup=snapshot.archives[0];assert.equal(backup.programRetained,true);assert.equal(backup.verified,true);assert.notEqual(snapshot.installations[0].digest,old.digest);assert.equal(snapshot.schemaVersion,2);
    market.select('memory',old.release.version,root);assert.throws(()=>market.assertSession('EXAMPLE_OLD_SESSION',root));market.grant('EXAMPLE_NEW_SESSION','memory');
    await market.restoreArchive(backup.archiveId,async()=>{assert.equal(market.active().length,0);});
    assert.equal(market.launch('memory',old.release.version).digest,old.digest);assert.equal(market.active().length,0);assert.equal(readFileSync(data,'utf8'),'EXAMPLE ONLY persistent memory');
    assert.equal(market.snapshot().archives.find(item=>item.archiveId===backup.archiveId).programRetained,false);assert.equal(market.snapshot().archives.length,2);
    fixture.reopen();assert.equal(fixture.market.active().length,0);assert.equal(fixture.market.snapshot().archives.length,2);
  }finally{fixture.dispose();}
});

test('damaged bytes are preserved for inspection and cannot be restored as a trusted copy',async()=>{
  const fixture=maintenanceFixture();
  try{
    fixture.market.select('memory',fixture.old.release.version,fixture.root);
    writeFileSync(fixture.entry,fixture.body+'\n// EXAMPLE_ONLY_DAMAGE\n');
    await fixture.market.repair('memory',fixture.old.release.version,async()=>{});
    const archive=fixture.market.snapshot().archives[0];assert.equal(archive.verified,false);assert.equal(archive.programRetained,true);
    const retained=join(fixture.root,'quarantine',archive.archiveId,'program/node_modules/@modelcontextprotocol/server-memory/dist/index.js');assert.match(readFileSync(retained,'utf8'),/EXAMPLE_ONLY_DAMAGE/);
    fixture.market.select('memory',fixture.old.release.version,fixture.root);
    await assert.rejects(fixture.market.restoreArchive(archive.archiveId,async()=>{}),/没有通过/);assert.equal(fixture.market.active().length,1);
  }finally{fixture.dispose();}
});

test('failed download or changed publication preserves old program files while leaving the connection disabled',async()=>{
  const fixture=maintenanceFixture();
  try{
    fixture.market.select('memory',fixture.old.release.version,fixture.root);fixture.fail=true;
    await assert.rejects(fixture.market.repair('memory',fixture.old.release.version,async()=>{}),/保持停用/);
    assert.equal(fixture.market.launch('memory',fixture.old.release.version).digest,fixture.old.digest);assert.equal(fixture.market.active().length,0);assert.equal(fixture.market.snapshot().archives.length,0);
    fixture.fail=false;fixture.release={...fixture.old.release,gitHead:'2'.repeat(40)};
    await assert.rejects(fixture.market.repair('memory',fixture.old.release.version,async()=>{}));assert.equal(fixture.market.snapshot().archives.length,0);assert.equal(fixture.downloads,1);
  }finally{fixture.dispose();}
});

test('a missing registered directory can be rebuilt without claiming a nonexistent old program was retained',async()=>{
  const fixture=maintenanceFixture();
  try{
    const directory=fixture.market.launch('memory',fixture.old.release.version).directory,absolute=realpathSync.native(directory),rel=relative(realpathSync.native(fixture.root),absolute);
    assert.ok(rel&&!isAbsolute(rel)&&!rel.startsWith('..'));rmSync(absolute,{recursive:true,force:true});
    await fixture.market.repair('memory',fixture.old.release.version,async()=>{});assert.ok(fixture.market.launch('memory',fixture.old.release.version));
    const archive=fixture.market.snapshot().archives[0];assert.equal(archive.programRetained,false);assert.equal(archive.verified,false);
  }finally{fixture.dispose();}
});

test('metadata save failure rolls the file layout back and orphan record discovery never enables the connection',async()=>{
  const fixture=maintenanceFixture();
  try{
    fixture.market.select('memory',fixture.old.release.version,fixture.root);
    const save=fixture.market.save.bind(fixture.market);let writes=0;
    fixture.market.save=()=>{if(++writes===2)throw Error('EXAMPLE_ONLY_STORAGE_FAILURE');save();};
    await assert.rejects(fixture.market.repair('memory',fixture.old.release.version,async()=>{}));fixture.market.save=save;
    assert.equal(fixture.market.launch('memory',fixture.old.release.version).digest,fixture.old.digest);assert.equal(readFileSync(fixture.entry,'utf8'),fixture.body);assert.equal(fixture.market.active().length,0);
    fixture.reopen();assert.equal(fixture.market.active().length,0);assert.equal(fixture.market.snapshot().archives[0].programRetained,false);
  }finally{fixture.dispose();}
});

test('interrupted move recovery discovers the retained record and can restore its original matching bytes',async()=>{
  const fixture=maintenanceFixture();
  try{
    fixture.market.select('memory',fixture.old.release.version,fixture.root);fixture.market.disable('memory');
    const source=fixture.market.launch('memory',fixture.old.release.version).directory,id=randomUUID(),archive=join(fixture.root,'quarantine',id);
    mkdirSync(archive,{recursive:true});writeFileSync(join(archive,'record.json'),JSON.stringify({archiveId:id,installation:fixture.old,retainedAt:new Date().toISOString(),programRetained:true,verified:true}));
    const relativeSource=relative(fixture.root,realpathSync.native(source));assert.ok(relativeSource&&!isAbsolute(relativeSource)&&!relativeSource.startsWith('..'));
    renameSync(source,join(archive,'program'));fixture.reopen();assert.equal(fixture.market.snapshot().archives.length,1);assert.equal(fixture.market.active().length,0);
    await fixture.market.restoreArchive(id,async()=>{});assert.equal(fixture.market.launch('memory',fixture.old.release.version).digest,fixture.old.digest);assert.equal(fixture.market.active().length,0);
  }finally{fixture.dispose();}
});

test('maintenance refuses linked quarantine destinations without touching the target directory',async()=>{
  const fixture=maintenanceFixture(),temp=realpathSync.native(tmpdir()),outside=mkdtempSync(join(temp,'dsh-zhen-mcp-outside-')),link=join(fixture.root,'quarantine');
  try{
    writeFileSync(join(outside,'EXAMPLE_SENTINEL.txt'),'EXAMPLE ONLY outside data');symlinkSync(outside,link,process.platform==='win32'?'junction':'dir');
    await assert.rejects(fixture.market.repair('memory',fixture.old.release.version,async()=>{}));
    assert.equal(readFileSync(join(outside,'EXAMPLE_SENTINEL.txt'),'utf8'),'EXAMPLE ONLY outside data');assert.equal(readFileSync(fixture.entry,'utf8'),fixture.body);
  }finally{
    try{unlinkSync(link);}catch(error){if(process.platform==='win32'&&error.code==='EPERM')rmdirSync(link);else if(error.code!=='ENOENT')throw error;}
    fixture.dispose();const absolute=realpathSync.native(outside),rel=relative(temp,absolute);assert.ok(rel&&!isAbsolute(rel)&&!rel.startsWith('..')&&!rel.includes('/')&&!rel.includes('\\'));rmSync(absolute,{recursive:true,force:true});
  }
});
