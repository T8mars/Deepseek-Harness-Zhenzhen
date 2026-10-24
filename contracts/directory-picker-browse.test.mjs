import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {Context} from '@deepseek-ai/cordis';
import BrowseDirectoryPicker from '@deepseek-ai/dsh-host-directory-picker-browse';
import {resolveDirectoryPickerBackend} from '@deepseek-ai/dsh-host-directory-picker-auto';
import {PINNED_DSH_VERSION} from './fixtures/pinned-runtime.mjs';
import {ownedTempCleanup,withOwnedTempCleanup} from './fixtures/owned-temp-cleanup.mjs';
import {requiredPackages} from '../scripts/upstream-policy.mjs';

const require=createRequire(import.meta.url);
test('C206: Web directory-picker faces are exact published peers with the documented browser surface',async()=>{
  const root=JSON.parse(await readFile('package.json','utf8')),bundle=JSON.parse(await readFile('packages/dsh-zhen/package.json','utf8')),lock=JSON.parse(await readFile('package-lock.json','utf8')),prepared=JSON.parse(await readFile('UPSTREAM.prepared.json','utf8'));
  assert.deepEqual(prepared.packages.map(row=>row.name).sort(),requiredPackages(root,bundle));
  for(const row of prepared.packages){assert.equal(row.version,PINNED_DSH_VERSION);assert.equal(row.integrity,lock.packages['node_modules/'+row.name].integrity);}
  for(const name of ['@deepseek-ai/dsh-host-directory-picker-browse','@deepseek-ai/dsh-client-ui-directory-picker-browse']){
    const installed=JSON.parse(await readFile(require.resolve(name+'/package.json'),'utf8'));
    assert.equal(root.devDependencies[name],PINNED_DSH_VERSION);assert.equal(bundle.peerDependencies[name],PINNED_DSH_VERSION);assert.equal(installed.version,PINNED_DSH_VERSION);assert.equal(lock.packages['node_modules/'+name].version,PINNED_DSH_VERSION);
    if(name.includes('client-ui')){assert.equal(installed.dsh.client.platform,'web');assert.ok(installed.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-workspace'));assert.ok(installed.dsh.client.inject.includes('@deepseek-ai/dsh-api-remotes'));}
  }
});

test('C206: Windows loopback auto would use an OS chooser; the composed published browse backend lists only the selected EXAMPLE level',async()=>{
  assert.equal(resolveDirectoryPickerBackend({bindHost:'127.0.0.1',allowsRemoteAuthorities:false,platform:'win32',ssh:false,env:{},linuxChooser:false}),'native');
  const base=await realpath(tmpdir()),home=await realpath(await mkdtemp(join(base,'dsh-browse-picker-EXAMPLE-'))),lease=ownedTempCleanup(base,home,'dsh-browse-picker-EXAMPLE-',{budgetMs:30000});
  await withOwnedTempCleanup(lease,async()=>{
    await mkdir(join(home,'EXAMPLE_WORKSPACE'));await writeFile(join(home,'EXAMPLE_IGNORE.txt'),'EXAMPLE file content never read by directory picker');
    const ctx=new Context();await ctx.plugin(BrowseDirectoryPicker);
    try{
      const picker=ctx.get('directoryPicker'),capability=picker.capability();assert.equal(capability.kind,'browse');assert.equal('pick' in capability,false);assert.equal(picker.capability(),capability);
      const listing=await capability.list(home);assert.equal(listing.path,home);assert.equal(listing.truncated,false);assert.deepEqual(listing.entries.map(row=>({name:row.name,path:row.path})),[{name:'EXAMPLE_WORKSPACE',path:join(home,'EXAMPLE_WORKSPACE')}]);assert.equal(listing.crumbs.at(-1).path,home);assert.equal(await readFile(join(home,'EXAMPLE_IGNORE.txt'),'utf8'),'EXAMPLE file content never read by directory picker');
      await assert.rejects(capability.list('EXAMPLE_RELATIVE'),error=>error.code==='directory-unreadable');
    }finally{await ctx.fiber.dispose();}
  });
});
