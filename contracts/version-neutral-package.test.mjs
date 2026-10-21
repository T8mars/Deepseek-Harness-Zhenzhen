import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {mkdtempSync,realpathSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,readdirSync,rmSync,existsSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,dirname,resolve,relative,isAbsolute} from 'node:path';import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readReleaseArchive} from '../scripts/release-archive.mjs';
import {canonicalPackageText} from '../scripts/package-stage.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');

test('C76: actual canary and stable builds differ only in manifest version, and installed status reads each real version', {timeout:180000},t=>{
  const workspace=process.cwd(),base=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(join(base,'dsh-version-build-EXAMPLE-'))),pkg=join(root,'packages/dsh-zhen');
  t.after(()=>{const part=relative(base,realpathSync.native(root));assert.ok(part&&!isAbsolute(part)&&!part.startsWith('..')&&!/[\\/]/.test(part)&&part.startsWith('dsh-version-build-EXAMPLE-'));rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  const npm=[process.env.npm_execpath,resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].find(path=>path&&existsSync(path));assert.ok(npm);
  const env={...process.env,DSH_HOME:join(root,'EXAMPLE_HOME'),npm_execpath:npm};delete env.SEEDANCE_API_KEY;delete env.GH_TOKEN;delete env.GITHUB_TOKEN;delete env.GITHUB_OUTPUT;
  const run=(exe,args,cwd=root)=>execFileSync(exe,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:60000,maxBuffer:16*1024*1024}).toString('utf8');
  const preview=JSON.parse(run(process.execPath,[npm,'pack','./packages/dsh-zhen','--ignore-scripts','--offline','--json','--dry-run'],workspace))[0];assert.ok(preview.files.length>=100);
  const reference=new Map(preview.files.map(f=>{let bytes=readFileSync(join(workspace,'packages/dsh-zhen',f.path));if(canonicalPackageText(f.path))bytes=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));return[f.path,bytes];}));
  const copy=(path,source=join(workspace,path))=>{const target=join(root,path);mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);};
  for(const f of preview.files)copy('packages/dsh-zhen/'+f.path);
  const raw=run('git',['ls-files','-z','--','packages/dsh-zhen'],workspace).split('\0').filter(Boolean);for(const path of raw){assert.ok(path.startsWith('packages/dsh-zhen/')&&!path.split('/').includes('..'));assert.equal(lstatSync(join(workspace,path)).isSymbolicLink(),false);copy(path);}
  copy('UPSTREAM.lock.json');copy('tsconfig.base.json');writeFileSync(join(root,'package.json'),JSON.stringify({name:'example-version-contract',version:'0.0.0',private:true,type:'module'}));
  // These are the exact reviewed packages consumed by the production browser
  // build and license collector; no dependency installation or user data copy.
  let copied=0;function dependency(source,target){assert.equal(lstatSync(source).isSymbolicLink(),false);mkdirSync(target,{recursive:true});for(const entry of readdirSync(source,{withFileTypes:true})){assert.ok(++copied<10000);assert.equal(entry.isSymbolicLink(),false);const from=join(source,entry.name),to=join(target,entry.name);if(entry.isDirectory())dependency(from,to);else{assert.equal(entry.isFile(),true);copyFileSync(from,to);}}}
  for(const name of ['@deepseek-ai/dsh-typert-protocol','zod','saxes','xmlchars'])dependency(join(workspace,'node_modules',name),join(root,'node_modules',name));
  const manifest=JSON.parse(readFileSync(join(pkg,'package.json'))),built=[];
  for(const version of ['0.1.0-canary.1','0.1.0']){
    writeFileSync(join(pkg,'package.json'),JSON.stringify({...manifest,version},null,2)+'\n');
    run(process.execPath,[join(workspace,'scripts/build.mjs')]);run(process.execPath,[join(workspace,'scripts/pack.mjs')]);
    const artifact=JSON.parse(readFileSync(join(root,'.runtime/package-artifact.json'))),file=join(root,'.runtime/packages',artifact.file),archive=readReleaseArchive(readFileSync(file));assert.equal(archive.manifest.version,version);assert.equal(archive.sha256,artifact.sha256);assert.equal(Object.hasOwn(JSON.parse(archive.files.get('catalog/runtime.json')),'zhen'),false);built.push({version,file,archive});
  }
  assert.notEqual(built[0].archive.sha256,built[1].archive.sha256);assert.equal(built[0].archive.payloadSha256,built[1].archive.payloadSha256);assert.deepEqual([...built[0].archive.files.keys()].sort(),[...built[1].archive.files.keys()].sort());
  for(const [path,bytes]of built[0].archive.files)if(path!=='package.json'){assert.ok(bytes.equals(built[1].archive.files.get(path)),'Version changed another payload file: '+path);assert.equal(built[0].archive.modes.get(path),built[1].archive.modes.get(path));}
  assert.deepEqual([...built[1].archive.files].filter(([path,bytes])=>path!=='package.json'&&!bytes.equals(reference.get(path))).map(([path])=>path),[],'The two-version fixture must reproduce the actual production payload, not just agree with itself.');
  const cli=join(workspace,'node_modules/@deepseek-ai/dsh/lib/bin.js'),call=args=>run(process.execPath,[cli,...args]);
  call(['--profile','example','--from-default-profile','web','--dump-config']);
  for(const b of built){
    call(['plugin','--profile','example','add',b.file,'--force','--ignore-scripts']);
    // Bare plugin exec has no Host peer resolver. Use Node's public hook only
    // in this test to resolve the declared official SDK peers from this exact
    // workspace pin, then call the actual installed status method with a stub
    // credential-presence service. This is not a Host authorization/UI test.
    const program="import {registerHooks} from 'node:module';registerHooks({resolve(s,c,next){return next(s,s.startsWith('@deepseek-ai/')?{...c,parentURL:"+JSON.stringify(pathToFileURL(join(workspace,'package.json')).href)+"}:c)}});const {default:C}=await import('dsh-zhen');const result=await C.prototype.status.call({ctx:{credentials:{describe:async()=>({configured:false,writable:true})}}});console.log('EXAMPLE_STATUS='+JSON.stringify(result));";
    const result=call(['plugin','--profile','example','exec',process.execPath,'--input-type=module','-e',program]),line=result.split(/\r?\n/).find(x=>x.startsWith('EXAMPLE_STATUS='));assert.ok(line);const status=JSON.parse(line.slice(15));assert.equal(status.version,b.version);assert.equal(status.credentialConfigured,false);assert.equal(status.provider,'seedance');assert.equal(status.model,'deepseek/deepseek-v4.1-flash');
    call(['plugin','--profile','example','remove','dsh-zhen']);
  }
  t.diagnostic(JSON.stringify({contract:'C76',packageFiles:built[0].archive.files.size,canaryArchiveSha256:built[0].archive.sha256,stableArchiveSha256:built[1].archive.sha256,payloadSha256:built[0].archive.payloadSha256,otherFilesByteIdentical:true,actualInstalledStatusVersions:built.map(x=>x.version),providerCredentialValuesRead:false,modelRequests:0}));
});
