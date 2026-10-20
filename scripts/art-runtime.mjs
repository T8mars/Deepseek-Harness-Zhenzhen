import { Context } from '@deepseek-ai/cordis';
import Typert from '@deepseek-ai/dsh-typert-registry';
import Access from '@deepseek-ai/dsh-api-remote-access';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import ZhenService from '../packages/dsh-zhen/lib/index.js';
import { TYPERT } from '../packages/dsh-zhen/lib/typert.js';
import { TYPERT_REMOTE } from '../packages/dsh-zhen/lib/remote.js';
/** Real published Host/Gateway/strict contribution with an owner Peer. JSON
 * round trips here exercise unary payloads, not a physical browser transport. */
export async function createArtRuntime({ home, root, digest }) {
  const fields = { DSH_HOME: home, DSH_ZHEN_ART_ROOT: root, DSH_ZHEN_ART_DIGEST: digest }, previous = Object.fromEntries(Object.keys(fields).map(name => [name, process.env[name]]));
  for (const [name, value] of Object.entries(fields)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  const ctx = new Context(), lifetime = new AbortController(), counts = { credentials: 0, chunks: 0, maxWireBytes: 0 };
  ctx.provide('credentials', { resolve: async () => { counts.credentials++; throw Error('EXAMPLE_NO_PROVIDER_KEY'); }, describe: async () => ({ configured: false, writable: true }) });
  const dispose = async () => { lifetime.abort(); await ctx.fiber.dispose(); for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } };
  try {
    await ctx.plugin(Typert); await ctx.plugin(Access); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(ZhenService); ctx.typert.register(TYPERT); await ctx.plugin(Gateway, {});
    const peer = { id: 'EXAMPLE_LOCAL_ART_OWNER', ctx, principal: { kind: 'owner' }, signal: lifetime.signal, interactions: 'none', dispose: async () => {} };
    const call = async (method, args) => { const value = await ctx.typertGateway.invoke({ namespace: 'zhen', method, args: JSON.parse(JSON.stringify(args)), peer }), wire = JSON.stringify(value); counts.maxWireBytes = Math.max(counts.maxWireBytes, Buffer.byteLength(wire)); if (method === 'defaultArtChunk') counts.chunks++; return { ok: true, value: TYPERT_REMOTE.methods[`zhen/${method}`].result.create().parse(JSON.parse(wire)) }; };
    return { ctx, counts, peer, api: { defaultArtInfo: () => call('defaultArtInfo', {}), defaultArtChunk: request => call('defaultArtChunk', { request }) }, dispose };
  } catch (error) { await dispose(); throw error; }
}
