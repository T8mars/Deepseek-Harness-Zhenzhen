import {readFileSync,writeFileSync,mkdtempSync,realpathSync,rmSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {KnowledgeStore} from '../packages/dsh-zhen/lib/knowledge.js';

// Explicit local source, no cloud/model/credential service and no application DB.
const args=process.argv.slice(2);
if(args.length!==6||args[0]!=='--root'||args[2]!=='--cases'||args[4]!=='--out-name'||!(/^[a-zA-Z0-9-]+\.json$/).test(args[5]))throw Error('Usage: node scripts/evaluate-rag-corpus.mjs --root <folder> --cases <json> --out-name <new-evidence.json>');
if(statSync(args[3]).size>1048576)throw Error('Cases file exceeds the bounded input size.');
const source=realpathSync.native(args[1]),caseBytes=readFileSync(args[3]),criteria=JSON.parse(caseBytes),output=resolve('.runtime/evidence',args[5]);
if(existsSync(output))throw Error('Evidence already exists; choose a new out-name.');
if(criteria.schemaVersion!==1||criteria.topK!==5||criteria.approval!=='proposed-not-owner-accepted'||!Number.isFinite(criteria.suggestedThreshold)||criteria.suggestedThreshold<0||criteria.suggestedThreshold>1||!Array.isArray(criteria.cases)||criteria.cases.length<1||criteria.cases.length>100||new Set(criteria.cases.map(item=>item.id)).size!==criteria.cases.length)throw Error('Invalid proposed evaluation criteria.');
for(const item of criteria.cases)if(!/^[a-z0-9-]{1,80}$/.test(item.id)||!['keywords','question'].includes(item.kind)||typeof item.query!=='string'||item.query.length>200||!Array.isArray(item.expectedPathFragments)||!item.expectedPathFragments.length||!item.expectedPathFragments.every(x=>typeof x==='string'&&x.length>0&&x.length<=160)||!Array.isArray(item.evidenceAny)||!item.evidenceAny.every(group=>Array.isArray(group)&&group.length>0&&group.every(x=>typeof x==='string'&&x.length>0&&x.length<=100)))throw Error('Invalid case.');
const base=realpathSync.native(tmpdir()),home=realpathSync.native(mkdtempSync(join(base,'dsh-rag-evaluation-EXAMPLE-'))),db=join(home,'knowledge.sqlite'),normalize=value=>value.normalize('NFKC').toLowerCase();
let report,store;
try{
 store=new KnowledgeStore(db);
 const collection=await store.create('EXAMPLE_EVALUATION','EXAMPLE_LOCAL_DOCUMENTATION',source),started=performance.now(),imported=await store.index('EXAMPLE_EVALUATION',collection.id),indexMs=performance.now()-started,rows=[];
 for(const item of criteria.cases){const start=performance.now(),hits=store.search('EXAMPLE_EVALUATION',item.query),elapsedMs=performance.now()-start,top=hits.slice(0,criteria.topK),accepted=hit=>item.expectedPathFragments.some(part=>hit.path.replaceAll('\\','/').includes(part))&&item.evidenceAny.every(group=>group.some(term=>normalize(hit.text).includes(normalize(term))));rows.push({id:item.id,kind:item.kind,passed:top.some(accepted),elapsedMs:Math.round(elapsedMs*1000)/1000,hits:top.map(hit=>({path:hit.path,line:hit.line,goldAndEvidence:accepted(hit)}))});}
 const byKind=Object.fromEntries(['keywords','question'].map(kind=>{const chosen=rows.filter(row=>row.kind===kind),passed=chosen.filter(row=>row.passed).length;return [kind,{cases:chosen.length,passed,hitRate:chosen.length?passed/chosen.length:0}];})),times=rows.map(row=>row.elapsedMs).sort((a,b)=>a-b);
 const crossProjectHits=store.search('EXAMPLE_OTHER_PROJECT','对白').length;store.setAccess('EXAMPLE_EVALUATION',collection.id,false,'');const revokedHits=store.search('EXAMPLE_EVALUATION','对白').length;
 report={schemaVersion:1,at:new Date().toISOString(),criteriaApproval:criteria.approval,criteriaSha256:createHash('sha256').update(caseBytes).digest('hex'),implementationSha256:createHash('sha256').update(readFileSync('packages/dsh-zhen/lib/knowledge.js')).digest('hex'),sourceRecorded:false,rawTextRecorded:false,corpus:{...imported},indexMs:Math.round(indexMs),sqliteBytes:statSync(db).size,topK:criteria.topK,suggestedThreshold:criteria.suggestedThreshold,byKind,queryP50Ms:times[Math.floor((times.length-1)*.5)],queryP95Ms:times[Math.ceil((times.length-1)*.95)],crossProjectHits,revokedHits,cases:rows,modelCalls:0,credentialReads:0,nativeWrites:0,ownerAcceptance:false};
 if(crossProjectHits!==0||revokedHits!==0)throw Error('Evaluation authorization failure.');
}finally{store?.close();const physical=realpathSync.native(home),part=relative(base,physical);if(!part||isAbsolute(part)||part.startsWith('..')||part.includes('/')||part.includes('\\'))throw Error('Temporary cleanup refused.');rmSync(physical,{recursive:true,force:true});}
mkdirSync(resolve('.runtime/evidence'),{recursive:true});writeFileSync(output,JSON.stringify({...report,temporaryIndexRemoved:true},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({corpus:report.corpus,indexMs:report.indexMs,sqliteBytes:report.sqliteBytes,byKind:report.byKind,queryP95Ms:report.queryP95Ms,crossProjectHits:report.crossProjectHits,revokedHits:report.revokedHits,ownerAcceptance:false,temporaryIndexRemoved:true}));
