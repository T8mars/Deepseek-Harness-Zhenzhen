import {createHash} from 'node:crypto';
import {canonicalVersion} from './upstream-policy.mjs';
export const DISTRIBUTION_REPOSITORY='https://github.com/T8mars/Deepseek-Harness-Zhenzhen.git';
const objectId=(type,data)=>createHash('sha1').update(Buffer.from(type+' '+data.length+'\0')).update(data).digest('hex');
/** Deterministic ordinary Git objects; no repository writes or execution. */
export function releaseSnapshot(archive,{sourceCommit,timestamp}){
  if(!/^[a-f0-9]{40}$/.test(sourceCommit??'')||!Number.isSafeInteger(timestamp)||timestamp<0||timestamp>=100000000000)throw Error('Snapshot identity refused.');
  const provenance={schemaVersion:1,sourceCommit,archiveSha256:archive.sha256,payloadSha256:archive.payloadSha256,packageName:archive.manifest.name,packageVersion:archive.manifest.version};
  const paths=new Map([...archive.files].map(([name,bytes])=>['package/'+name,bytes]));paths.set('provenance.json',Buffer.from(JSON.stringify(provenance,null,2)+'\n'));
  const objects=new Map(),root=new Map();
  function add(type,data){const sha=objectId(type,data);objects.set(sha,{type,data});return sha;}
  for(const [path,bytes] of paths){let at=root;const parts=path.split('/');for(const part of parts.slice(0,-1)){if(!at.has(part))at.set(part,new Map());at=at.get(part);}at.set(parts.at(-1),{sha:add('blob',bytes),mode:path.startsWith('package/')?archive.modes?.get(path.slice(8))??'100644':'100644'});}
  function tree(map){const entries=[...map].map(([name,value])=>({name,tree:value instanceof Map,value}));entries.sort((a,b)=>Buffer.compare(Buffer.from(a.name+(a.tree?'/':'')),Buffer.from(b.name+(b.tree?'/':''))));return add('tree',Buffer.concat(entries.map(x=>Buffer.concat([Buffer.from((x.tree?'40000':x.value.mode)+' '+x.name+'\0'),Buffer.from(x.tree?tree(x.value):x.value.sha,'hex')]))));}
  const treeSha=tree(root),identity=`DSH-zhen automation <automation@dsh-zhen.invalid> ${timestamp} +0000`;
  const message=`DSH-zhen build snapshot\n\nSource: ${sourceCommit}\nArchive-SHA256: ${archive.sha256}\n`;
  const commitSha=add('commit',Buffer.from(`tree ${treeSha}\nauthor ${identity}\ncommitter ${identity}\n\n${message}`));
  return {commit:commitSha,tree:treeSha,objects,paths,provenance,timestamp,message};
}
export function releaseDocuments(archive,snapshot,{channel,tag,upstream,publishTimestamp}){
  const version=archive.manifest.version;
  if(snapshot.provenance?.archiveSha256!==archive.sha256||snapshot.provenance?.payloadSha256!==archive.payloadSha256||snapshot.provenance?.packageName!==archive.manifest.name||snapshot.provenance?.packageVersion!==version||!/^[a-f0-9]{40}$/.test(snapshot.commit??''))throw Error('Release snapshot and archive do not match.');
  if(!['development','canary','stable-candidate'].includes(channel)||!canonicalVersion(upstream?.version)||!/^[a-f0-9]{40}$/.test(upstream?.commit??'')||archive.manifest.engines?.dsh!==upstream.version||!Number.isSafeInteger(publishTimestamp)||publishTimestamp<0||publishTimestamp>=100000000000)throw Error('Release compatibility or publication identity refused.');
  if(channel==='canary'&&(!/^\d+\.\d+\.\d+-canary\.[1-9]\d*$/.test(version)||tag!=='v'+version))throw Error('Canary requires an actual matching canary package version.');
  if(channel==='stable-candidate'&&(version.includes('-')||tag!=='v'+version))throw Error('Stable candidate requires a matching final package version.');
  if(channel==='development'&&(!/^v[0-9a-zA-Z.-]+$/.test(tag)||tag.length>80))throw Error('Development tag refused.');
  const index={format:1,title:{en:'DSH-zhen',zh:'DSH-zhen 创作插件'},description:{en:'Community build snapshots; preview until explicitly published.'},plugins:[{name:'dsh-zhen',title:{en:'DSH-zhen',zh:'DSH-zhen 创作空间'},description:{en:archive.manifest.description},author:'DSH-zhen community',homepage:'https://github.com/T8mars/Deepseek-Harness-Zhenzhen',repository:{url:'https://github.com/T8mars/Deepseek-Harness-Zhenzhen',directory:'packages/dsh-zhen'},versions:[{version,publishTimestamp,source:{type:'git',url:DISTRIBUTION_REPOSITORY,commit:snapshot.commit,path:'package'},engines:{dsh:upstream.version}}]}]};
  const compat={schemaVersion:1,state:'preview',channel,tag,package:{name:'dsh-zhen',version,archiveSha256:archive.sha256,payloadSha256:archive.payloadSha256},sourceCommit:snapshot.provenance.sourceCommit,snapshotCommit:snapshot.commit,declaredRuntimeVersions:[upstream.version],upstreamCommit:upstream.commit,runtimeEvidence:null};
  return {index,compat};
}
