import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync} from 'node:fs';
import {join,dirname,relative,isAbsolute} from 'node:path';
import {checkRepository} from './check-private.mjs';
import {validateProposal} from './update-proposal.mjs';
import {sha256} from './upstream-policy.mjs';
const expected='T8mars/Deepseek-Harness-Zhenzhen';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!==expected)throw new Error('This publisher runs only in the configured repository workflow.');
if(!existsSync('.runtime/update-proposal.json'))process.exit(0);
const bytes=readFileSync('.runtime/update-proposal.json');if(bytes.length>8*1024*1024)throw new Error('Proposal artifact too large.');
const proposal=JSON.parse(bytes.toString('utf8'));
const git=args=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const root=realpathSync(process.cwd()),head=git(['rev-parse','HEAD']).trim();
if(head!==proposal.baseCommit||git(['status','--porcelain','--untracked-files=all']).trim())throw new Error('Publisher checkout differs from the clean proposal base.');
const origin=git(['remote','get-url','origin']).trim();
if(![`https://github.com/${expected}`,`https://github.com/${expected}.git`].includes(origin))throw new Error('Publisher remote refused.');
const readBase=path=>{try{return git(['show',`${head}:${path}`]);}catch{return null;}};
const {files,record,prepared}=validateProposal(proposal,readBase);if(!files.size)process.exit(0);
checkRepository(root);
// No dependency installation, candidate evaluation, or general patch application.
const branch='codex/upstream-'+sha256(JSON.stringify({base:head,validation:proposal.validation,files:proposal.files.map(file=>[file.path,sha256(file.content)])})).slice(0,12);
const draft=!prepared||Object.values(proposal.validation).some(value=>value!=='success');
const body=['Prepared public upstream update candidates. Current application installations are unchanged.','',
  ...record.candidates.map(item=>`- ${item.id}: ${item.current} → ${item.available} ([source](${item.url}))`),'',
  prepared?`Prepared ${prepared.packages.length} exact published package pins. Guide/profile differences and review requirements are in UPSTREAM.prepared.json.`:'Dependency preparation did not complete or is not applicable; this draft contains only discovery metadata.','',
  'Validation:',...Object.entries(proposal.validation).map(([name,state])=>`- ${name}: ${state}`),'',
  'Review required source changes and run the PR checks before merging. A passing candidate still requires canary observation and controlled live verification before release promotion. No paid workflow, production release or application activation runs here.',''].join('\n');
function ensurePullRequest(){
  const existing=JSON.parse(execFileSync('gh',['pr','list','--repo',expected,'--head',branch,'--state','all','--json','number'],{encoding:'utf8'}));
  if(existing.length){console.log('This exact candidate proposal already has a pull request.');return;}
  mkdirSync('.runtime',{recursive:true});writeFileSync('.runtime/update-pr-body.md',body);
  execFileSync('gh',['pr','create','--repo',expected,'--head',branch,'--title',prepared?`chore: validate DSH ${prepared.target.version} compatibility`:'chore: review upstream update candidates','--body-file','.runtime/update-pr-body.md',...(draft?['--draft']:[])],{stdio:'inherit'});
}
if(git(['ls-remote','--heads','origin',branch]).trim()){ensurePullRequest();process.exit(0);}
for(const [path,content]of files){
  const target=join(root,path),rel=relative(root,target);if(isAbsolute(rel)||rel.startsWith('..'))throw new Error('Proposal destination refused.');
  for(let cursor=target;cursor!==root;cursor=dirname(cursor))if(existsSync(cursor)&&lstatSync(cursor).isSymbolicLink())throw new Error('Proposal symlink destination refused.');
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content);
}
git(['switch','-c',branch]);git(['config','user.name','github-actions[bot]']);git(['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
git(['add','--',...files.keys()]);checkRepository(root);
git(['commit','-m',prepared?`chore: prepare DSH ${prepared.target.version} compatibility`:'chore: record upstream update candidates']);
execFileSync('gh',['auth','setup-git','--hostname','github.com'],{stdio:'inherit'});
checkRepository(root);git(['push','-u','origin',branch]);ensurePullRequest();
