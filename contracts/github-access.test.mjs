import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import LocalCredentials from '@deepseek-ai/dsh-credentials-local';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';
import Typert from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT } from '../packages/dsh-zhen/lib/typert.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
const token = 'EXAMPLE_GITHUB_READ_ONLY_CREDENTIAL_000000000', seedance = 'EXAMPLE_OTHER_PROVIDER_CREDENTIAL_000000000', revision = 'd'.repeat(40);
const githubRef = credentialRef('DSH_ZHEN_GITHUB_TOKEN'), seedanceRef = credentialRef('SEEDANCE_API_KEY');
test('C33: published native credential storage and Gateway keep optional private reads bounded, revocable, persistent and separate from model secrets', async () => {
  const home = realpathSync.native(mkdtempSync(join(tmpdir(), 'EXAMPLE_private_github_host_'))), previousHome = process.env.DSH_HOME, previousFetch = globalThis.fetch;
  const controllers = [], calls = [], contexts = [], lifetime = new AbortController(), counts = { seedance: 0, github: 0 }; let hold = false, arrived, release;
  const envelope = JSON.parse(readFileSync('market/skills.v1.json', 'utf8'));
  class ObservedCredentials extends LocalCredentials { async resolve(ref) { if (ref === seedanceRef) counts.seedance++; if (ref === githubRef) counts.github++; return super.resolve(ref); } }
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), authorized: !!options.headers.Authorization }); controllers.push(options.signal);
    if (String(url).includes('/repos/T8mars/Deepseek-Harness-Zhenzhen/')) {
      assert.equal(options.headers.Authorization, `Bearer ${token}`); assert.equal(options.redirect, 'error');
      if (String(url).endsWith('/commits/main')) return Response.json({ sha: revision });
      if (String(url).includes('/contents/market/skills.v1.json')) { assert.ok(String(url).endsWith(`?ref=${revision}`)); if (hold) { arrived(); await new Promise(done => { release = done; }); } return Response.json(envelope); }
      if (String(url).includes('/releases?')) return Response.json([]);
    }
    assert.equal(options.headers.Authorization, undefined);
    throw new Error('EXAMPLE_OTHER_PUBLIC_SOURCES_UNAVAILABLE');
  };
  process.env.DSH_HOME = home;
  async function host() {
    const ctx = new Context(); contexts.push(ctx); ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([{ source: 'process', values: {} }]));
    await ctx.plugin(ObservedCredentials, { dshHome: home, watch: false }); await ctx.plugin(Typert); await ctx.plugin(Access); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService); ctx.typert.register(TYPERT); await ctx.plugin(Gateway, {});
    const peer = { id: 'EXAMPLE_GITHUB_OWNER', ctx, principal: { kind: 'owner' }, signal: lifetime.signal, interactions: 'none', dispose: async () => {} };
    async function call(method, args = {}, principal = peer.principal) { const result = await ctx.typertGateway.invoke({ namespace: 'zhen', method, args, peer: { ...peer, principal } }); return TYPERT_REMOTE.methods[`zhen/${method}`].result.create().parse(result === undefined ? undefined : JSON.parse(JSON.stringify(result))); }
    return { ctx, call };
  }
  try {
    const first = await host(); await first.ctx.credentials.set(seedanceRef, seedance);
    assert.equal((await first.call('githubAccessInfo')).configured, false);
    await assert.rejects(first.call('githubSaveCredential', { value: token }, { kind: 'anonymous' })); assert.equal((await first.call('githubAccessInfo')).configured, false);
    await assert.rejects(first.call('githubSaveCredential', { value: 'EXAMPLE INVALID' }));
    await first.call('githubSaveCredential', { value: token }); const info = await first.call('githubAccessInfo'); assert.equal(info.configured, true); assert.equal(JSON.stringify(info).includes(token), false);
    assert.equal(TYPERT_REMOTE.methods['zhen/githubAccessInfo'].result.create().safeParse({ ...info, value: token }).success, false);
    const feed = await first.call('marketFeedCheck'); assert.equal(feed.state, 'checked'); assert.equal(feed.count, 15);
    const updates = await first.call('updatesCheck'); assert.equal(updates.sources.find(source => source.id === 'zhen').state, 'unpublished'); assert.ok(calls.every(call => !call.authorized || call.url.startsWith('https://api.github.com/repos/T8mars/Deepseek-Harness-Zhenzhen/'))); assert.equal(counts.seedance, 0);
    const started = new Promise(done => { arrived = done; }); hold = true; const pending = first.call('marketFeedCheck'); await started;
    await first.ctx.credentials.set(credentialRef('EXAMPLE_UNRELATED_API_REF'), 'EXAMPLE_UNRELATED_VALUE'); assert.equal(controllers.at(-1).aborted, false);
    await first.ctx.credentials.unset(githubRef); assert.equal(controllers.at(-1).aborted, true); release(); const revoked = await pending; assert.equal(revoked.state, 'error'); assert.equal(revoked.revision, revision); hold = false;
    await first.call('githubSaveCredential', { value: token }); await first.ctx.fiber.dispose();
    const second = await host(); assert.equal((await second.call('githubAccessInfo')).configured, true); assert.equal((await second.call('marketFeedSnapshot')).count, 15);
    await second.call('githubRemoveCredential'); assert.equal((await second.call('githubAccessInfo')).configured, false); assert.equal((await second.ctx.credentials.resolve(seedanceRef)).value, seedance);
    assert.equal(second.ctx.tools.schemas().some(tool => /githubSaveCredential|githubRemoveCredential|githubAccessInfo/.test(tool.name)), false);
    for (const file of ['skills-feed.json', 'updates.json']) assert.equal(readFileSync(join(home, 'dsh-zhen', file), 'utf8').includes(token), false);
  } finally { lifetime.abort(); for (const ctx of contexts.reverse()) await ctx.fiber.dispose(); globalThis.fetch = previousFetch; if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; const part = relative(realpathSync.native(tmpdir()), home); assert.ok(part && !part.startsWith('..') && !isAbsolute(part)); rmSync(home, { recursive: true, force: true }); }
});
