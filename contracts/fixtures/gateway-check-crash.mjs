// A synthetic-only child for proving the durable pre-dispatch claim survives
// process termination. Never imports Host credentials, sessions or a provider.
import { join } from 'node:path';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { relative, isAbsolute } from 'node:path';
import { GatewayChecks } from '../../packages/dsh-zhen/lib/gateway-check.js';
import { GATEWAY_CHECK_MODEL, GATEWAY_CHECK_POLICY } from '../../packages/dsh-zhen/lib/gateway-check-schema.js';

const root = await realpath(process.argv[2]);
const rel = relative(await realpath(tmpdir()), root);
if (!rel || isAbsolute(rel) || rel.startsWith('..')) throw new Error('Synthetic fixture root must be in the temporary directory.');
const checks = new GatewayChecks(join(root, 'checks.sqlite'), async () => ({
  config: { provider: 'seedance', model: GATEWAY_CHECK_MODEL, maxTokens: 32 }, retryPolicy: { mode: 'normal', maxRetries: 0 },
  stream: async function* () { process.send({ entered: true }); await new Promise(() => {}); },
}));
const preview = await checks.preview();
process.send({ id: preview.receipt.id });
const keepAlive = setInterval(() => {}, 1000);
await checks.run(preview.receipt.id, GATEWAY_CHECK_POLICY);
clearInterval(keepAlive);
