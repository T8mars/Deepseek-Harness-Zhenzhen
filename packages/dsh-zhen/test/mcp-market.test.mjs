import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpMarket, inspectMcpRelease, inspectMcpInstallation, mcpChildEnvironment, mcpNodeCompatible, canonicalMcpWorkspace } from '../lib/mcp-market.js';
import { MCP_RECIPES } from '../lib/mcp-market-schema.js';
import { fixtureInstallation } from '../../../contracts/fixtures/mcp-market.mjs';

function metadata(id, version = '2.0.0') { const recipe = MCP_RECIPES[id]; return { name: recipe.package, version, repository: { url: 'git+https://github.com/modelcontextprotocol/servers.git' }, bin: { [`mcp-server-${id}`]: recipe.entry }, engines: { node: '>=24' }, license: 'SEE LICENSE IN LICENSE', dist: { integrity: recipe.integrity, tarball: `https://registry.npmjs.org/${recipe.package}/-/server-${id}-${version}.tgz` }, gitHead: '1'.repeat(40) }; }
test('MCP metadata is fixed to reviewed identities and discovery is cached without activation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-mcp-market-')); let mode = 'good', calls = 0;
  const fetcher = async (url, options) => {
    calls++; assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, undefined);
    const data = metadata(url.includes('server-memory') ? 'memory' : 'filesystem');
    if (mode === 'wrong-source') data.repository.url = 'git+https://example.invalid/other.git';
    if (mode === 'tampered') data.dist.integrity = 'sha512-' + Buffer.alloc(64, 7).toString('base64');
    return new Response(JSON.stringify(data));
  };
  let market = new McpMarket(root, fetcher);
  try {
    const [a, b] = await Promise.all([market.check(), market.check()]); assert.deepEqual(a, b); assert.equal(calls, 2);
    assert.equal(a.candidates.length, 2); assert.deepEqual(a.selections, []); assert.deepEqual(a.installations, []);
    assert.equal(a.candidates[0].node, '>=24');
    mode = 'tampered'; await market.check(); assert.deepEqual(market.snapshot().candidates, a.candidates);
    assert.match(market.snapshot().message, /校验/);
    mode = 'wrong-source'; await assert.rejects(inspectMcpRelease('memory', '2.0.0', fetcher), /固定来源/);
    await assert.rejects(inspectMcpRelease('arbitrary', '2.0.0', fetcher));
    await assert.rejects(inspectMcpRelease('memory', 'https://example.invalid', fetcher));
    const old = market.snapshot(); const controller = new AbortController(); controller.abort(); await market.check(controller.signal); assert.deepEqual(market.snapshot(), old);
    market.setAutomatic(false); market.close(); market = new McpMarket(root, fetcher);
    const count = calls; await market.automaticCheck(); assert.equal(calls, count); assert.equal(market.snapshot().automatic, false);
  } finally { market.close(); rmSync(root, { recursive: true, force: true }); }
});

test('MCP versions are immutable, project-scoped, staged across restart, and revoked sessions stay revoked', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-mcp-store-')); fixtureInstallation(root, ['2026.8.31', '2026.9.1']);
  let market = new McpMarket(root);
  try {
    market.select('memory', '2026.8.31', root); market.grant('EXAMPLE_SESSION', 'memory');
    market.assertSession('EXAMPLE_SESSION', root);
    assert.throws(() => market.assertSession('EXAMPLE_SESSION', tmpdir()), /其他项目/);
    assert.throws(() => market.select('memory', '2026.8.31', tmpdir()), /先停用/);
    market.select('memory', '2026.9.1', root);
    assert.equal(market.active()[0].active, '2026.8.31'); assert.equal(market.active()[0].pending, '2026.9.1');
    market.assertSession('EXAMPLE_SESSION', root);
    market.close(); market = new McpMarket(root); assert.equal(market.active()[0].active, '2026.9.1');
    assert.throws(() => market.assertSession('EXAMPLE_SESSION', root), /已更新/);
    market.grant('EXAMPLE_NEW_SESSION', 'memory'); market.disable('memory');
    assert.throws(() => market.assertSession('EXAMPLE_NEW_SESSION', root)); assert.equal(market.active().length, 0);
    market.select('memory', '2026.9.1', root); assert.throws(() => market.assertSession('EXAMPLE_NEW_SESSION', root));
    market.disable('memory'); market.forget('memory'); assert.equal(market.snapshot().installations.length, 2);
    market.select('memory', '2026.8.31', root); const program = market.launch('memory', '2026.8.31');
    writeFileSync(program.entry, readFileSync(program.entry, 'utf8') + '\n// EXAMPLE_ONLY_TAMPER\n');
    assert.throws(() => market.launch('memory', '2026.8.31'), /发生变化/);
    const lock = join(program.directory, 'pnpm-lock.yaml'); writeFileSync(lock, 'packages: {EXAMPLE: {resolution: {tarball: "https://example.invalid/x.tgz"}}}');
    assert.throws(() => inspectMcpInstallation(program.directory), /注册表摘要/);
  } finally { market.close(); rmSync(root, { recursive: true, force: true }); }
});

test('MCP install refuses changed metadata before resolving programs, and child env strips ambient configuration', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-mcp-refused-'));
    const fetcher = async () => { const data = metadata('memory', MCP_RECIPES.memory.version); data.engines.node = ''; data.dist.integrity = 'sha512-' + Buffer.alloc(64, 8).toString('base64'); return new Response(JSON.stringify(data)); };
  const market = new McpMarket(root, fetcher);
  const previous = process.env.EXAMPLE_ONLY_SECRET; process.env.EXAMPLE_ONLY_SECRET = 'EXAMPLE_ONLY';
  try {
    await assert.rejects(market.install('memory', MCP_RECIPES.memory.version, MCP_RECIPES.memory.integrity), /原连接与版本保持不变/);
    assert.deepEqual(market.snapshot().installations, []);
    const env = mcpChildEnvironment({ MEMORY_FILE_PATH: 'EXAMPLE_ONLY_PATH' });
    for (const key of ['EXAMPLE_ONLY_SECRET', 'DSH_HOME', 'NODE_OPTIONS', 'NODE_PATH', 'NPM_CONFIG_REGISTRY']) assert.equal(env[key], undefined);
    assert.equal(env.MEMORY_FILE_PATH, 'EXAMPLE_ONLY_PATH');
    assert.equal(mcpNodeCompatible(''), true); assert.equal(mcpNodeCompatible('>=999'), false); assert.equal(mcpNodeCompatible('EXAMPLE_INVALID_RANGE'), false);
    assert.equal(canonicalMcpWorkspace(root), canonicalMcpWorkspace(join(root, '.')));
    if (process.platform === 'win32') assert.equal(canonicalMcpWorkspace(root.toUpperCase()), canonicalMcpWorkspace(root));
  } finally { market.close(); if (previous === undefined) delete process.env.EXAMPLE_ONLY_SECRET; else process.env.EXAMPLE_ONLY_SECRET = previous; rmSync(root, { recursive: true, force: true }); }
});

test('automatic MCP preparation downloads only enabled compatible sources and never activates candidates', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-mcp-auto-')); fixtureInstallation(root);
  let requests = 0;
  const fetcher = async url => { requests++; const data = metadata(url.includes('server-memory') ? 'memory' : 'filesystem', '2026.9.1'); data.engines.node = ''; return new Response(JSON.stringify(data)); };
  const market = new McpMarket(root, fetcher), downloads = [];
  market.install = async (...args) => { downloads.push(args.slice(0, 3)); return market.snapshot().installations[0]; };
  try {
    market.setAutomatic(true); await market.automaticCheck(); assert.equal(downloads.length, 0);
    market.select('memory', '2026.8.31', root);
    await Promise.all([market.automaticCheck(), market.automaticCheck()]);
    assert.equal(downloads.length, 1); assert.deepEqual(downloads[0], ['memory', '2026.9.1', MCP_RECIPES.memory.integrity]);
    assert.equal(market.active()[0].active, '2026.8.31'); assert.equal(market.active()[0].pending, '');
    await market.automaticCheck(); assert.equal(downloads.length, 1); assert.equal(requests, 2);
    market.setAutomatic(false); await market.automaticCheck(); assert.equal(downloads.length, 1);
  } finally { market.close(); rmSync(root, { recursive: true, force: true }); }
});
