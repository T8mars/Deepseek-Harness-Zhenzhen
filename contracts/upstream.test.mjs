import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse, parseDocument } from 'yaml';
import { Context } from '@deepseek-ai/cordis';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT } from '../packages/dsh-zhen/lib/typert.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
import { redactLauncherLine } from '../scripts/log-output.mjs';

test('C1/C8: actual DSH composition applies default model and disables outbound collectors', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-zhen-composition-'));
  try {
    const output = execFileSync(process.execPath, [resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'example', '--from-default-profile', 'web', '--patch', resolve('packages/dsh-zhen/cordis.patch.yml'), '--dump-config'], { env: { ...process.env, DSH_HOME: home }, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const doc = parseDocument(output, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] });
    assert.equal(doc.errors.length, 0);
    const rows = new Map(doc.toJS().map(row => [row.id, row]));
    assert.deepEqual(rows.get('agent-default-model').config, { provider: 'seedance', model: 'deepseek/deepseek-v4.1-flash' });
    for (const id of ['session-log-deepseek', 'plugin-package-inventory-deepseek', 'deepseek-llm-api-extensions', 'otel', 'session-telemetry-otel', 'product-analytics', 'desktop-product-telemetry', 'ui-brand-official', 'ui-deepseek-model-label-1017']) assert.equal(rows.get(id).disabled, true, id);
    assert.deepEqual(rows.get('ui-settings-models').config, { credentialOnboarding: false });
    assert.equal(rows.get('llm-pi-ai').config.providers.seedance.apiKeyEnv, 'SEEDANCE_API_KEY');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('C2: published adapter validates the complete Seedance provider profile', async () => {
  const adapter = await import('@deepseek-ai/dsh-llm-pi-ai');
  const patch = parse(readFileSync('packages/dsh-zhen/cordis.patch.yml', 'utf8'));
  const config = patch.find(row => row.id === 'llm-pi-ai').config;
  const validated = adapter.Config(config);
  assert.equal(validated.providers.get().seedance.api, 'openai-completions');
  assert.equal(validated.providers.get().seedance.retryPolicy.maxRetries, 0);
});

test('C3: hand-authored Remote contribution passes upstream validation and matches live service methods', async () => {
  const ctx = new Context();
  const values = new Map();
  ctx.provide('credentials', {
    describe: async ref => ({ configured: values.has(ref), writable: true }),
    set: async (ref, value) => { values.set(ref, value); },
    unset: async ref => { values.delete(ref); },
    resolve: async ref => values.has(ref) ? { value: values.get(ref), source: 'file' } : undefined,
  });
  await ctx.plugin(ZhenService);
  try {
    const service = ctx.get('zhen');
    assert.ok(service);
    const contribution = validateTypertManifest('dsh-zhen', TYPERT);
    assert.deepEqual(contribution.invocations.map(x => x.method).sort(), remoteMethods(service).map(x => x.method).sort());
    assert.equal((await service.status()).credentialConfigured, false);
    await service.saveCredential('EXAMPLE_TEST_ONLY_KEY');
    const status = await service.status();
    assert.equal(status.credentialConfigured, true);
    assert.equal(JSON.stringify(status).includes('EXAMPLE_TEST_ONLY_KEY'), false);
    await service.removeCredential();
    await assert.rejects(service.wallet(), error => error.details.reason === 'MISSING_CREDENTIAL');
  } finally { await ctx.fiber.dispose(); }
});

test('C4: Remote input rejects extra arguments and invalid credential values before dispatch', () => {
  const method = TYPERT_REMOTE.methods['zhen/saveCredential'];
  assert.throws(() => method.input({ strict: true }).create().parse({ value: 'EXAMPLE_TEST_ONLY_KEY', override: true }));
  assert.throws(() => method.input().create().parse({ value: 'bad key' }));
  assert.doesNotThrow(() => method.input().create().parse({ value: 'EXAMPLE_TEST_ONLY_KEY' }));
});

test('C5: launcher does not echo browser-owner tokens', () => {
  assert.equal(redactLauncherLine('dsh web: http://127.0.0.1:5180/?token=EXAMPLE_TEST_ONLY_TOKEN'), 'dsh web: http://127.0.0.1:5180/?token=[redacted]');
});
