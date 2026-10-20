'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const Module = require('node:module');
const [root, temporary] = process.argv.slice(2);
const includeModelChoices=process.argv.includes('--include-model-choices'),includeReferences=process.argv.includes('--include-reference-assets');
assert.ok(root && temporary && fs.realpathSync.native(temporary) === temporary);
const below = value => { const rel = path.relative(temporary, path.resolve(String(value))); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
let sqliteOpens = 0, externalAttempts = 0, dropRunApproval = false, dropRunComplete = false, dropAssetApproval = false, dropAssetComplete = false;
const runHttp = { approvalPosts: 0, completePosts: 0, operationGets: 0 };
const runApprovalIds = new Set();
const assetHttp = { approvalPosts: 0, completePosts: 0 }, assetApprovalIds = new Set();
const compiledSources = new Map(), compile = Module.prototype._compile;
Module.prototype._compile = function(content, filename, ...args) {
  const relative = path.relative(root, filename).replaceAll('\\', '/');
  if (relative.startsWith('backend/src/')) compiledSources.set(relative, crypto.createHash('sha256').update(String(content)).digest('hex'));
  return compile.call(this, content, filename, ...args);
};
const load = Module._load;
Module._load = function(name, ...args) {
  const result = load.call(this, name, ...args);
  if (name !== 'better-sqlite3') return result;
  return new Proxy(result, { construct(target, argumentsList) { assert.ok(argumentsList[0] === ':memory:' || below(argumentsList[0]), 'Refuse any non-TEMP SQLite file'); sqliteOpens++; return Reflect.construct(target, argumentsList); } });
};
const originalRead = fs.readFileSync;
fs.readFileSync = function(file, ...args) { if (typeof file === 'string' && /(?:^|[\\/])(?:settings\.json|\.credentials[^\\/]*)$/i.test(file)) assert.ok(below(file), 'Refuse any non-TEMP settings/credentials'); return originalRead.call(this, file, ...args); };
const blocked = () => { externalAttempts++; throw Error('EXAMPLE_PROVIDER_NETWORK_DISABLED'); };
globalThis.fetch = blocked; http.request = blocked; https.request = blocked;
const requireCanvas = Module.createRequire(path.join(root, 'package.json'));
const express = requireCanvas('express');
const { ProjectDatabase } = requireCanvas('./backend/src/services/projectDatabase.js');
const { DEFAULT_PROJECT_ID } = requireCanvas('./backend/src/collaboration/protocol.js');
const { createAgentControlAuthService } = requireCanvas('./backend/src/services/agentControlAuth.js');
const { createAgentControlApprovalService } = requireCanvas('./backend/src/services/agentControlApprovals.js');
const { createAgentControlRouter } = requireCanvas('./backend/src/routes/agentControl.js');
const { compatibilitySnapshot } = requireCanvas('./backend/src/services/agentControlCompatibility.js');
const manifest = compatibilitySnapshot();
const version = requireCanvas('./package.json').version;
const database = new ProjectDatabase(path.join(temporary, 'EXAMPLE_NATIVE.sqlite3'), { autoBackup: false });
const canvases = ['image', 'video', 'script', 'story',...(includeModelChoices?['audio']:[])].map(kind => {
  const id = `EXAMPLE_NATIVE_${kind}`; database.ensureCanvas(id, { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, DEFAULT_PROJECT_ID); return { id, kind, projectId: DEFAULT_PROJECT_ID };
});
const auth = createAgentControlAuthService(), approvals = createAgentControlApprovalService();
const id = crypto.randomBytes(32).toString('base64url');
const app = express(); app.use(express.json({ limit: '128kb' }));
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path.endsWith('/run-start-approvals')) runHttp.approvalPosts++;
  if (req.method === 'POST' && /\/approvals\/[^/]+\/complete$/.test(req.path) && runApprovalIds.has(req.path.split('/').at(-2))) runHttp.completePosts++;
  if (req.method === 'POST' && /\/asset-(?:import|place)-approvals$/.test(req.path)) assetHttp.approvalPosts++;
  if (req.method === 'POST' && /\/approvals\/[^/]+\/complete$/.test(req.path) && assetApprovalIds.has(req.path.split('/').at(-2))) assetHttp.completePosts++;
  if (req.method === 'GET' && req.path.includes('/by-operation/')) runHttp.operationGets++;
  const json = res.json;
  res.json = function(body) {
    if(includeReferences&&body?.code==='APPROVAL_STALE')console.log(JSON.stringify({referenceApprovalStale:typeof body.message==='string'&&body.message.includes('目录')?'catalog':typeof body.message==='string'&&body.message.includes('凭据')?'readiness':'binding'}));
    if(includeReferences&&body?.data?.modelDecisionReceipt)console.log(JSON.stringify({referencePlan:{kind:body.data.kind,requiredModels:(body.data.modelDecisionReceipt.decisions??[]).filter(item=>item.required).map(item=>({kind:item.kind,id:item.selected?.id??''}))}}));
    if (body?.data?.action === 'run.start' && req.path.endsWith('/run-start-approvals')) runApprovalIds.add(body.data.approvalRequestId);
    if (/^asset\.(?:import|place)$/.test(body?.data?.action || '') && /\/asset-(?:import|place)-approvals$/.test(req.path)) assetApprovalIds.add(body.data.approvalRequestId);
    if (/^asset\.(?:import|place)$/.test(body?.data?.action || '') && (dropAssetApproval && /\/asset-(?:import|place)-approvals$/.test(req.path) || dropAssetComplete && req.path.endsWith('/complete'))) { if (req.path.endsWith('/complete')) dropAssetComplete = false; else dropAssetApproval = false; res.destroy(); return res; }
    if (body?.data?.action === 'run.start' && (dropRunApproval && req.path.endsWith('/run-start-approvals') || dropRunComplete && req.path.endsWith('/complete'))) { if (req.path.endsWith('/complete')) dropRunComplete = false; else dropRunApproval = false; res.destroy(); return res; }
    return json.call(this, body);
  }; next();
});
const server = http.createServer(app);
let heartbeat;
function stats() {
  const tables = database.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%run_intent%' OR name IN ('runs','node_runs','run_attempts','attempts','generation_attempts'))").all().map(row => row.name);
  const ledger = Object.fromEntries(tables.map(name => [name, database.db.prepare(`SELECT COUNT(*) AS total FROM "${name}"`).get().total]));
  const sourceEntries = [...compiledSources.entries()].sort(([left], [right]) => left.localeCompare(right));
  const compiledSourceDigest = crypto.createHash('sha256').update(JSON.stringify(sourceEntries)).digest('hex');
  const assets = database.listAssets({ projectId: DEFAULT_PROJECT_ID, limit: 100 });
  return { canvases: canvases.map(canvas => { const document = database.getCanvas(canvas.id); return { ...canvas, revision: document.revision, nodes: document.nodes.length, edges: document.edges.length }; }), sqliteOpens, externalAttempts, ledger, runHttp, assetHttp, assetCount: assets.length, assetsInsideTemp: assets.every(asset => below(asset.managedPath)), blobStorageExists: fs.existsSync(path.join(temporary, 'EXAMPLE_BLOBS')), compiledModules: sourceEntries.length, compiledSourceDigest };
}
async function stop() { clearInterval(heartbeat); await new Promise(done => server.close(done)); database.close(); process.disconnect?.(); }
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port, origin = `http://127.0.0.1:${port}`;
  app.get('/api/status', (_req, res) => res.json({ ok: true, service: 't8-penguin-canvas-backend', instanceId: id, port, version }));
  app.use('/api/agent-control/v1', createAgentControlRouter({ auth, approvals, database, config: { PORT: port, APP_VERSION: version, BACKEND_INSTANCE_ID: id, SETTINGS_FILE: path.join(temporary, 'EXAMPLE_SETTINGS.json'), DATA_DIR: path.join(temporary, 'EXAMPLE_DATA'), INPUT_DIR: path.join(temporary, 'EXAMPLE_INPUT'), OUTPUT_DIR: path.join(temporary, 'EXAMPLE_OUTPUT'), ASSET_BLOB_DIR: path.join(temporary, 'EXAMPLE_BLOBS'), COLLAB_UPLOAD_TEMP_DIR: path.join(temporary, 'EXAMPLE_UPLOADS') }, settingsProvider: () => [], credentialSettingsProvider: () => ({ zhenzhenSd2ApiKey: 'EXAMPLE_NOT_A_REAL_PROVIDER_KEY_000000000000000000',...(includeReferences?{llmApiKey:'EXAMPLE_NOT_A_REAL_VISION_KEY_000000000000000000'}:{}) }), runtimeStatusProvider: () => ({}) }));
  fs.mkdirSync(process.env.ZCANVAS_INSTANCE_DIR, { recursive: true });
  const exact = ['skillVersion','cliVersion','controlProtocol','canvasPatchProtocol','nodeSchemaDigest','providerCatalogDigest','creativeCapabilityManifestDigest','creativeCapabilityGraphDigest','manifestDigest'];
  const publish = () => fs.writeFileSync(path.join(process.env.ZCANVAS_INSTANCE_DIR, `${id}.json`), JSON.stringify({ ...Object.fromEntries(exact.map(key => [key, manifest[key]])), schema: 't8-agent-control-instance-v1', instanceId: id, pid: process.pid, origin, appVersion: version, heartbeatAt: new Date().toISOString(), staleAfterMs: 20000 }));
  publish(); heartbeat = setInterval(publish, 5000); heartbeat.unref();
  process.send({ ready: true, id, canvases, sqliteOpens, origin });
});
process.on('message', async message => {
  try {
    let result;
    if (message.action === 'pair-approve') { const pending = auth.listPendingPairings()[0]; assert.ok(pending); result = auth.approvePairing({ pairingId: pending.pairingId, userCode: pending.userCode, approvedScopes: pending.requestedScopes, approvedBy: 'EXAMPLE_ISOLATED_TEST_WINDOW' }); }
    else if (message.action === 'approve') { const pending = approvals.listPending()[0]; assert.ok(pending); approvals.approve(pending.approvalRequestId); result = { approved: true }; }
    else if (message.action === 'drop-run-approval') { dropRunApproval = true; result = { armed: true }; }
    else if (message.action === 'drop-run-complete') { dropRunComplete = true; result = { armed: true }; }
    else if (message.action === 'drop-asset-create') { dropAssetApproval = true; result = { armed: true }; }
    else if (message.action === 'drop-asset-complete') { dropAssetComplete = true; result = { armed: true }; }
    else if (message.action === 'stats') result = stats();
    else if(message.action==='seed-references'&&includeReferences){
      assert.ok(Array.isArray(message.assets)&&message.assets.length===2);result=[];
      for(const [index,input] of message.assets.entries()){assert.equal(input.id,'EXAMPLE_REFERENCE_'+index);const bytes=Buffer.from(input.base64,'base64');assert.ok(bytes.length>0&&bytes.length<4096);const target=path.join(temporary,input.id+'.png');fs.writeFileSync(target,bytes,{flag:'wx'});const asset=database.upsertAsset({id:input.id,projectId:DEFAULT_PROJECT_ID,filename:input.id+'.png',kind:'image',managedPath:target,storageMode:'managed',availability:'available',mimeType:'image/png',sizeBytes:bytes.length,contentHash:crypto.createHash('sha256').update(bytes).digest('hex'),metadata:{width:index+1,height:1,size:bytes.length}});result.push({id:asset.id,contentHash:asset.contentHash,contentRevision:asset.contentRevision});}
    }
    else if(message.action==='reference-facts'&&includeReferences)result=canvases.map(canvas=>({id:canvas.id,nodes:database.getCanvas(canvas.id).nodes.slice(0,100).map(node=>({id:node.id,type:node.type,referenceAssetIds:node.data?.referenceAssetIds??[],bindings:(node.data?.referenceBindings??[]).map(binding=>({assetId:binding.assetId??'',kind:binding.kind??'',contentRevision:binding.contentRevision??0,contentHash:binding.contentHash??''})),imageReferenceCount:(node.data?.referenceImages??node.data?.localRefImages??[]).length}))}));
    else if(message.action==='model-facts'&&includeModelChoices)result=canvases.map(canvas=>({id:canvas.id,kind:canvas.kind,nodes:database.getCanvas(canvas.id).nodes.slice(0,100).map(node=>({id:node.id,type:node.type,model:node.data?.model??'',providerSource:node.data?.providerSource??'',apiModel:node.data?.apiModel??'',providerModel:node.data?.providerModel??'',seedanceNzModel:node.data?.seedanceNzModel??''}))}));
    else if (message.action === 'stop') { process.send({ requestId: message.requestId, result: stats() }); await stop(); return; }
    else throw Error('EXAMPLE_ACTION_REFUSED');
    process.send({ requestId: message.requestId, result });
  } catch (error) { process.send({ requestId: message.requestId, error: error.code || error.message }); }
});
process.on('disconnect', () => { clearInterval(heartbeat); try { database.close(); } catch {} server.close(); });
