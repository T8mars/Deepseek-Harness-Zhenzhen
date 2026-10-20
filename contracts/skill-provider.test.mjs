import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import SkillRegistry from '@deepseek-ai/dsh-skill';
import { SkillMarket, readBundledCatalog } from '../packages/dsh-zhen/lib/market.js';
import ZhenService from '../packages/dsh-zhen/lib/index.js';

test('C9: published skill registry discovers, loads and invalidates market selections', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-provider-'));
  const catalog = readBundledCatalog();
  const market = new SkillMarket(join(root, 'skills.sqlite'), catalog);
  const ctx = new Context();
  await ctx.plugin(SkillRegistry);
  try {
    ctx.skills.registerProvider(control => {
      const unsubscribe = market.subscribe(control.invalidate);
      control.signal.addEventListener('abort', unsubscribe, { once: true });
      return market.provider();
    });
    assert.equal((await ctx.skills.list()).length, 0);
    market.select(catalog[0].manifest.id, catalog[0].manifest.digest);
    const items = await ctx.skills.list();
    assert.equal(items.length, 1);
    assert.equal(items[0].invocation.userInvocable, true);
    assert.equal(items[0].provider, 'dsh-zhen-market');
    assert.ok((await ctx.skills.get(items[0].name)).content.length > 50);
    market.disable(items[0].name);
    assert.equal((await ctx.skills.list()).length, 0);
    assert.equal(await ctx.skills.get(items[0].name), undefined);
  } finally { await ctx.fiber.dispose(); market.close(); rmSync(root, { recursive: true, force: true }); }
});

test('C9: actual Host service mounts its provider into the published registry', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zhen-provider-host-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = root;
  const ctx = new Context();
  ctx.provide('credentials', {});
  try {
    await ctx.plugin(SkillRegistry);
    await ctx.plugin(ZhenService);
    const service = ctx.get('zhen');
    const item = service.marketList()[0];
    service.marketSelect(item.manifest.id, item.manifest.digest);
    assert.equal((await ctx.skills.list()).length, 1);
    assert.ok(await ctx.skills.get(item.manifest.id));
  } finally {
    await ctx.fiber.dispose();
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
