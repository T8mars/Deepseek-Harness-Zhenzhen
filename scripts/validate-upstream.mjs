import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureProfile } from './upstream-inspect.mjs';
import { profileChanges, pendingReviews } from './upstream-policy.mjs';
export async function acknowledgments(workspace) {
  const folder=resolve(workspace,'contracts/ack');let files;
  try{files=await readdir(folder,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}
  const values=[];
  for(const item of files) {
    if(item.isSymbolicLink()||!item.isFile()||!item.name.endsWith('.json'))throw new Error('Only bounded JSON review records belong in contracts/ack.');
    const text=await readFile(resolve(folder,item.name),'utf8');if(text.length>16384)throw new Error('Review record too large.');values.push(JSON.parse(text));
  }
  return values;
}
export function verifyResolvedPins(lock,plan) {
  if(lock.lockfileVersion!==3)throw new Error('Review the changed npm lock format.');
  for(const item of plan.packages){const actual=lock.packages?.[`node_modules/${item.name}`];if(actual?.version!==item.version||actual.integrity!==item.integrity||actual.resolved!==`https://registry.npmjs.org/${item.name}/-/${item.name.split('/')[1]}-${item.version}.tgz`)throw new Error(`Resolved candidate package differs: ${item.name}.`);}
}
export async function validate(workspace=process.cwd()) {
  const read=async path=>JSON.parse(await readFile(resolve(workspace,path),'utf8'));
  let plan;try{plan=await read('UPSTREAM.prepared.json');}catch(error){if(error.code==='ENOENT'){console.log('No prepared DSH candidate to inspect.');return;}throw error;}
  const lock=await read('UPSTREAM.lock.json');if(plan.target.version!==lock.dsh.version||plan.target.commit!==lock.dsh.commit)throw new Error('Prepared candidate differs from the current pin.');
  verifyResolvedPins(await read('package-lock.json'),plan);
  const webRows=await captureProfile(workspace);
  plan.profileChanges=profileChanges(plan.previousBaseline.webRows,webRows);
  const reviews=await acknowledgments(workspace),pending=pendingReviews(plan,reviews);
  plan.review={pending,approved:pending.length===0};
  await writeFile(resolve(workspace,'UPSTREAM.prepared.json'),JSON.stringify(plan,null,2)+'\n');
  await writeFile(resolve(workspace,'contracts/upstream-baseline.json'),JSON.stringify({schemaVersion:1,observationsOnly:true,dsh:{version:plan.target.version,tag:plan.target.tag,commit:plan.target.commit},guides:plan.guides,webRows},null,2)+'\n');
  if(pending.length)throw new Error(`Candidate requires ${pending.length} guide/profile reviews; active installations were not changed.`);
  console.log('Candidate package integrities and guide/profile reviews passed; contracts and isolated installation still required.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await validate();
