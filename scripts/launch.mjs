import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join, delimiter } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';
import { redactLauncherLine } from './log-output.mjs';
import { acquireRuntimeLease, assertRuntimeLease } from './runtime-lifecycle.mjs';
import { selectDefaultArt } from './launch-art.mjs';
import { readLaunchArtifact } from './launch-artifact.mjs';
import { assertBundleIsolation } from './bundle-isolation.mjs';

export async function launch(preparedLease, flags = process.argv.slice(2)) {
if (flags.some(value => !['--check', '--no-open'].includes(value))) throw new Error('Usage: npm start -- [--check] [--no-open]');
const root = process.cwd();
const runtime = resolve(root, '.runtime');
const home = join(runtime, 'dsh-home');
const cli = resolve(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
assertBundleIsolation(cli);
const manifest = JSON.parse(readFileSync(resolve(root, 'packages/dsh-zhen/package.json'), 'utf8'));
const {artifact,archivePath:archive,digest}=readLaunchArtifact(root,manifest);
const marker = join(runtime, 'installed.json');
const env = { ...process.env, DSH_HOME: home };
const art = selectDefaultArt(root, env); delete env.DSH_ZHEN_ART_ROOT; delete env.DSH_ZHEN_ART_DIGEST; Object.assign(env, art.environment);
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
env[pathKey] = resolve(root, 'node_modules/.bin') + delimiter + (env[pathKey] ?? '');
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { env, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`DSH ${args[0]} failed: ${redactLauncherLine((result.stdout + '\n' + result.stderr).slice(-5000))}`);
  return result.stdout;
}
const lease = preparedLease === undefined ? await acquireRuntimeLease(runtime) : await assertRuntimeLease(preparedLease, runtime);
try {
const installed = existsSync(marker) ? JSON.parse(readFileSync(marker, 'utf8')) : undefined;
if (!installed) {
  // This operation creates through the public CLI only. Never overwrite an existing profile.
  if (existsSync(join(home, 'profiles/zhen'))) throw new Error('Existing unowned profile detected. Choose another runtime directory or install the bundle through dsh plugin yourself.');
  run(['--profile', 'zhen', '--from-default-profile', 'web', '--dump-config']);
  writeFileSync(marker, JSON.stringify({ digest: '', version: manifest.version }) + '\n');
}
if (installed?.digest !== digest || installed?.file !== artifact.file) {
  console.log('Installing the built bundle into the isolated DSH-zhen profile…');
  // Public CLI forwarding only: replace same-version local archives and do not
  // run dependency lifecycle scripts. The profile is offline under our lease.
  run(['plugin', '--profile', 'zhen', 'add', archive, '--force', '--ignore-scripts']);
  writeFileSync(marker, JSON.stringify({ digest, file: artifact.file, version: manifest.version }) + '\n');
}
const config = parseDocument(run(['--profile', 'zhen', '--dump-config']), { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] }).toJS();
const rows = new Map(config.map(row => [row.id, row]));
if (rows.get('agent-default-model')?.config?.provider !== 'seedance' || rows.get('agent-default-model')?.config?.model !== 'deepseek/deepseek-v4.1-flash' || !rows.has('dsh-zhen')) throw new Error('The supported bundle was not applied. Startup refused.');
for (const id of ['session-log-deepseek', 'plugin-package-inventory-deepseek', 'deepseek-llm-api-extensions', 'otel', 'session-telemetry-otel', 'product-analytics', 'desktop-product-telemetry', 'ui-brand-official']) {
  if (rows.get(id)?.disabled !== true) throw new Error(`Required private default was overridden: ${id}`);
}
if (flags.includes('--check')) { console.log('Isolated profile and privacy defaults verified.'); }
else {
if (art.state === 'ready') console.log('已选择本机确认的社区默认美术。');
else if (art.state === 'unavailable') console.log('默认美术暂不可用，将使用个人替换或水纹图形。');
await lease.releasePort();
const child = spawn(process.execPath, [cli, '--profile', 'zhen', '--host', '127.0.0.1', '--port', '5180', ...(flags.includes('--no-open') ? ['--no-open'] : [])], { env, windowsHide: true, stdio: ['inherit', 'pipe', 'pipe'] });
for (const [stream, sink] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => { pending += chunk; const lines = pending.split('\n'); pending = lines.pop(); for (const line of lines) sink.write(redactLauncherLine(line) + '\n'); });
  stream.on('end', () => { if (pending) sink.write(redactLauncherLine(pending)); });
}
const interrupt = () => child.kill('SIGINT'), terminate = () => child.kill('SIGTERM');
process.on('SIGINT', interrupt);
process.on('SIGTERM', terminate);
try {
  await new Promise((done, reject) => { child.once('error', reject); child.once('close', code => { process.exitCode = code ?? 1; done(); }); });
} finally { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); }
}
} finally { await lease.release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await launch().catch(error => { console.error(redactLauncherLine(error.message)); process.exitCode = 1; });
