import { readFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseDocument } from 'yaml';
import semver from 'semver';
import { readPublic } from '../packages/dsh-zhen/lib/updates.js';
import { mcpChildEnvironment } from '../packages/dsh-zhen/lib/mcp-market.js';
import { canonicalVersion, newerVersion, requiredPackages, validatePublication, guideChanges, profileFacts } from './upstream-policy.mjs';
const execute = promisify(execFile), api = 'https://api.github.com/repos/deepseek-ai/deepseek-harness';
async function json(url, fetcher, signal) { return JSON.parse(await readPublic(url, fetcher, signal, 2 * 1024 * 1024)); }
export async function releaseCommit(version, fetcher = fetch, signal) {
  if (!canonicalVersion(version)) throw new Error('DSH version refused.');
  const tag = await json(`${api}/git/ref/tags/dsh-v${version}`, fetcher, signal);
  if (tag.ref !== `refs/tags/dsh-v${version}`) throw new Error('DSH tag identity refused.');
  let object = tag.object;
  for (let depth = 0; object?.type === 'tag' && depth < 3; depth++) { if(!/^[a-f0-9]{40}$/.test(object.sha))throw new Error('Annotated tag identity refused.'); object = (await json(`${api}/git/tags/${object.sha}`, fetcher, signal)).object; }
  if (object?.type !== 'commit' || !/^[a-f0-9]{40}$/.test(object.sha)) throw new Error('DSH release commit refused.');
  return object.sha;
}
export async function upgradeGuides(commit, fetcher = fetch, signal) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('DSH commit refused.');
  const tree = async (sha, recursive = false) => { const body = await json(`${api}/git/trees/${sha}${recursive ? '?recursive=1' : ''}`, fetcher, signal); if (body.truncated !== false || !Array.isArray(body.tree) || body.tree.length > 5000) throw new Error('Upgrade guide tree incomplete.'); return body.tree; };
  const docs = (await tree(commit)).find(item=>item.path==='docs'&&item.type==='tree');
  if (!docs || !/^[a-f0-9]{40}$/.test(docs.sha)) throw new Error('Upgrade guide root moved.');
  const folder = (await tree(docs.sha)).find(item=>item.path==='upgrade-guide'&&item.type==='tree');
  if (!folder || !/^[a-f0-9]{40}$/.test(folder.sha)) throw new Error('Upgrade guide root moved.');
  return (await tree(folder.sha, true)).filter(item=>item.type==='blob'&&/^v[^/]+\/.+\/guide\.md$/.test(item.path)).map(item=>{
    if (!/^v[A-Za-z0-9.-]+\/[A-Za-z0-9_./-]+\/guide\.md$/.test(item.path) || item.path.split('/').includes('..') || !/^[a-f0-9]{40}$/.test(item.sha)) throw new Error('Upgrade guide identity refused.');
    return {path:`docs/upgrade-guide/${item.path}`,sha:item.sha};
  }).sort((a,b)=>a.path.localeCompare(b.path));
}
export async function inspectUpgrade(root, plugin, lock, baseline, fetcher = fetch, signal, requestedVersion = '') {
  if (requestedVersion && !canonicalVersion(requestedVersion)) throw new Error('Requested DSH version refused.');
  const metadata = await json(`https://registry.npmjs.org/@deepseek-ai%2Fdsh/${requestedVersion || 'next'}`, fetcher, signal);
  if (requestedVersion && metadata.version !== requestedVersion) throw new Error('Requested DSH publication changed identity.');
  const version = metadata.version, main = validatePublication('@deepseek-ai/dsh', version, metadata);
  const commit = await releaseCommit(version, fetcher, signal);
  if (version === lock.dsh.version) {
    if (commit !== lock.dsh.commit || main.integrity !== lock.dsh.registryIntegrity) throw new Error('The pinned DSH version changed identity; automatic preparation refused.');
    return {schemaVersion:1,state:'unchanged',from:lock.dsh,target:{version,tag:`dsh-v${version}`,commit,integrity:main.integrity},packages:[],guideChanges:[]};
  }
  if (!newerVersion(version, lock.dsh.version)) throw new Error('Automatic DSH downgrade refused.');
  if (!baseline || baseline.dsh.commit !== lock.dsh.commit || baseline.dsh.version !== lock.dsh.version) throw new Error('Capture and review the current upstream baseline first.');
  const names = requiredPackages(root,plugin), packages = [];
  for (let start=0;start<names.length;start+=6) {
    const batch = await Promise.all(names.slice(start,start+6).map(async name=>{
      const data = name === main.name ? metadata : await json(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`,fetcher,signal);
      const publication = validatePublication(name,version,data);
      if (data.license !== 'MIT') throw new Error(`Review changed package license: ${name}.`);
      for (const [name,pin] of Object.entries(root.overrides??{})) if (data.dependencies?.[name] && (!semver.valid(pin) || !semver.satisfies(pin,data.dependencies[name],{includePrerelease:true}))) throw new Error(`Review independent override compatibility: ${name}.`);
      return publication;
    })); packages.push(...batch);
  }
  const guides = await upgradeGuides(commit,fetcher,signal);
  return {schemaVersion:1,state:'prepared',from:lock.dsh,target:{version,tag:`dsh-v${version}`,commit,integrity:main.integrity},packages:packages.sort((a,b)=>a.name.localeCompare(b.name)),guideChanges:guideChanges(baseline.guides,guides),guides};
}
export async function captureProfile(workspace) {
  const temp = await realpath(tmpdir()), home = await mkdtemp(join(temp,'dsh-zhen-profile-probe-'));
  try {
    const {stdout} = await execute(process.execPath,[resolve(workspace,'node_modules/@deepseek-ai/dsh/lib/bin.js'),'--profile','example','--from-default-profile','web','--dump-config'], {cwd:home,env:mcpChildEnvironment({DSH_HOME:home}),windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});
    const document = parseDocument(stdout,{customTags:[{tag:'tag:yaml.org,2002:js',resolve:value=>value}]});
    if (document.errors.length) throw new Error('Public profile inspection failed.');
    return profileFacts(document.toJS());
  } finally {
    const absolute = await realpath(home), rel = relative(temp,absolute);
    if (!rel || isAbsolute(rel) || rel.startsWith('..') || rel.includes('/') || rel.includes('\\') || !rel.startsWith('dsh-zhen-profile-probe-')) throw new Error('Profile probe cleanup refused.');
    await rm(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}
