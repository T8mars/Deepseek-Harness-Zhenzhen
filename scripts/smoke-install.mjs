import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, realpathSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative, isAbsolute, basename, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { parseDocument } from 'yaml';
import { mcpChildEnvironment } from '../packages/dsh-zhen/lib/mcp-market.js';
import { redactLauncherLine } from './log-output.mjs';

// Disposable profile created only by public CLI commands. No browser or HTTP UI
// inspection, user credentials, conversations or paid calls are involved.
const workspace = process.cwd(), cli = resolve('node_modules/@deepseek-ai/dsh/lib/bin.js');
const artifact = JSON.parse(readFileSync('.runtime/package-artifact.json', 'utf8'));
if (!/^dsh-zhen-[\d.]+-[a-f0-9]{16}\.tgz$/.test(artifact.file)) throw new Error('Invalid artifact.');
const archive = resolve('.runtime/packages', artifact.file);
if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== artifact.sha256) throw new Error('Artifact changed.');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--replacement-from' || !/^dsh-zhen-[\d.]+-[a-f0-9]{16}\.tgz$/.test(args[1]) || args[1] === artifact.file)) throw new Error('Usage: smoke-install.mjs [--replacement-from <previous-local-artifact.tgz>]');
const previousArchive = args.length ? resolve('.runtime/packages', args[1]) : undefined;
if (previousArchive && !args[1].endsWith('-' + createHash('sha256').update(readFileSync(previousArchive)).digest('hex').slice(0, 16) + '.tgz')) throw new Error('Previous artifact changed.');
const expectedEntry = createHash('sha256').update(readFileSync('packages/dsh-zhen/lib/index.js')).digest('hex');
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
async function entryDigest() {
  // Public CLI/pnpm exec resolves only our installed package entry, without
  // importing it or reading any profile-private data.
  const output = await run(['plugin', '--profile', 'example', 'exec', process.execPath, '-e', "const{readFileSync}=require('node:fs');const{createHash}=require('node:crypto');console.log('DSH_ZHEN_ENTRY_SHA256='+createHash('sha256').update(readFileSync(require.resolve('dsh-zhen'))).digest('hex'))"]);
  const value = output.match(/DSH_ZHEN_ENTRY_SHA256=([a-f0-9]{64})/);
  if (!value) throw new Error('Installed bundle entry could not be resolved through the public CLI.');
  return value[1];
}
async function listening(port) { return new Promise(done => { const socket = connect({ host: '127.0.0.1', port }); socket.setTimeout(250); socket.once('connect', () => { socket.destroy(); done(true); }); socket.once('error', () => done(false)); socket.once('timeout', () => { socket.destroy(); done(false); }); }); }
try {
  console.log('Creating a disposable profile through the public DSH CLI…');
  await run(['--profile', 'example', '--from-default-profile', 'web', '--dump-config']);
  let priorEntry;
  if (previousArchive) {
    console.log('Installing the previous local artifact to verify same-version replacement…');
    await run(['plugin', '--profile', 'example', 'add', previousArchive, '--ignore-scripts']);
    priorEntry = await entryDigest();
    if (priorEntry === expectedEntry) throw new Error('Replacement probe requires a different previous bundle entry.');
  }
  console.log('Installing the exact local artifact into the disposable profile…');
  await run(['plugin', '--profile', 'example', 'add', archive, '--force', '--ignore-scripts']);
  if (await entryDigest() !== expectedEntry) throw new Error('Installed bundle entry differs from the current artifact build.');
  const text = await run(['--profile', 'example', '--dump-config']);
  const config = parseDocument(text, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] }).toJS();
  const rows = new Map(config.map(row => [row.id, row]));
  const models = rows.get('llm-pi-ai')?.config?.providers?.seedance?.models;
  if (models?.length !== 18 || rows.get('agent-default-model')?.config?.model !== 'deepseek/deepseek-v4.1-flash' || !rows.has('dsh-zhen')) throw new Error('Installed profile composition differs.');
  for (const name of ['session-log-deepseek','plugin-package-inventory-deepseek','deepseek-llm-api-extensions','otel','session-telemetry-otel','product-analytics','desktop-product-telemetry','ui-brand-official']) if (rows.get(name)?.disabled !== true) throw new Error('Required privacy/branding row differs.');
  const port = await choosePort();
  host = spawn(process.execPath, [cli, '--profile', 'example', '--host', '127.0.0.1', '--port', String(port), '--no-open'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  capture(host.stdout); capture(host.stderr); host.once('error', () => {}); host.once('close', () => { hostClosed = true; });
  const deadline = Date.now() + 30000; let ready = false;
  while (!hostClosed && Date.now() < deadline) { if (await listening(port)) { ready = true; break; } await delay(150); }
  if (!ready) throw new Error('Disposable Host did not open its loopback socket.');
  await delay(500);
  if (hostClosed) throw new Error('Disposable Host exited after startup.');
  const evidence = { at: new Date().toISOString(), artifact: artifact.file, sha256: artifact.sha256, node: process.versions.node, installedViaPublicCli: true, installedEntrySha256: expectedEntry, replacementFrom: previousArchive ? args[1] : null, previousEntrySha256: priorEntry ?? null, modelRoutes: models.length, flashDefault: true, designatedCollectorsDisabled: true, hostLoopbackSocket: true, browserInspected: false, paidCalls: 0 };
  mkdirSync(resolve(workspace, '.runtime/evidence'), { recursive: true });
  writeFileSync(resolve(workspace, '.runtime/evidence/installed-bundle-smoke.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
} finally {
  if (host && !hostClosed) { await new Promise(done => { host.once('close', done); host.kill(); }); }
  // A log is diagnostic evidence only; owner-token URLs are redacted.
  mkdirSync(resolve(workspace, '.runtime/evidence'), { recursive: true });
  writeFileSync(resolve(workspace, '.runtime/evidence/installed-bundle-smoke.log'), logs);
  const absolute = realpathSync.native(root), rel = relative(temp, absolute);
  if (!rel || isAbsolute(rel) || rel.startsWith('..') || rel.includes('/') || rel.includes('\\') || !basename(absolute).startsWith('dsh-zhen-install-smoke-')) throw new Error('Temporary cleanup path refused.');
  rmSync(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
