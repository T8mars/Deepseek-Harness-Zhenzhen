import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { CanvasPairing } from '../../packages/dsh-zhen/lib/canvas-pairing.js';
import { inspectCanvasCli } from '../../packages/dsh-zhen/lib/canvas.js';
const require = createRequire(import.meta.url), source = new URL('./canvas-auth/', import.meta.url);
const { createAgentControlAuthService } = require(fileURLToPath(new URL('auth.cjs', source)));
globalThis.__DSH_EXAMPLE_PAIRING_FIXTURES ??= new Map();

export async function canvasPairingFixture({ dpapi = false, stdio = false, transactionStore = false } = {}) {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-canvas-pairing-'))), root = join(base, 'EXAMPLE_CLI');
  mkdirSync(join(root, 'src'), { recursive: true });
  const id = randomUUID(), key = randomBytes(32), clock = { value: Date.now() };
  const state = { requests: [], created: [], failProtect: false, dropPoll: false, onCreate: undefined, storeWrites: 0, descriptor: undefined, clock };
  const auth = createAgentControlAuthService({ now: () => clock.value });
  const credentialFile = join(base, 'EXAMPLE_NATIVE', 'credentials.json');
  const nativeSource = transactionStore ? new URL('./canvas-auth-transaction/', import.meta.url) : source;
  const options = { env: { ZCANVAS_AUTH_STORE: credentialFile } };
  if (!dpapi) Object.assign(options, {
    protect(value) {
      state.onProtect?.();
      if (state.failProtect) throw Object.assign(Error('EXAMPLE_PROTECTION_FAILURE'), { code: 'CREDENTIAL_STORE_UNAVAILABLE' });
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv), body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
    },
    unprotect(value) { const bytes = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'); },
  });
  state.options = options;
  globalThis.__DSH_EXAMPLE_PAIRING_FIXTURES.set(id, state);
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) { raw += chunk; assert.ok(Buffer.byteLength(raw, 'utf8') <= 128 * 1024); }
    const body = raw ? JSON.parse(raw) : {};
    state.requests.push({ path: req.url, method: req.method, keys: Object.keys(body), authorized: !!req.headers.authorization });
    try {
      let data;
      const routed = state.route ? await state.route(req, body, auth, res) : undefined;
      if (routed !== undefined) { data = routed; }
      else if (req.method === 'GET' && req.url === '/api/agent-control/v1/status') {
        data = { compat: { supported: true, fixture: 'EXAMPLE_ONLY' } };
      } else if (req.method === 'POST' && req.url === '/api/agent-control/v1/pairings') {
        data = auth.createPairing(body); state.created.push(data); state.onCreate?.();
        if (state.dropCreate) { state.dropCreate = false; res.destroy(); return; }
      } else if (req.method === 'POST' && /^\/api\/agent-control\/v1\/pairings\/[0-9a-f-]+\/poll$/.test(req.url)) {
        data = auth.pollPairing({ pairingId: req.url.split('/')[5], pollSecret: body.pollSecret });
        state.onPoll?.(data);
        if (state.dropPoll) { state.dropPoll = false; res.destroy(); return; }
      } else if (req.method === 'GET' && req.url === '/api/agent-control/v1/session') {
        data = auth.authenticate(String(req.headers.authorization || '').replace(/^Bearer /, ''), []);
      } else if (req.method === 'GET' && req.url === '/api/agent-control/v1/workspaces') {
        auth.authenticate(String(req.headers.authorization || '').replace(/^Bearer /, ''), ['canvas:read']);
        data = { projects: [{ id: 'EXAMPLE_EMPTY_PROJECT', name: 'EXAMPLE_EMPTY_PROJECT' }] };
      } else throw Object.assign(Error('EXAMPLE_ROUTE_REFUSED'), { code: 'EXAMPLE_ROUTE_REFUSED', status: 400 });
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ schema: 't8-agent-control-http-v1', ok: true, data }));
    } catch (error) { res.writeHead(error.status || 400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ schema: 't8-agent-control-http-v1', ok: false, code: error.code || 'EXAMPLE_FAILED', message: 'EXAMPLE safe error' })); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const manifest = { schema: 't8-zcanvas-manifest-v1', skillVersion: '0.1.0-dev', cliVersion: '0.1.0-dev', controlProtocol: 't8-agent-control-v1', canvasPatchProtocol: 't8-canvas-patch-v1', nodeSchemaDigest: '1'.repeat(64), providerCatalogDigest: '2'.repeat(64), creativeCapabilityManifestDigest: '3'.repeat(64), creativeCapabilityGraphDigest: '4'.repeat(64), manifestDigest: '5'.repeat(64), minimumDesktopVersion: '2.6.4' };
  state.descriptor = { ...manifest, appVersion: '3.3.6', instanceId: 'EXAMPLE_ONLY_INSTANCE', origin: `http://127.0.0.1:${server.address().port}` };
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
  copyFileSync(new URL('agentClient.cjs', source), join(root, 'src/agentClient.cjs'));
  copyFileSync(new URL('secureStore.cjs', nativeSource), join(root, 'src/native-secureStore.cjs'));
  if (transactionStore) copyFileSync(new URL('secureStoreTransactions.cjs', nativeSource), join(root, 'src/secureStoreTransactions.cjs'));
  const get = `globalThis.__DSH_EXAMPLE_PAIRING_FIXTURES.get(${JSON.stringify(id)})`;
  writeFileSync(join(root, 'src/manifest.cjs'), `exports.readManifest=()=>(${JSON.stringify(manifest)});`);
  writeFileSync(join(root, 'src/discovery.cjs'), stdio ? `exports.discoverInstances=async()=>[${JSON.stringify(state.descriptor)}];` : `exports.discoverInstances=async()=>[${get}.descriptor];`);
  if (stdio) copyFileSync(new URL('secureStore.cjs', nativeSource), join(root, 'src/secureStore.cjs'));
  else writeFileSync(join(root, 'src/secureStore.cjs'), `const native=require('./native-secureStore.cjs');const state=${get};const count={configuredInstances:0,loadPending:1,storePending:2,deletePending:1,loadSession:1,storeSession:2,storeApproval:2,loadApproval:2,deleteApproval:2};for(const name of Object.keys(count))exports[name]=(...args)=>{if(name==='storeSession'||name==='storePending')state.storeWrites++;const at=count[name],options={...args[at],...state.options};return native[name](...args.slice(0,at),options);};`);
  let config = inspectCanvasCli(root);
  const file = join(base, 'EXAMPLE_DSH', 'canvas-pairing.json'), pairing = new CanvasPairing(file, () => config);
  return { base, root, file, pairing, state, auth, credentialFile, server, config: () => config, changeConfig: next => { config = next; },
    originalStore: require(join(root, 'src/native-secureStore.cjs')),
    approve(scopes) { const pending = auth.listPendingPairings()[0]; assert.ok(pending); return auth.approvePairing({ pairingId: pending.pairingId, userCode: pending.userCode, approvedScopes: scopes, approvedBy: 'EXAMPLE_WINDOW_OWNER' }); },
    async dispose() { pairing.close(); await new Promise(done => server.close(done)); globalThis.__DSH_EXAMPLE_PAIRING_FIXTURES.delete(id); const rel = relative(realpathSync.native(tmpdir()), base); assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..')); rmSync(base, { recursive: true, force: true }); },
  };
}
export function assertOriginalCanvasAuthFixtures() {
  const metadata = JSON.parse(readFileSync(new URL('source.json', source)));
  for (const entry of metadata.files) { const text = readFileSync(new URL(entry.file, source), 'utf8').replaceAll('\r\n', '\n'); assert.equal(createHash('sha256').update(text).digest('hex'), entry.canonicalSha256 || entry.sha256); }
  return metadata;
}
