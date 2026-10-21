import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, realpathSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative, isAbsolute, basename, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { parseDocument } from 'yaml';
import { isDeepStrictEqual } from 'node:util';
import { mcpChildEnvironment } from '../packages/dsh-zhen/lib/mcp-market.js';
import { redactLauncherLine } from './log-output.mjs';
import { examplePdf } from '../contracts/fixtures/pdf-document.mjs';
import {prepareRelease,readReleaseStage} from './prepare-release.mjs';

// Disposable profile created only by public CLI commands. No browser or HTTP UI
// inspection, user credentials, conversations or paid calls are involved.
const workspace = process.cwd(), cli = resolve('node_modules/@deepseek-ai/dsh/lib/bin.js');
const artifact = JSON.parse(readFileSync('.runtime/package-artifact.json', 'utf8'));
if (!/^dsh-zhen-[0-9A-Za-z.-]+-[a-f0-9]{16}\.tgz$/.test(artifact.file)) throw new Error('Invalid artifact.');
const archive = resolve('.runtime/packages', artifact.file);
if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== artifact.sha256) throw new Error('Artifact changed.');
const args = process.argv.slice(2);
const existingGitStage=args.length===2&&args[0]==='--git-stage',gitMode=existingGitStage||args.length===1&&args[0]==='--git-snapshot';
if (!gitMode&&args.length && (args.length !== 2 || args[0] !== '--replacement-from' || !/^dsh-zhen-[0-9A-Za-z.-]+-[a-f0-9]{16}\.tgz$/.test(args[1]) || args[1] === artifact.file)) throw new Error('Usage: smoke-install.mjs [--replacement-from previous.tgz | --git-snapshot | --git-stage owned-stage-name]');
const previousArchive = !gitMode&&args.length ? resolve('.runtime/packages', args[1]) : undefined;
const distribution=gitMode?(existingGitStage?readReleaseStage({stageName:args[1],archiveBytes:readFileSync(archive),upstream:JSON.parse(readFileSync('UPSTREAM.lock.json','utf8')).dsh}):prepareRelease({channel:'development'})):undefined;
if (previousArchive && !args[1].endsWith('-' + createHash('sha256').update(readFileSync(previousArchive)).digest('hex').slice(0, 16) + '.tgz')) throw new Error('Previous artifact changed.');
const expectedEntry = createHash('sha256').update(readFileSync('packages/dsh-zhen/lib/index.js')).digest('hex');
const expectedPatch = createHash('sha256').update(readFileSync('packages/dsh-zhen/cordis.patch.yml')).digest('hex');
const expectedClient = createHash('sha256').update(readFileSync('packages/dsh-zhen/lib/client.js')).digest('hex');
const expectedSkills = createHash('sha256').update(readFileSync('packages/dsh-zhen/catalog/skills.json')).digest('hex');
const expectedProvider = parseDocument(readFileSync('packages/dsh-zhen/cordis.patch.yml', 'utf8')).toJS().find(row => row.id === 'llm-pi-ai').config.providers.seedance;
const temp = realpathSync.native(tmpdir()), root = mkdtempSync(join(temp, 'dsh-zhen-install-smoke-'));
const env = mcpChildEnvironment({ DSH_HOME: root });
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
env[pathKey] = resolve('node_modules/.bin') + delimiter + (env[pathKey] ?? '');
let host, hostClosed = false, logs = '';
function capture(stream) { stream.setEncoding('utf8'); stream.on('data', text => { logs = (logs + redactLauncherLine(text)).slice(-128 * 1024); }); }
async function run(args) {
  const child = spawn(process.execPath, [cli, ...args], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], signal: AbortSignal.timeout(180000) });
  let output = '', failed = false; child.stdout.setEncoding('utf8'); child.stdout.on('data', text => { output += text; if (output.length > 8 * 1024 * 1024) child.kill(); }); capture(child.stderr);
  await new Promise((done, reject) => { child.once('error', () => { failed = true; }); child.once('close', code => !failed && code === 0 ? done() : reject(new Error('Public DSH CLI operation failed; inspect the local smoke evidence.'))); });
  return output;
}
async function choosePort() { const server = createServer(); await new Promise(done => server.listen(0, '127.0.0.1', done)); const port = server.address().port; await new Promise(done => server.close(done)); return port; }
async function bundleIdentity() {
  // Public CLI/pnpm exec reads our installed entries and declared bundle patch, without
  // importing it or reading any profile-private data.
  const output = await run(['plugin', '--profile', 'example', 'exec', process.execPath, '-e', "const f=require('node:fs'),p=require('node:path'),c=require('node:crypto'),m=require('dsh-zhen/package.json');if(m.dsh?.bundle?.patch!=='./cordis.patch.yml')throw Error('Unexpected bundle patch');const root=p.dirname(require.resolve('dsh-zhen/package.json')),hash=x=>c.createHash('sha256').update(f.readFileSync(x)).digest('hex');console.log('DSH_ZHEN_IDENTITY='+JSON.stringify({entry:hash(require.resolve('dsh-zhen')),patch:hash(p.resolve(root,m.dsh.bundle.patch)),client:hash(require.resolve('dsh-zhen/client')),skills:hash(p.join(root,'catalog/skills.json'))}))"]);
  const value = output.match(/DSH_ZHEN_IDENTITY=(\{[^\r\n]+\})/);
  if (!value) throw new Error('Installed bundle identity could not be resolved through the public CLI.');
  const identity = JSON.parse(value[1]);
  if (![identity.entry, identity.patch, identity.client, identity.skills].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) throw new Error('Installed bundle identity is invalid.');
  return identity;
}
async function listening(port) { return new Promise(done => { const socket = connect({ host: '127.0.0.1', port }); socket.setTimeout(250); socket.once('connect', () => { socket.destroy(); done(true); }); socket.once('error', () => done(false)); socket.once('timeout', () => { socket.destroy(); done(false); }); }); }
try {
  console.log('Creating a disposable profile through the public DSH CLI…');
  const baselineText = await run(['--profile', 'example', '--from-default-profile', 'web', '--dump-config']);
  const baseline = parseDocument(baselineText, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] }).toJS();
  let priorIdentity;
  if (previousArchive) {
    console.log('Installing the previous local artifact to verify same-version replacement…');
    await run(['plugin', '--profile', 'example', 'add', previousArchive, '--ignore-scripts']);
    priorIdentity = await bundleIdentity();
    if (priorIdentity.entry === expectedEntry && priorIdentity.patch === expectedPatch && priorIdentity.client === expectedClient && priorIdentity.skills === expectedSkills) throw new Error('Replacement probe requires a different previous entry, bundle patch, client or skill catalog.');
  }
  console.log(gitMode?'Installing the exact compiled Git snapshot into the disposable profile…':'Installing the exact local artifact into the disposable profile…');
  await run(['plugin', '--profile', 'example', 'add', distribution?.staged.manifest.installTarget.spec??archive, '--force', '--ignore-scripts']);
  const identity = await bundleIdentity();
  if (identity.entry !== expectedEntry || identity.patch !== expectedPatch || identity.client !== expectedClient || identity.skills !== expectedSkills) throw new Error('Installed bundle entry, patch, client or skill catalog differs from the current artifact build.');
  let gitPayloadFiles;
  if(distribution){
    const expectedFile=join(root,'EXAMPLE_EXPECTED_PACKAGE.json');writeFileSync(expectedFile,JSON.stringify([...distribution.archive.files].map(([path,bytes])=>({path,sha256:createHash('sha256').update(bytes).digest('hex')}))));
    const probe="const f=require('node:fs'),p=require('node:path'),c=require('node:crypto'),root=p.dirname(require.resolve('dsh-zhen/package.json')),expected=JSON.parse(f.readFileSync(process.argv[1],'utf8'));for(const item of expected){const file=p.join(root,item.path);if(!f.lstatSync(file).isFile()||f.lstatSync(file).isSymbolicLink()||c.createHash('sha256').update(f.readFileSync(file)).digest('hex')!==item.sha256)throw Error('EXAMPLE_INSTALLED_GIT_PAYLOAD_MISMATCH');}console.log('DSH_ZHEN_GIT_FILES='+expected.length)";
    const output=await run(['plugin','--profile','example','exec',process.execPath,'-e',probe,expectedFile]);gitPayloadFiles=Number(output.match(/DSH_ZHEN_GIT_FILES=(\d+)/)?.[1]);if(gitPayloadFiles!==distribution.archive.files.size)throw Error('Git payload verification incomplete.');
  }
  const text = await run(['--profile', 'example', '--dump-config']);
  const config = parseDocument(text, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] }).toJS();
  const rows = new Map(config.map(row => [row.id, row]));
  const models = rows.get('llm-pi-ai')?.config?.providers?.seedance?.models;
  if (!isDeepStrictEqual(rows.get('llm-pi-ai')?.config?.providers?.seedance, expectedProvider)) throw new Error('Installed provider profile differs from the complete source declaration.');
  if (!rows.has('attachment-local') || rows.get('attachment-local').disabled === true) throw new Error('Native attachment backend is unavailable.');
  if (models?.length !== 18 || rows.get('agent-default-model')?.config?.model !== 'deepseek/deepseek-v4.1-flash' || !rows.has('dsh-zhen')) throw new Error('Installed profile composition differs.');
  for (const name of ['session-log-deepseek','plugin-package-inventory-deepseek','deepseek-llm-api-extensions','otel','session-telemetry-otel','product-analytics','desktop-product-telemetry','ui-brand-official']) if (rows.get(name)?.disabled !== true) throw new Error('Required privacy/branding row differs.');
  // Exercise the installed worker and external dependency through the public
  // CLI, not the development lib directory. Only this owned EXAMPLE profile.
  const pdfFolder=join(root,'EXAMPLE_PDF_DOCS');mkdirSync(pdfFolder);
  const pdfFile=join(pdfFolder,'EXAMPLE.pdf'),pdfBytes=examplePdf(['EXAMPLE ONLY\n示例角色蓝桥。','EXAMPLE ONLY\n示例场景雨夜古桥。']);writeFileSync(pdfFile,pdfBytes);
  // plugin exec does not install the Host's peer-module resolver. Exercise the
  // shipped standalone decoder here; C47 separately checks the actual Host
  // service/index/grants composition. Do not import development-only peers.
  const installedPdfProbe=String.raw`
    import {spawn} from 'node:child_process';
    import {readFileSync} from 'node:fs';
    import {fileURLToPath} from 'node:url';
    const worker=fileURLToPath(new URL('./lib/pdf-text-worker.js',import.meta.resolve('dsh-zhen/package.json')));
    const env={};for(const key of Object.keys(process.env))if(['systemroot','windir','temp','tmp','lang','lc_all'].includes(key.toLowerCase()))env[key]=process.env[key];
    const child=spawn(process.execPath,['--max-old-space-size=256',worker],{env,windowsHide:true,serialization:'advanced',stdio:['ignore','ignore','ignore','ipc']});
    let value,failure;const deadline=setTimeout(()=>{failure=Error('EXAMPLE_INSTALLED_PDF_TIMEOUT');child.kill();},30000);
    child.once('message',message=>{value=message;});child.once('error',()=>{failure=Error('EXAMPLE_INSTALLED_PDF_START');});
    const closed=new Promise((done,reject)=>child.once('close',code=>{clearTimeout(deadline);failure||code!==0?reject(failure??Error('EXAMPLE_INSTALLED_PDF_EXIT')):done();}));
    child.send({bytes:readFileSync(process.argv[1])},error=>{if(error){failure=Error('EXAMPLE_INSTALLED_PDF_IPC');child.kill();}});await closed;
    if(value?.ok!==true||value.pageCount!==2||!value.pages?.find(p=>p.page===2&&p.text.includes('雨夜古桥')))throw Error('EXAMPLE_INSTALLED_PDF_CONTENT');
    console.log('DSH_ZHEN_PDF='+JSON.stringify({page:2,workerOnly:true}));
  `.replace(/\r?\n/g,' ');
  const pdfOutput=await run(['plugin','--profile','example','exec',process.execPath,'--input-type=module','-e',installedPdfProbe,pdfFile]);
  const pdfMatch=pdfOutput.match(/DSH_ZHEN_PDF=(\{[^\r\n]+\})/);if(!pdfMatch)throw new Error('Installed PDF verification did not return a receipt.');const pdfProof=JSON.parse(pdfMatch[1]);
  if(pdfProof.page!==2||pdfProof.workerOnly!==true||!readFileSync(pdfFile).equals(pdfBytes))throw new Error('Installed PDF result differs or source bytes changed.');
  const docxFixture=JSON.parse(readFileSync(resolve(workspace,'contracts/fixtures/docx-generated.json'),'utf8')),docxBytes=Buffer.from(docxFixture.base64,'base64'),docxFolder=join(root,'EXAMPLE_WORD_DOCS');mkdirSync(docxFolder);const docxFile=join(docxFolder,'EXAMPLE.docx');writeFileSync(docxFile,docxBytes);
  const expectedDocxWorker=createHash('sha256').update(readFileSync(resolve(workspace,'packages/dsh-zhen/lib/docx-text-worker.js'))).digest('hex'),expectedDocxText=createHash('sha256').update(docxFixture.expected).digest('hex');
  const installedDocxProbe=String.raw`
    import {spawn} from 'node:child_process';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
    const worker=fileURLToPath(new URL('./lib/docx-text-worker.js',import.meta.resolve('dsh-zhen/package.json'))),env={};for(const key of Object.keys(process.env))if(['systemroot','windir','temp','tmp','lang','lc_all'].includes(key.toLowerCase()))env[key]=process.env[key];
    const child=spawn(process.execPath,['--max-old-space-size=256',worker],{env,windowsHide:true,serialization:'advanced',stdio:['ignore','ignore','ignore','ipc']});let value,failure;
    const deadline=setTimeout(()=>{failure=Error('EXAMPLE_INSTALLED_DOCX_TIMEOUT');child.kill();},30000);child.once('message',message=>{value=message;});child.once('error',()=>{failure=Error('EXAMPLE_INSTALLED_DOCX_START');});const closed=new Promise((done,reject)=>child.once('close',code=>{clearTimeout(deadline);failure||code!==0?reject(failure??Error('EXAMPLE_INSTALLED_DOCX_EXIT')):done();}));
    child.send({bytes:readFileSync(process.argv[1])},error=>{if(error){failure=Error('EXAMPLE_INSTALLED_DOCX_IPC');child.kill();}});await closed;if(value?.ok!==true||typeof value.text!=='string'||createHash('sha256').update(value.text).digest('hex')!==process.argv[2])throw Error('EXAMPLE_INSTALLED_DOCX_CONTENT');
    console.log('DSH_ZHEN_DOCX='+JSON.stringify({bodyTextMatched:true,workerOnly:true,workerSha256:createHash('sha256').update(readFileSync(worker)).digest('hex')}));
  `.replace(/\r?\n/g,' ');
  const docxOutput=await run(['plugin','--profile','example','exec',process.execPath,'--input-type=module','-e',installedDocxProbe,docxFile,expectedDocxText]),docxMatch=docxOutput.match(/DSH_ZHEN_DOCX=(\{[^\r\n]+\})/);if(!docxMatch)throw Error('Installed DOCX receipt missing.');const docxProof=JSON.parse(docxMatch[1]);if(!docxProof.bodyTextMatched||!docxProof.workerOnly||docxProof.workerSha256!==expectedDocxWorker||!readFileSync(docxFile).equals(docxBytes))throw Error('Installed DOCX identity or source bytes changed.');
  const port = await choosePort();
  host = spawn(process.execPath, [cli, '--profile', 'example', '--host', '127.0.0.1', '--port', String(port), '--no-open'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  capture(host.stdout); capture(host.stderr); host.once('error', () => {}); host.once('close', () => { hostClosed = true; });
  const deadline = Date.now() + 30000; let ready = false;
  while (!hostClosed && Date.now() < deadline) { if (await listening(port)) { ready = true; break; } await delay(150); }
  if (!ready) throw new Error('Disposable Host did not open its loopback socket.');
  await delay(500);
  if (hostClosed) throw new Error('Disposable Host exited after startup.');
  // M0 A3: stop the owned disposable Host before changing its profile. Verify
  // removal against the freshly composed public template, never user settings.
  await new Promise(done => { host.once('close', done); host.kill(); });
  if (!hostClosed) throw new Error('Disposable Host did not stop before removal.');
  console.log('Removing the bundle from the stopped disposable profile…');
  await run(['plugin', '--profile', 'example', 'remove', 'dsh-zhen', '--config.ignore-scripts=true']);
  const restored = parseDocument(await run(['--profile', 'example', '--dump-config']), { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] }).toJS();
  if (!isDeepStrictEqual(restored, baseline)) throw new Error('Uninstall did not restore the complete public baseline configuration.');
  if (!readFileSync(pdfFile).equals(pdfBytes) || !readFileSync(docxFile).equals(docxBytes)) throw new Error('EXAMPLE source bytes changed during uninstall.');
  const evidence = { at: new Date().toISOString(), artifact: artifact.file, sha256: artifact.sha256, node: process.versions.node, installedViaPublicCli: true, installedEntrySha256: expectedEntry, installedPatchSha256: expectedPatch, installedClientSha256: expectedClient, installedSkillCatalogSha256: expectedSkills, replacementFrom: previousArchive ? args[1] : null, previousEntrySha256: priorIdentity?.entry ?? null, previousPatchSha256: priorIdentity?.patch ?? null, previousClientSha256: priorIdentity?.client ?? null, previousSkillCatalogSha256: priorIdentity?.skills ?? null, installedDocxWorkerVerified:true,installedDocxWorkerSha256:docxProof.workerSha256,installedDocxTextMatched:true,installedDocxKnowledgeIndexVerified:false,docxSourceBytesPreserved:true,installedPdfWorkerVerified:true,installedPdfPage:pdfProof.page,installedPdfKnowledgeIndexVerified:false,pdfSourceBytesPreserved:true, completeProviderProfileMatches: true, nativeAttachmentsEnabled: true, imageModelRoutes: models.filter(model => model.input.includes('image')).length, modelRoutes: models.length, flashDefault: true, designatedCollectorsDisabled: true, hostLoopbackSocket: true, browserInspected: false, paidCalls: 0 };
  Object.assign(evidence, { uninstalledViaPublicCli: true, stoppedBeforeUninstall: true, completeBaselineRestored: true, uninstallSourceBytesPreserved: true, rollbackScope: 'fresh TEMP profile only; no user sessions, credentials or database rollback' });
  if(distribution)Object.assign(evidence,{kind:'git-snapshot-install',gitSnapshotCommit:distribution.snapshot.commit,gitSourceCommit:distribution.snapshot.provenance.sourceCommit,gitSourceUrl:'https://github.com/T8mars/Deepseek-Harness-Zhenzhen.git',gitPayloadFiles,completeGitPayloadMatched:true,releaseOrIndexPublished:false});
  mkdirSync(resolve(workspace, '.runtime/evidence'), { recursive: true });
  writeFileSync(resolve(workspace, gitMode?'.runtime/evidence/git-bundle-smoke.json':'.runtime/evidence/installed-bundle-smoke.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
} finally {
  if (host && !hostClosed) { await new Promise(done => { host.once('close', done); host.kill(); }); }
  // A log is diagnostic evidence only; owner-token URLs are redacted.
  mkdirSync(resolve(workspace, '.runtime/evidence'), { recursive: true });
  writeFileSync(resolve(workspace, gitMode?'.runtime/evidence/git-bundle-smoke.log':'.runtime/evidence/installed-bundle-smoke.log'), logs);
  const absolute = realpathSync.native(root), rel = relative(temp, absolute);
  if (!rel || isAbsolute(rel) || rel.startsWith('..') || rel.includes('/') || rel.includes('\\') || !basename(absolute).startsWith('dsh-zhen-install-smoke-')) throw new Error('Temporary cleanup path refused.');
  rmSync(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
