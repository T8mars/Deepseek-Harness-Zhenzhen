import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {readReleaseInput,releaseOutput} from './release-input.mjs';
import {RELEASE_REPO,releaseApi,requireCanary,checkReleaseEvidence,uploadReleaseSnapshot,publishCanaryRelease,publishDistributionFeed,readDistributionFeed} from './publish-release-core.mjs';

const token=process.env.GH_TOKEN;delete process.env.GH_TOKEN;
const [command,...args]=process.argv.slice(2);if(args.length||!['preview','snapshot','finalize','export-feed'].includes(command))throw Error('Usage: publish-release.mjs preview|snapshot|finalize|export-feed');
if(command==='preview'){
  const p=readReleaseInput();console.log(JSON.stringify({state:'preview',tag:p.meta.tag,channel:p.meta.channel,sourceCommit:p.meta.sourceCommit,snapshotCommit:p.snapshot.commit,archiveSha256:p.archive.sha256,packageFiles:p.archive.files.size,sourceDirty:p.meta.sourceDirty,published:false}));
}else{
  if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!==RELEASE_REPO||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw Error('Release workflow identity refused.');
  const api=releaseApi(token);
  if(command==='export-feed'){
    const commit=process.env.DSH_FEED_COMMIT,result=await readDistributionFeed(api,commit),base=realpathSync.native(process.cwd());
    function directory(parent,name){const path=join(parent,name);if(!existsSync(path))mkdirSync(path);if(!lstatSync(path).isDirectory()||lstatSync(path).isSymbolicLink()||realpathSync.native(path)!==path)throw Error('Pages output directory refused.');return path;}
    const root=directory(directory(base,'.runtime'),'pages');
    for(const [path,bytes] of result.files){let parent=root;const parts=path.split('/');for(const name of parts.slice(0,-1))parent=directory(parent,name);writeFileSync(join(parent,parts.at(-1)),bytes,{flag:'wx'});}
    console.log(JSON.stringify({feedCommit:commit,files:result.files.size,deployed:false}));
  }else{
    if(process.env.DSH_PUBLISH_CANARY!=='true')throw Error('Canary publication was not explicitly enabled.');
    const p=readReleaseInput();requireCanary(p);
    if(p.meta.sourceCommit!==process.env.GITHUB_SHA||execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim())throw Error('Release source checkout is not the exact clean workflow commit.');
    const evidence=await checkReleaseEvidence(api,{sourceCommit:p.meta.sourceCommit,runId:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),requiredJobs:command==='snapshot'?['build']:['build','snapshot','verify']});
    if(command==='snapshot'){
      const result=await uploadReleaseSnapshot(p,api,token);releaseOutput('snapshot_commit',result.commit);console.log(JSON.stringify({...result,releasePublished:false}));
    }else{
      const result=await publishCanaryRelease(p,api,evidence),feed=await publishDistributionFeed(api,result.record);releaseOutput('feed_commit',feed.commit);
      console.log(JSON.stringify({state:'published-canary',tag:p.meta.tag,releaseId:result.release.id,sourceCommit:p.meta.sourceCommit,snapshotCommit:p.snapshot.commit,feedCommit:feed.commit,pagesDeployed:false,stablePublished:false}));
    }
  }
}
