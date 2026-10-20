import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { examplePng } from '../contracts/fixtures/png.mjs';
import { fileURLToPath } from 'node:url';
import { setPriority, constants } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { once } from 'node:events';
import { mcpChildEnvironment } from '../packages/dsh-zhen/lib/mcp-market.js';
import { CanvasPairing } from '../packages/dsh-zhen/lib/canvas-pairing.js';
import { CanvasWorkflow } from '../packages/dsh-zhen/lib/canvas-workflow.js';
import { CanvasRuns } from '../packages/dsh-zhen/lib/canvas-run.js';
import { inspectCanvasCli } from '../packages/dsh-zhen/lib/canvas.js';
const originalArgs = process.argv.slice(2), includeRun = originalArgs.includes('--include-run-intent'), includeAssets = originalArgs.includes('--include-asset-transfer');
const args = originalArgs.filter(value => !['--include-run-intent', '--include-asset-transfer'].includes(value)), evidenceName = includeAssets ? 'asset-transfer' : includeRun ? 'run-intent' : 'workflow';
if (args.length !== 2 || args[0] !== '--canvas-root' || !isAbsolute(args[1])) throw Error('Usage: npm run verify:canvas-native -- --canvas-root <absolute trusted Canvas source repository>');
const root = realpathSync.native(args[1]);
const dshEntrySha256 = createHash('sha256').update(readFileSync(new URL('../packages/dsh-zhen/lib/index.js', import.meta.url))).digest('hex');
const gates = ['inspect', 'development', 'core'].map(mode => {
  const result = spawnSync(process.execPath, [join(root, 'scripts/worktree-role.cjs'), mode], { cwd: root, env: mcpChildEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (result.status !== 0) throw Error('Canvas worktree gate refused this directory.'); return mode;
});
const protectedHashes = { 'tools/ffmpeg-runtime/ffmpeg.exe': '754a10ce2fc4a8c974ff492b351f58c02d35124d1d602fcf30f561fb1bd0f579', 'tools/remove-ai-watermarks-runtime/README.md': '04f13f0adbb8593372fb9ddfa297a0dfb90d9ead0325de0cd340fcfe8b7ced56' };
for (const [file, hash] of Object.entries(protectedHashes)) assert.equal(createHash('sha256').update(readFileSync(join(root, file))).digest('hex'), hash, 'Canvas protected runtime changed');
for (const command of [['diff', '--cached', '--name-only'], ['ls-files', '--unmerged']]) assert.equal(execFileSync('git', ['-C', root, ...command], { encoding: 'utf8', windowsHide: true }).trim(), '', 'Canvas has staged/unmerged changes');
const canvasHead = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
mkdirSync('.runtime/evidence', { recursive: true });
const temporary = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-native-workflow-')));
const authFile = join(temporary, 'EXAMPLE_NATIVE_AUTH.json'), registry = join(temporary, 'EXAMPLE_INSTANCES');
const env = mcpChildEnvironment({ ELECTRON_RUN_AS_NODE: '1', T8PC_PACKAGED: '0', T8PC_DEV_DATA_ROOT: temporary, ZCANVAS_AUTH_STORE: authFile, ZCANVAS_INSTANCE_DIR: registry, T8_COLLAB_MANAGEMENT_TOKEN: 'EXAMPLE_TEST_MANAGEMENT_AUTHORITY_00000000000000000000000000000000' });
const previousAuth = process.env.ZCANVAS_AUTH_STORE, previousRegistry = process.env.ZCANVAS_INSTANCE_DIR, previousHome = process.env.DSH_HOME;
process.env.DSH_HOME = join(temporary, 'EXAMPLE_HOST_HOME');
process.env.ZCANVAS_AUTH_STORE = authFile; process.env.ZCANVAS_INSTANCE_DIR = registry;
const electron = process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron';
const child = spawn(join(root, 'node_modules/electron/dist', electron), ['--max-old-space-size=768', fileURLToPath(new URL('./native-canvas-workflow-worker.cjs', import.meta.url)), root, temporary], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
let priorityLowered = false; try { setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL); priorityLowered = true; } catch {}
let output = '', request = 0; const waiting = new Map();
for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output = (output + String(bytes)).slice(-128 * 1024); });
const ready = new Promise((resolveReady, reject) => { child.on('message', message => { if (message.ready) resolveReady(message); const pending = waiting.get(message.requestId); if (pending) { waiting.delete(message.requestId); message.error ? pending.reject(Error(message.error)) : pending.resolve(message.result); } }); child.once('error', reject); child.once('exit', code => { reject(Error(`Native child exited ${code}`)); for (const pending of waiting.values()) pending.reject(Error('Native child exited')); }); });
function control(action) { const requestId = ++request; return new Promise((resolveControl, reject) => { waiting.set(requestId, { resolve: resolveControl, reject }); child.send({ requestId, action }); }); }
const timeout = setTimeout(() => { child.kill(); }, 120000);
let pairing, workflow, context; let providerCredentialReads = 0;
try {
  const instance = await ready;
  const config = inspectCanvasCli(join(root, 'tools/zcanvas-cli'), instance.id);
  pairing = new CanvasPairing(join(temporary, 'EXAMPLE_PAIRING.json'), () => config);
  workflow = new CanvasWorkflow(join(temporary, 'EXAMPLE_WORKFLOW.json'), () => config);
const pending = await pairing.begin(false, true, includeRun, includeAssets); assert.equal(pending.state, 'pending'); await control('pair-approve'); assert.equal((await pairing.complete()).state, 'paired');
  const targets = await workflow.workspaces(); assert.equal(targets.canvases.length, 4);
  const results = [];
  for (const canvas of instance.canvases) {
    const plan = await workflow.preview({ projectId: canvas.projectId, canvasId: canvas.id, kind: canvas.kind, prompt: `EXAMPLE ${canvas.kind} simple sunrise creative workflow` });
    assert.equal(plan.ready, true); assert.equal(plan.phase, 'preview');
    const staged = await workflow.approve(plan.id, true); assert.equal(staged.phase, 'pending'); assert.equal((await workflow.complete(plan.id)).phase, 'pending');
    await control('approve'); const applied = await workflow.complete(plan.id); assert.equal(applied.phase, 'applied'); assert.ok(applied.revision > plan.canvasRevision);
    results.push({ kind: canvas.kind, planReady: plan.ready, operationCount: plan.operationCount, baseRevision: plan.canvasRevision, revision: applied.revision });
  }
  context = new Context();
  context.provide('credentials', { resolve: async () => { providerCredentialReads++; throw Error('EXAMPLE_NO_PROVIDER_KEY'); }, describe: async () => ({ configured: false, writable: true }) });
  await context.plugin(SystemPrompt); await context.plugin(ToolRuntime); await context.plugin(ZhenService);
  const service = context.get('zhen'); await service.connectCanvas(config.root, config.instance, config.digest);
  const catalog = await service.canvasTools(), tool = catalog.tools.find(tool => tool.capabilityId === 'create.image');
  const source = instance.canvases[0], caller = { session: { id: 'EXAMPLE_NATIVE_CHAT_SESSION' }, options: { provider: 'seedance' } };
  const result = await context.tools.execute({ callId: 'EXAMPLE_NATIVE_CHAT_PLAN', name: 'mcp__t8canvas__canvas_plan', agent: caller, arguments: { tool: tool.name, version: tool.version, operation: 'plan', projectId: source.projectId, canvasId: source.id, input: { prompt: 'EXAMPLE native chat creative workflow', candidates: 1, profile: 'economy' } }, signal: new AbortController().signal });
  assert.equal(result.isError, false); const [candidate] = service.canvasCandidates(); assert.ok(candidate);
  const adopted = await service.canvasCandidateAdopt(candidate.id); assert.equal(adopted.planId, result.value.structuredContent.data.planId);
  assert.equal(adopted.canvasRevision, results[0].revision); assert.equal((await control('stats')).canvases[0].revision, adopted.canvasRevision);
  await service.canvasWorkflowApprove(adopted.id, true); assert.equal((await service.canvasWorkflowComplete(adopted.id)).phase, 'pending');
  await control('approve'); const chatApplied = await service.canvasWorkflowComplete(adopted.id); assert.equal(chatApplied.phase, 'applied'); assert.ok(chatApplied.revision > adopted.canvasRevision);
  assert.equal(providerCredentialReads, 0);
  const nodeTool = catalog.tools.find(tool => tool.capabilityId === 'canvas.node-add'); assert.ok(nodeTool);
  const graphResult = await context.tools.execute({ callId: 'EXAMPLE_NATIVE_GRAPH_PLAN', name: 'mcp__t8canvas__canvas_plan', agent: caller, arguments: { tool: nodeTool.name, version: nodeTool.version, operation: 'plan', projectId: source.projectId, canvasId: source.id, input: { type: 'text' } }, signal: new AbortController().signal });
  assert.equal(graphResult.isError, false); const [graphCandidate] = service.canvasCandidates(); assert.ok(graphCandidate); assert.equal(graphCandidate.preview.action, 'graph.node-add');
  const graphAdopted = await service.canvasCandidateAdopt(graphCandidate.id); assert.equal(graphAdopted.planId, graphResult.value.structuredContent.data.planId);
  await service.canvasWorkflowApprove(graphAdopted.id, true); await control('approve'); const graphApplied = await service.canvasWorkflowComplete(graphAdopted.id); assert.equal(graphApplied.phase, 'applied'); assert.equal(graphApplied.revision, chatApplied.revision + 1);
  const graph = { nativeActionPlan: true, action: graphCandidate.preview.action, nativePlanPreserved: true, revision: graphApplied.revision };
  const chat = { actualPublishedHost: true, actualMcpStdio: true, nativePlanPreserved: true, revision: chatApplied.revision, agentMutationTools: context.tools.schemas().filter(tool => tool.name.startsWith('mcp__t8canvas__')).length === 10 ? 0 : -1, providerCredentialReads };
  assert.equal(chat.agentMutationTools, 0);
  let run;
  if (includeRun) {
    const nodes = await service.canvasRunNodes(source.projectId, source.id), node = nodes.nodes.find(item => item.type === 'image' && item.executable); assert.ok(node);
    const quote = await service.canvasRunQuote({ projectId: source.projectId, canvasId: source.id, canvasRevision: nodes.revision, nodeIds: [node.id] }); assert.equal(quote.priceKnown, false);
    await assert.rejects(service.canvasRunApprove(quote.quoteId, true, false)); assert.equal((await control('stats')).ledger.run_intents, 0);
    await control('drop-run-approval'); await assert.rejects(service.canvasRunApprove(quote.quoteId, true, true)); assert.equal((await service.canvasRunSnapshot()).phase, 'unknown');
    assert.equal((await service.canvasRunRefresh(quote.quoteId)).phase, 'pending'); assert.equal((await service.canvasRunSubmit(quote.quoteId)).phase, 'pending'); assert.equal((await control('stats')).ledger.run_intents, 0);
    await control('approve'); await control('drop-run-complete'); await assert.rejects(service.canvasRunSubmit(quote.quoteId)); assert.equal((await service.canvasRunSnapshot()).phase, 'unknown');
    const resumed = new CanvasRuns(join(process.env.DSH_HOME, 'dsh-zhen/canvas-run.json'), () => config);
    let tracked; try { await assert.rejects(resumed.submit(quote.quoteId)); tracked = await resumed.refresh(quote.quoteId); assert.equal(tracked.phase, 'tracking'); assert.equal(tracked.intent.status, 'accepted'); } finally { resumed.close(); }
    const task = await context.tools.execute({ callId: 'EXAMPLE_NATIVE_INTENT_READ', name: 'mcp__t8canvas__canvas_task_status', arguments: { id: tracked.intent.id, projectId: source.projectId, canvasId: source.id }, signal: new AbortController().signal }); assert.equal(task.isError, false); assert.equal(task.value.structuredContent.id, tracked.intent.id);
    const wrong = await context.tools.execute({ callId: 'EXAMPLE_NATIVE_INTENT_WRONG_SCOPE', name: 'mcp__t8canvas__canvas_task_status', arguments: { id: tracked.intent.id, projectId: source.projectId, canvasId: 'EXAMPLE_OTHER_CANVAS' }, signal: new AbortController().signal }); assert.equal(wrong.isError, true);
    const tasks = await service.canvasTasksList({ projectId: source.projectId, canvasId: source.id }); assert.equal(tasks.items.length, 1); assert.equal(tasks.items[0].id, tracked.intent.id);
    const taskDetail = await service.canvasTaskDetail({ projectId: source.projectId, canvasId: source.id, id: tracked.intent.id }); assert.equal(taskDetail.evidence.verdict, 'not-completed'); assert.equal(taskDetail.evidence.assetRecords, 0);
    const checked = await control('stats'); assert.equal(checked.runHttp.approvalPosts, 1); assert.equal(checked.runHttp.completePosts, 2); assert.equal(checked.ledger.run_intents, 1);
    run = { actualNativeRunPlan: true, priceKnown: false, lostApprovalRecoveredByGet: true, lostCompletionRecoveredByGet: true, resumedReference: true, scopedMcpQuery: true, taskList: { existingIntents: tasks.items.length, evidenceVerdict: taskDetail.evidence.verdict, assetRecords: taskDetail.evidence.assetRecords }, intentStatus: tracked.intent.status, providerDispatchStarted: false, runHttp: checked.runHttp };
  }
  let mediaTransfer;
  if (includeAssets) {
    const image = examplePng(), exported = join(temporary, 'EXAMPLE_EXPORTED.png'), hash = createHash('sha256').update(image).digest('hex'); writeFileSync(exported, image);
    const receipt = { id: randomUUID(), taskRecordId: randomUUID(), ordinal: 1, path: exported, bytes: image.length, sha256: hash, mime: 'image/png', savedAt: new Date().toISOString(), recorded: true }, folder = join(process.env.DSH_HOME, 'dsh-zhen/media-exports'); mkdirSync(folder, { recursive: true });
    const own = new DatabaseSync(join(folder, 'receipts.sqlite')); try { own.exec('CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,receipt TEXT NOT NULL); PRAGMA user_version=1;'); own.prepare('INSERT INTO receipts VALUES(?,?)').run(receipt.id, JSON.stringify(receipt)); } finally { own.close(); }
    const preview = await service.canvasTransferPreview({ receiptId: receipt.id, projectId: source.projectId, canvasId: source.id }); assert.equal(preview.phase, 'preview'); assert.equal((await control('stats')).blobStorageExists, false);
    await control('drop-asset-create'); await assert.rejects(service.canvasTransferApprove(preview.id, true)); assert.equal((await service.canvasTransferRefresh(preview.id)).phase, 'pending');
    assert.equal((await service.canvasTransferComplete(preview.id)).phase, 'pending'); assert.equal((await control('stats')).assetCount, 0); assert.equal((await control('stats')).blobStorageExists, false);
    await control('approve'); await control('drop-asset-complete'); await assert.rejects(service.canvasTransferComplete(preview.id)); const available = await service.canvasTransferRefresh(preview.id); assert.equal(available.phase, 'available');
    const placedPreview = await service.canvasTransferPlacement(preview.id); assert.equal(placedPreview.phase, 'preview'); await service.canvasTransferApprove(preview.id, true); await control('approve'); await control('drop-asset-complete'); await assert.rejects(service.canvasTransferComplete(preview.id)); const placed = await service.canvasTransferRefresh(preview.id); assert.equal(placed.phase, 'applied'); assert.ok(placed.appliedRevision > placedPreview.canvasRevision);
    await assert.rejects(service.canvasTransferComplete(preview.id)); assert.equal(createHash('sha256').update(readFileSync(exported)).digest('hex'), hash);
    const repeated = await service.canvasTransferPreview({ receiptId: receipt.id, projectId: source.projectId, canvasId: source.id }); assert.equal(repeated.phase, 'available'); assert.equal((await service.canvasTransferPlacement(repeated.id)).phase, 'applied');
    const checked = await control('stats'); assert.equal(checked.assetCount, 1); assert.equal(checked.assetsInsideTemp, true); assert.equal(checked.assetHttp.approvalPosts, 2); assert.equal(checked.assetHttp.completePosts, 3);
    mediaTransfer = { receiptMetadataSeeded: true, realExportDownload: false, realNativeAssetUpload: true, originalSourcePreserved: true, previewDidNotCreateImportStorage: true, lostApprovalRecoveredByGet: true, lostImportRecoveredByHash: true, lostPlacementRecoveredByPatch: true, repeatedHandoffReusedAssetAndPatch: true, assets: checked.assetCount, imageNodes: checked.canvases[0].nodes, appliedRevision: placed.appliedRevision, assetHttp: checked.assetHttp };
  }
  const stats = await control('stats'); assert.equal(stats.externalAttempts, 0); assert.equal(providerCredentialReads, 0); assert.ok(stats.sqliteOpens >= 1); assert.ok(stats.canvases.every(canvas => canvas.nodes > 0)); for (const [table, count] of Object.entries(stats.ledger)) assert.equal(count, includeRun && table === 'run_intents' ? 1 : 0); assert.ok(stats.compiledModules > 0); assert.match(stats.compiledSourceDigest, /^[a-f0-9]{64}$/);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../packages/dsh-zhen/lib/index.js', import.meta.url))).digest('hex'), dshEntrySha256, 'DSH bundle changed during native verification');
  const report = { canvasHead, gates, priorityLowered, dshEntrySha256, chat, graph, run, mediaTransfer, at: new Date().toISOString(), realNativeRoutes: true, realNativeCreative: true, realNativePatchDatabase: true, databaseFreshSystemTemp: true, simulatedWindowApproval: true, actualDesktopWindow: false, cliDigest: config.digest, results, stats, paidCalls: 0, userDatabaseRead: false };
  writeFileSync(`.runtime/evidence/native-canvas-${evidenceName}.json`, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
} finally {
  clearTimeout(timeout); await context?.fiber.dispose(); pairing?.close(); workflow?.close();
  if (child.exitCode === null && child.connected) { try { await control('stop'); } catch {} }
  if (child.exitCode === null) await once(child, 'exit');
  writeFileSync(`.runtime/native-canvas-${evidenceName}.log`, output);
  if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
  if (previousAuth === undefined) delete process.env.ZCANVAS_AUTH_STORE; else process.env.ZCANVAS_AUTH_STORE = previousAuth;
  if (previousRegistry === undefined) delete process.env.ZCANVAS_INSTANCE_DIR; else process.env.ZCANVAS_INSTANCE_DIR = previousRegistry;
  const rel = relative(realpathSync.native(tmpdir()), temporary); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); rmSync(temporary, { recursive: true, force: true });
}
