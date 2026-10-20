import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { projectCanvasSurfaces, sameCanvasCatalog, canvasPlanResultSchema } from '../packages/dsh-zhen/lib/canvas-contract.js';

// Cross-check only the already reviewed immutable public policy helper. It has
// one static JSON dependency; dispatch is an inert synthetic callback. This is
// not a running Canvas, original route handler, database or provider test.
const lock = JSON.parse(await readFile('UPSTREAM.lock.json','utf8'));
const facts = JSON.parse(await readFile('contracts/fixtures/canvas-surface-facts.json','utf8'));
if (facts.evidence.commit !== lock.canvas.commit) throw new Error('Review new Canvas facts before changing the source probe.');
const helperHash = 'cede026a92342d6502814a1c8baa28e21b77d69fc1903789e2d4bcb5ab0b03b1';
const base = `https://raw.githubusercontent.com/T8mars/T8-penguin-canvas/${lock.canvas.commit}/`;
async function source(path, expected) {
  const response = await fetch(base + path,{ redirect:'error', signal:AbortSignal.timeout(30000) });
  if (!response.ok || Number(response.headers.get('content-length')) > 1024 * 1024) throw new Error('Public Canvas source unavailable.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Public Canvas source changed identity.');
  return bytes;
}
const [helper,surfaces] = await Promise.all([
  source('backend/src/services/agentControlCapabilityTools.js',helperHash),
  source(facts.evidence.path,facts.evidence.sha256),
]);
const temp = await realpath(tmpdir()), root = await mkdtemp(join(temp,'dsh-zhen-canvas-public-contract-'));
try {
  await mkdir(join(root,'services')); await mkdir(join(root,'shared'));
  await writeFile(join(root,'services/policy.cjs'),helper);
  await writeFile(join(root,'shared/creativeCapabilitySurfaces.json'),surfaces);
  const { createAgentControlCapabilityToolService } = createRequire(import.meta.url)(join(root,'services/policy.cjs'));
  let dispatches = 0;
  const service = createAgentControlCapabilityToolService({ dispatch:async () => { dispatches++; return { planId:'EXAMPLE_ONLY_INERT_PLAN',ready:true }; } });
  const catalog = service.catalog();
  assert.ok(sameCanvasCatalog(projectCanvasSurfaces(facts),catalog));
  let checked = 0, refused = 0;
  for (const tool of catalog.tools) for (const operation of tool.operations) {
    const request = {schema:'t8-versioned-creative-tool-request-v1',tool:tool.name,version:tool.version,operation:operation.operation,projectId:'EXAMPLE_PROJECT',canvasId:'EXAMPLE_CANVAS',input:{}};
    const prepared = service.prepare(request);
    if (tool.directOperations.includes(operation.operation)) {
      const result = canvasPlanResultSchema.parse(await service.invokePrepared(prepared,{actorId:'EXAMPLE_ACTOR',sessionId:'EXAMPLE_SESSION'}));
      assert.equal(result.tool.name,tool.name);assert.equal(result.tool.operation,operation.operation);checked++;
    } else {
      await assert.rejects(service.invokePrepared(prepared),error=>error.code==='CAPABILITY_TOOL_APPROVAL_REQUIRED');refused++;
    }
  }
  assert.equal(dispatches,checked);
  const evidence = { at:new Date().toISOString(),commit:lock.canvas.commit,sourceSha256:facts.evidence.sha256,helperSha256:helperHash,toolContracts:catalog.tools.length,directL0Operations:checked,nonDirectOperationsRefused:refused,dispatches,dispatch:'inert synthetic callback',installedCanvas:false,routeHandlersExecuted:false,browserInspected:false,paidCalls:0 };
  await mkdir('.runtime/evidence',{recursive:true});await writeFile('.runtime/evidence/canvas-public-contract.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
} finally {
  const absolute = await realpath(root), rel = relative(temp,absolute);
  if (!rel || isAbsolute(rel) || rel.startsWith('..') || rel.includes('/') || rel.includes('\\') || !rel.startsWith('dsh-zhen-canvas-public-contract-')) throw new Error('Temporary cleanup refused.');
  await rm(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
