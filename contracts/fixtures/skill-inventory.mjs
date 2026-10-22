import assert from'node:assert/strict';import{mkdtemp,mkdir,writeFile,realpath,rm}from'node:fs/promises';import{join,dirname,relative,isAbsolute}from'node:path';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
import{LocalSkills}from'../../packages/dsh-zhen/lib/local-skills.js';import{GithubSkills}from'../../packages/dsh-zhen/lib/github-skills.js';import{SkillMarket,readBundledCatalog}from'../../packages/dsh-zhen/lib/market.js';import{SkillFeed}from'../../packages/dsh-zhen/lib/skill-feed.js';import{LOCAL_SKILL_POLICY}from'../../packages/dsh-zhen/lib/local-skills-schema.js';import{GITHUB_SKILL_POLICY}from'../../packages/dsh-zhen/lib/github-skills-schema.js';import{githubSkillFixture}from'./github-skills.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const skill=(name,body='EXAMPLE_BODY')=>`---\nname: ${name}\ndescription: EXAMPLE skill\n---\n${body}\n`;
const base=readBundledCatalog()[0];
function release(version,id=base.manifest.id){const description='EXAMPLE backup test',content=`---\nname: ${id}\ndescription: ${JSON.stringify(description)}\n---\nEXAMPLE_RELEASE_${version}\n`;return {manifest:{...base.manifest,id,description,version,digest:sha(content)},content};}
async function put(path,bytes){await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}
export async function inventoryFixture(t){
  const temp=await realpath(tmpdir()),root=await realpath(await mkdtemp(join(temp,'dsh-inventory-EXAMPLE-'))),parent=join(root,'candidates'),project=join(root,'project'),cwd=join(project,'src','nested'),a=join(root,'local-a'),b=join(root,'local-b'),native=join(root,'EXAMPLE-protected'),home=join(root,'home'),agents=join(root,'agents'),custom=join(root,'custom'),bundled=join(root,'bundled');
  for(const path of [parent,cwd,a,b,native,home,agents,custom,bundled])await mkdir(path,{recursive:true});await mkdir(join(project,'.git'));await put(join(native,'EXAMPLE_DO_NOT_READ.db'),'EXAMPLE_PROTECTED');
  const sdkRoots=[join(project,'.dsh','skills'),join(project,'.agents','skills'),custom,join(home,'skills'),join(agents,'skills'),bundled];
  for(const [index,path]of sdkRoots.entries())await put(join(path,'sample','SKILL.md'),skill('example-sdk-'+index));
  await put(join(a,'same','SKILL.md'),skill('example-local-shared'));await put(join(b,'same','SKILL.md'),skill('example-local-shared','EXAMPLE_DISABLED'));
  await put(join(a,'same','scripts','EXAMPLE.mjs'),'throw new Error("EXAMPLE_MUST_NOT_RUN");');await put(join(a,'EXAMPLE_SHARED.bin'),Buffer.from([4,0,8,255]));
  const local=new LocalSkills(join(root,'local-state.json'),1000000);
  for(const path of [a,b]){const preview=await local.preview(path,'library');await local.connect(path,'library',preview.digest,LOCAL_SKILL_POLICY);}local.disable(local.backupState().sources[1].id);
  const git=githubSkillFixture(root),github=new GithubSkills(join(root,'github'),git.fetcher);
  const first=(await github.download(git.spec)).release;github.approve(first.sourceId,first.digest,GITHUB_SKILL_POLICY);git.setHead(git.second);const second=(await github.download(git.spec)).release;github.approve(second.sourceId,second.digest,GITHUB_SKILL_POLICY);
  const initial=release('1.0.0'),next=release('1.1.0'),marketFile=join(root,'market.sqlite'),market=new SkillMarket(marketFile,[initial]);market.select(initial.manifest.id,initial.manifest.digest);market.offerRemoteCatalog([next]);market.select(next.manifest.id,next.manifest.digest,next.manifest.version);const personal=market.fork(initial.manifest.id,initial.manifest.digest,'EXAMPLE_PRIVATE_PERSONAL');
  const feedFile=join(root,'feed.json'),feed=new SkillFeed(feedFile,market,async()=>{throw new Error('EXAMPLE_NO_NETWORK');});feed.setAutomatic(false);
  const source={filesystem:[{id:'EXAMPLE-filesystem',mode:'host-local',config:{providerName:'EXAMPLE-filesystem',dshHome:home,agentsHome:agents,customSkillDirs:[custom],bundledSkillDir:bundled,watch:false}}],workspaces:[cwd,cwd],local,github,market,feed,protectedContainers:[root],forbiddenTrees:[native]};
  const disposers=[];t.after(async()=>{for(const close of disposers.toReversed())await close();local.close();github.close();market.close();const part=relative(temp,await realpath(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-inventory-EXAMPLE-'));await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
  return {dispose:fn=>disposers.push(fn),root,parent,project,cwd,a,b,native,home,agents,custom,bundled,sdkRoots,local,github,git,market,marketFile,feed,feedFile,source,initial,next,first,second,personal,path:join(root,'EXAMPLE.encrypted')};
}
