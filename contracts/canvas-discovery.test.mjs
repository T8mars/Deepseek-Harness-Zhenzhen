import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { mkdtempSync, realpathSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { exampleCanvasInstall } from './fixtures/canvas-install.mjs';

test('C24: actual published Host discovery is inert; reviewed digest gates mount and preserves the previous configuration after drift', async () => {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-canvas-discovery-host-'))), f = exampleCanvasInstall(base);
  mkdirSync(f.home, { recursive: true });
  const names = ['DSH_HOME', 'USERPROFILE', 'HOME', 'CODEX_HOME', 'LOCALAPPDATA', 'ZCANVAS_INSTALL_ROOT'];
  const previous = new Map(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, f.options.env, { DSH_HOME: join(base, 'EXAMPLE_DSH'), USERPROFILE: f.home, HOME: f.home, ZCANVAS_INSTALL_ROOT: f.install });
  assert.equal(homedir(), f.home, 'do not inspect real managed discovery directories in this contract');
  const ctx = new Context(); let keys = 0;
  ctx.provide('credentials', { resolve: async () => { keys++; throw Error('EXAMPLE_NO_CREDENTIAL_READ'); }, describe: async () => ({ configured: false, writable: true }) });
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService);
    const service = ctx.get('zhen'), schema = TYPERT_REMOTE.methods['zhen/canvasDiscover'].result.create();
    const result = service.canvasDiscover(); assert.deepEqual(schema.parse(result), result); assert.equal(result.candidates.length, 1);
    const candidate = result.candidates[0], state = join(process.env.DSH_HOME, 'dsh-zhen', 'canvas.json');
    assert.equal(existsSync(state), false); assert.equal(ctx.tools.schemas().some(tool => tool.name.startsWith('mcp__t8canvas__')), false);
    const connectCodec = TYPERT_REMOTE.methods['zhen/connectCanvas'].parameters[2].strictCodec.create();
    assert.equal(connectCodec.parse(undefined), ''); assert.equal(connectCodec.safeParse('EXAMPLE_BAD_PIN').success, false);
    writeFileSync(join(f.root, 'src/agentClient.cjs'), "throw Error('EXAMPLE_CHANGED_CODE_MUST_NOT_EXECUTE');");
    await assert.rejects(service.connectCanvas(candidate.root, '', candidate.digest), error => error.details?.reason === 'CLI_CHANGED');
    assert.equal(existsSync(state), false); assert.equal(ctx.tools.schemas().some(tool => tool.name.startsWith('mcp__t8canvas__')), false);
    writeFileSync(join(f.root, 'src/discovery.cjs'), 'exports.discoverInstances=async()=>[];');
    writeFileSync(join(f.root, 'src/secureStore.cjs'), "exports.loadSession=()=>{throw Error('EXAMPLE_NO_SESSION_READ');};");
    writeFileSync(join(f.root, 'src/agentClient.cjs'), "exports.selectInstance=async()=>{throw Error('EXAMPLE_NO_INSTANCE');};exports.requestAgentControl=async()=>{throw Error('EXAMPLE_NO_HTTP');};");
    const reviewed = service.canvasDiscover().candidates[0];
    const status = await service.connectCanvas(reviewed.root, '', reviewed.digest); assert.equal(status.code, 'APP_NOT_RUNNING');
    assert.equal(ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__t8canvas__')).length, 11);
    const saved = readFileSync(state, 'utf8'); assert.equal(JSON.parse(saved).digest, reviewed.digest);
    writeFileSync(join(f.root, 'src/agentClient.cjs'), "throw Error('EXAMPLE_LATER_CODE_MUST_NOT_EXECUTE');");
    await assert.rejects(service.connectCanvas(reviewed.root, '', reviewed.digest), error => error.details?.reason === 'CLI_CHANGED');
    assert.equal(readFileSync(state, 'utf8'), saved); assert.equal((await service.canvasStatus()).code, 'CLI_CHANGED');
    assert.equal(keys, 0);
    await service.disconnectCanvas(); assert.equal(ctx.tools.schemas().some(tool => tool.name.startsWith('mcp__t8canvas__')), false);
  } finally {
    await ctx.fiber.dispose(); for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    const rel = relative(realpathSync.native(tmpdir()), base); assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..')); rmSync(base, { recursive: true, force: true });
  }
});
