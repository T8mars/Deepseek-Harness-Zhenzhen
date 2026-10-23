import { readFile, writeFile, mkdir, appendFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { releaseCommit, upgradeGuides, inspectUpgrade, captureProfile } from './upstream-inspect.mjs';
import { readCompatibility, upgradedManifests, sha256 } from './upstream-policy.mjs';
import {createUpstreamMetadataFetcher} from './upstream-metadata.mjs';
const parse = text=>JSON.parse(text);
export async function prepare({baselineOnly=false,apply=false,workspace=process.cwd(),fetcher=fetch}={}) {
  const read = path=>readFile(resolve(workspace,path),'utf8');
  const paths=['package.json','packages/dsh-zhen/package.json','UPSTREAM.lock.json','packages/dsh-zhen/src/compatibility.ts'];
  const texts=await Promise.all(paths.map(read)); const [root,plugin,lock]=texts.slice(0,3).map(parse), compatibility=readCompatibility(texts[3]);
  if(baselineOnly) {
    const installed=parse(await read('node_modules/@deepseek-ai/dsh/package.json'));
    if(installed.version!==lock.dsh.version) throw new Error('Installed runtime differs from the pinned baseline.');
    const commit=await releaseCommit(lock.dsh.version,fetcher); if(commit!==lock.dsh.commit) throw new Error('Baseline tag moved.');
    const [guides,webRows]=await Promise.all([upgradeGuides(commit,fetcher),captureProfile(workspace)]);
    const baseline={schemaVersion:1,observationsOnly:true,dsh:{version:lock.dsh.version,tag:lock.dsh.tag,commit},guides,webRows};
    let previous;try{previous=parse(await read('contracts/upstream-baseline.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(previous&&!isDeepStrictEqual(previous,baseline))throw new Error('Existing upstream observations changed. Use candidate review; do not silently replace the baseline.');
    await writeFile(resolve(workspace,'contracts/upstream-baseline.json'),JSON.stringify(baseline,null,2)+'\n');
    console.log(`Observed ${guides.length} upgrade guides and ${webRows.length} Web profile rows; this does not mark guide applicability reviewed.`); return baseline;
  }
  let baseline;try{baseline=parse(await read('contracts/upstream-baseline.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const plan=await inspectUpgrade(root,plugin,lock,baseline,fetcher);
  await mkdir(resolve(workspace,'.runtime'),{recursive:true});
  await writeFile(resolve(workspace,'.runtime/upstream-plan.json'),JSON.stringify(plan,null,2)+'\n');
  if(plan.state==='unchanged'){console.log('DSH next matches the exact pinned version/commit/integrity; no dependency changed.');return plan;}
  if(!apply){console.log(`Prepared DSH ${plan.target.version}; ${plan.packages.length} exact packages and ${plan.guideChanges.length} changed guides. Use --apply only in a clean dedicated checkout.`);return plan;}
  const localOnly=new Set(['roadmap.md','skill.md','agents.md','anents.md']);
  if((await readdir(workspace)).some(name=>localOnly.has(name.normalize('NFKC').toLowerCase())))throw new Error('Prepare upgrade code in a separate clean checkout without local research files.');
  const dirty=execFileSync('git',['-C',workspace,'status','--porcelain','--untracked-files=all'],{encoding:'utf8'}).split('\n').filter(Boolean);
  if(dirty.some(line=>line.slice(3).trim()!=='UPSTREAM.candidate.json'))throw new Error('Upgrade preparation requires a clean dedicated checkout.');
  const next=upgradedManifests(root,plugin,lock,compatibility,plan.target);
  const values=[next.root,next.plugin,next.lock].map(value=>JSON.stringify(value,null,2)+'\n').concat(next.compatibility);
  plan.baseFiles=Object.fromEntries(paths.map((path,index)=>[path,sha256(texts[index])]));
  plan.previousBaseline=baseline;
  // All metadata was validated before the first mutation. No dependency code is
  // installed/executed here; the validation job runs that separately without write credentials.
  for(let index=0;index<paths.length;index++)await writeFile(resolve(workspace,paths[index]),values[index]);
  await writeFile(resolve(workspace,'UPSTREAM.prepared.json'),JSON.stringify(plan,null,2)+'\n');
  console.log(`Applied exact candidate pins for ${plan.target.version}; installation, contracts and review remain required.`);return plan;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2);if(args.some(value=>!['--baseline','--apply'].includes(value))||args.includes('--baseline')&&args.includes('--apply'))throw new Error('Usage: prepare-upstream.mjs [--baseline | --apply]');const plan=await prepare({baselineOnly:args.includes('--baseline'),apply:args.includes('--apply'),fetcher:createUpstreamMetadataFetcher({token:process.env.UPSTREAM_METADATA_TOKEN})});if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`changed=${plan.state==='prepared'&&args.includes('--apply')}\n`);}
