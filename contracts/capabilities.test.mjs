import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import ZhenService from '../packages/dsh-zhen/lib/index.js';

test('C14: the Host exposes a bounded public capability search through the actual ToolRuntime without a credential', async () => {
  const ctx = new Context(); let credentials = 0;
  ctx.provide('credentials', { resolve:async()=>{credentials++;throw Error('EXAMPLE_ONLY_NOT_NEEDED');} });
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService);
    assert.equal(ctx.get('zhen').gatewayCatalog().items.length, 275);
    const result = await ctx.tools.execute({callId:'EXAMPLE_CAPABILITY_QUERY',name:'zhen_capabilities',arguments:{query:'MiniMax',offset:0},signal:new AbortController().signal});
    assert.equal(result.isError,false); assert.ok(result.value.total > 0); assert.ok(result.value.items.length <= 30);
    assert.equal(credentials,0); assert.ok(result.value.notice.includes('不要把目录记录当作可调用工具'));
    const invalid = await ctx.tools.execute({callId:'EXAMPLE_INVALID_CAPABILITY_QUERY',name:'zhen_capabilities',arguments:{family:'EXAMPLE_UNKNOWN'},signal:new AbortController().signal});
    assert.equal(invalid.isError,true); assert.equal(credentials,0);
  } finally { await ctx.fiber.dispose(); }
});
