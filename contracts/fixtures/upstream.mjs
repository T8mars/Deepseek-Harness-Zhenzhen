// EXAMPLE ONLY: synthetic versions, commits and integrity values for policy tests.
import {upgradedManifests,guideChanges,profileChanges,requiredPackages,sha256} from '../../scripts/upstream-policy.mjs';
export const OLD='0.2.1-rc.2',NEXT='0.2.2-rc.1';
export const integrity=value=>'sha512-'+Buffer.alloc(64,value).toString('base64');
export function publication(name,version=NEXT){return{name,version,license:'MIT',repository:{url:'git+https://github.com/deepseek-ai/deepseek-harness.git'},dependencies:{'@deepseek-ai/cordis':'~4.0.5'},dist:{integrity:integrity(2),tarball:`https://registry.npmjs.org/${name}/-/${name.split('/')[1]}-${version}.tgz`}};}
export function proposalFixture(){
  const root={name:'EXAMPLE_ONLY_ROOT',version:'0.1.0',private:true,scripts:{test:'EXAMPLE_ONLY_TEST'},dependencies:{'@deepseek-ai/dsh':OLD},devDependencies:{'@deepseek-ai/dsh-tools':OLD,'@deepseek-ai/cordis':'4.0.5'},overrides:{'@deepseek-ai/cordis':'4.0.5'}};
  const plugin={name:'dsh-zhen',version:'0.1.0',engines:{node:'>=22.19.0',dsh:OLD},peerDependencies:{'@deepseek-ai/dsh-agent':OLD,'@deepseek-ai/cordis':'4.0.5'}};
  const lock={schemaVersion:1,dsh:{version:OLD,tag:`dsh-v${OLD}`,commit:'1'.repeat(40),registryIntegrity:integrity(1),runtimeVerified:true}};
  const compatibility={version:OLD,hosts:[OLD]};
  const compatibilityText=`export const SUPPORTED_DSH = '${OLD}';\nexport const INSTRUCTION_HOSTS: readonly string[] = ['${OLD}'];\n`;
  const baseline={schemaVersion:1,observationsOnly:true,dsh:{version:OLD,tag:`dsh-v${OLD}`,commit:lock.dsh.commit},guides:[{path:`docs/upgrade-guide/v${OLD}/EXAMPLE_OLD/guide.md`,sha:'a'.repeat(40)}],webRows:[{id:'llm-pi-ai',name:'EXAMPLE_ONLY_PLUGIN',keys:['providers']}]};
  const target={version:NEXT,tag:`dsh-v${NEXT}`,commit:'2'.repeat(40),integrity:integrity(2)};
  const next=upgradedManifests(root,plugin,lock,compatibility,target);
  const packages=requiredPackages(root,plugin).map(name=>({name,version:NEXT,integrity:integrity(2)}));
  const nextBaseline={...baseline,dsh:{version:NEXT,tag:target.tag,commit:target.commit},guides:[...baseline.guides,{path:`docs/upgrade-guide/v${NEXT}/EXAMPLE_NEW/guide.md`,sha:'b'.repeat(40)}],webRows:[{...baseline.webRows[0],keys:['providers','EXAMPLE_NEW_KEY']}]};
  const plan={schemaVersion:1,state:'prepared',from:lock.dsh,target,packages,previousBaseline:baseline,guides:nextBaseline.guides,guideChanges:guideChanges(baseline.guides,nextBaseline.guides),profileChanges:profileChanges(baseline.webRows,nextBaseline.webRows)};
  const runtime={dsh:OLD,canvas:'3.3.6',zhen:'0.1.0',gateway:'f'.repeat(64)};
  const npmLock=(root,plugin,version)=>({name:root.name,version:root.version,lockfileVersion:3,packages:{'':{dependencies:root.dependencies,devDependencies:root.devDependencies},'packages/dsh-zhen':{peerDependencies:plugin.peerDependencies},'node_modules/dsh-zhen':{link:true,resolved:'packages/dsh-zhen'},...Object.fromEntries(packages.map(item=>[`node_modules/${item.name}`,{version,integrity:integrity(version===OLD?1:2),resolved:`https://registry.npmjs.org/${item.name}/-/${item.name.split('/')[1]}-${version}.tgz`}] ))}});
  const serialize=value=>JSON.stringify(value,null,2)+'\n';
  const base=new Map(Object.entries({'package.json':serialize(root),'packages/dsh-zhen/package.json':serialize(plugin),'UPSTREAM.lock.json':serialize(lock),'packages/dsh-zhen/src/compatibility.ts':compatibilityText,'contracts/upstream-baseline.json':serialize(baseline),'packages/dsh-zhen/catalog/runtime.json':serialize(runtime),'package-lock.json':serialize(npmLock(root,plugin,OLD))}));
  const record={schemaVersion:1,activation:'requires-contracts-and-review',candidates:[{id:'dsh',current:OLD,available:NEXT,revision:target.integrity,url:'https://github.com/deepseek-ai/deepseek-harness/tags'}]};
  const changed={'package.json':serialize(next.root),'packages/dsh-zhen/package.json':serialize(next.plugin),'UPSTREAM.lock.json':serialize(next.lock),'packages/dsh-zhen/src/compatibility.ts':next.compatibility,'contracts/upstream-baseline.json':serialize(nextBaseline),'packages/dsh-zhen/catalog/runtime.json':serialize({...runtime,dsh:NEXT}),'package-lock.json':serialize(npmLock(next.root,next.plugin,NEXT)),'UPSTREAM.candidate.json':serialize(record),'UPSTREAM.prepared.json':serialize(plan)};
  const proposal={schemaVersion:1,baseCommit:'c'.repeat(40),validation:{prepare:'success',dependencies:'success',review:'failure',contracts:'failure',installation:'skipped'},files:Object.entries(changed).map(([path,content])=>({path,before:base.has(path)?sha256(base.get(path)):'',content}))};
  return{root,plugin,lock,compatibility,baseline,target,plan,base,proposal,readBase:path=>base.get(path)??null};
}
