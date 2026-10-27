import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, realpath, readFile, rm } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { GatewayChecks } from '../lib/gateway-check.js';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { GATEWAY_CHECK_POLICY, GATEWAY_CHECK_MODEL, GATEWAY_CHECK_PROMPT } from '../lib/gateway-check-schema.js';

const config = { provider: 'seedance', model: GATEWAY_CHECK_MODEL, maxTokens: 32 };
function prepareFixture(execute) {
  return async signal => { assert.equal(signal.aborted, false); return { config,
    retryPolicy: { mode: 'normal', maxRetries: 0 },
    stream: async function* (options) { yield* execute(options); },
  }; };
}
async function* success() {
  yield { type: 'text-delta', index: 0, text: 'EXAMPLE_PRIVATE_REPLY' };
  yield { type: 'usage', usage: { inputTokens: 9, outputTokens: 2 } };
  yield { type: 'finish', reason: { kind: 'stop' } };
}
async function folder() { return realpath(await mkdtemp(join(tmpdir(), 'dsh-zhen-gateway-check-'))); }
async function remove(root) {
  const rel = relative(await realpath(tmpdir()), await realpath(root));
  assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..'));
  await rm(root, { recursive: true, force: true });
}

test('fixed check preview never dispatches; concurrent clicks, reused approval and receipt history stay single-submit', async () => {
  const root = await folder(), path = join(root, 'checks.sqlite');
  let calls = 0;
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const checks = new GatewayChecks(path, prepareFixture(async function* (options) {
    calls++; entered.resolve();
    assert.deepEqual(options.messages, [{ role: 'user', content: [{ type: 'text', text: GATEWAY_CHECK_PROMPT }] }]);
    assert.equal(options.maxTokens, 32); assert.equal(options.model, GATEWAY_CHECK_MODEL);
    assert.equal(options.tools, undefined); assert.equal(options.sessionId, undefined);
    await release.promise; yield* success();
  }));
  try {
    const preview = await checks.preview();
    assert.equal(calls, 0);
    await assert.rejects(checks.run(preview.receipt.id, 'EXAMPLE_WRONG_CONFIRMATION'));
    assert.equal(calls, 0);
    const running = checks.run(preview.receipt.id, GATEWAY_CHECK_POLICY);
    await entered.promise;
    assert.equal((await checks.run(preview.receipt.id, GATEWAY_CHECK_POLICY)).state, 'running');
    assert.equal(calls, 1);
    release.resolve();
    const result = await running;
    assert.equal(result.state, 'passed'); assert.equal(result.inputTokens, 9); assert.equal(result.outputTokens, 2);
    assert.deepEqual(await checks.run(preview.receipt.id, GATEWAY_CHECK_POLICY), result);
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(checks.list()).includes('EXAMPLE_PRIVATE_REPLY'), false);
    assert.equal((await readFile(path)).includes(Buffer.from('EXAMPLE_PRIVATE_REPLY')), false);
  } finally { release.resolve(); await checks.close(); await remove(root); }
});

test('expired, cancelled and foreign-owner receipts cannot send or replay a request', async () => {
  const root = await folder(), path = join(root, 'checks.sqlite');
  let clock = Date.now(), calls = 0;
  const checks = new GatewayChecks(path, prepareFixture(async function* () { calls++; yield* success(); }), () => clock);
  const edit = new DatabaseSync(path);
  try {
    const expired = await checks.preview(); clock += 300001;
    assert.equal((await checks.run(expired.receipt.id, GATEWAY_CHECK_POLICY)).state, 'expired');
    const cancelled = await checks.preview(); checks.cancel(cancelled.receipt.id);
    assert.equal((await checks.run(cancelled.receipt.id, GATEWAY_CHECK_POLICY)).state, 'cancelled');
    const foreign = await checks.preview();
    edit.prepare("UPDATE checks SET owner='EXAMPLE_OTHER_HOST',state='running',receipt=json_set(receipt,'$.state','running') WHERE id=?").run(foreign.receipt.id);
    assert.equal((await checks.run(foreign.receipt.id, GATEWAY_CHECK_POLICY)).state, 'untracked');
    assert.equal(checks.cancel(foreign.receipt.id).state, 'untracked');
    assert.equal(calls, 0);
  } finally { edit.close(); await checks.close(); await remove(root); }
});

test('failed pre-dispatch metadata commit sends nothing; failed completion commit never makes an accepted request replayable', async () => {
 for(const quota of [false,true]){
  const root = await folder(), path = join(root, 'checks.sqlite'); let calls = 0;
  const checks = new GatewayChecks(path, prepareFixture(async function* () { calls++; if(quota)yield{type:'finish',reason:{kind:'error',failure:{code:'QUOTA',message:'EXAMPLE_QUOTA'}}};else yield* success(); }));
  const edit = new DatabaseSync(path);
  try {
    const preview = await checks.preview();
    edit.exec("CREATE TRIGGER fail_claim BEFORE UPDATE ON checks WHEN NEW.state='running' BEGIN SELECT RAISE(FAIL,'EXAMPLE_CLAIM_FAILURE'); END;");
    await assert.rejects(checks.run(preview.receipt.id, GATEWAY_CHECK_POLICY)); assert.equal(calls, 0);
    edit.exec('DROP TRIGGER fail_claim;');
    edit.exec(quota?"CREATE TRIGGER fail_finish BEFORE INSERT ON check_diagnostics BEGIN SELECT RAISE(FAIL,'EXAMPLE_DIAGNOSTIC_FAILURE'); END;":"CREATE TRIGGER fail_finish BEFORE UPDATE ON checks WHEN NEW.state='passed' BEGIN SELECT RAISE(FAIL,'EXAMPLE_FINISH_FAILURE'); END;");
    await assert.rejects(checks.run(preview.receipt.id, GATEWAY_CHECK_POLICY)); assert.equal(calls, 1);
    assert.equal((await checks.run(preview.receipt.id, GATEWAY_CHECK_POLICY)).state, 'untracked'); assert.equal(calls, 1);
    if(quota){assert.equal(edit.prepare('SELECT state FROM checks WHERE id=?').get(preview.receipt.id).state,'running');assert.equal(edit.prepare('SELECT COUNT(*) AS n FROM check_diagnostics').get().n,0);}
  } finally { edit.close(); await checks.close(); await remove(root); }
 }
});

test('provider error messages and unknown codes never enter receipts; one failure is not automatically retried', async () => {
  let calls = 0;
  const checks = new GatewayChecks(':memory:', prepareFixture(async function* () { calls++; yield { type: 'finish', reason: { kind: 'error', failure: { code: 'EXAMPLE_PRIVATE_KEY', message: 'EXAMPLE_PRIVATE_ERROR_AND_URL' } } }; }));
  try {
    const preview = await checks.preview(); const result = await checks.run(preview.receipt.id, GATEWAY_CHECK_POLICY);
    assert.equal(result.state, 'failed'); assert.equal(result.code, 'UNAVAILABLE');
    assert.equal(JSON.stringify(checks.list()).includes('PRIVATE'), false); assert.equal(calls, 1);
  } finally { await checks.close(); }
});

test('truncation, empty completion and excessive output cannot pass a basic text check', async () => {
  for (const mode of ['empty', 'length', 'huge', 'reasoning']) {
    const checks = new GatewayChecks(':memory:', prepareFixture(async function* () {
      if (mode === 'huge' || mode === 'reasoning') yield { type: mode === 'reasoning' ? 'reasoning-delta' : 'text-delta', index: 0, text: 'x'.repeat(4097) };
      else if (mode === 'length') yield { type: 'text-delta', index: 0, text: 'EXAMPLE_REPLY' };
      yield { type: 'finish', reason: { kind: mode === 'length' ? 'max-tokens' : 'stop' } };
    }));
    try {
      const preview = await checks.preview(), result = await checks.run(preview.receipt.id, GATEWAY_CHECK_POLICY);
      assert.notEqual(result.state, 'passed'); assert.equal(result.code, ['huge', 'reasoning'].includes(mode) ? 'RESPONSE_LIMIT' : 'INCOMPLETE');
    } finally { await checks.close(); }
  }
});

test('credential changes cancel old previews and invalidate a preparation already awaiting metadata', async () => {
  const preparing = Promise.withResolvers(), resume = Promise.withResolvers(); let calls = 0;
  const prepare = prepareFixture(async function* () { calls++; yield* success(); });
  const checks = new GatewayChecks(':memory:', async signal => { preparing.resolve(); await resume.promise; return prepare(signal); });
  try {
    const first = checks.preview(); await preparing.promise;
    checks.invalidate(); resume.resolve();
    await assert.rejects(first, /配置已变化/);
    const next = await checks.preview(); checks.invalidate();
    assert.equal((await checks.run(next.receipt.id, GATEWAY_CHECK_POLICY)).state, 'cancelled'); assert.equal(calls, 0);
  } finally { resume.resolve(); await checks.close(); }
});

test('cancellation drains one request without resubmission and shutdown retains a spent receipt', async () => {
  const root = await folder(), path = join(root, 'checks.sqlite'); let calls = 0;
  const entered = Promise.withResolvers();
  const checks = new GatewayChecks(path, prepareFixture(async function* ({ signal }) {
    calls++; entered.resolve();
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); signal.throwIfAborted();
  }));
  let receipt;
  try {
    receipt = await checks.preview(); const running = checks.run(receipt.receipt.id, GATEWAY_CHECK_POLICY);
    await entered.promise; checks.cancel(receipt.receipt.id);
    assert.equal((await running).state, 'cancelled'); assert.equal(calls, 1);
  } finally { await checks.close(); }
  const reopened = new GatewayChecks(path, prepareFixture(async function* () { calls++; yield* success(); }));
  try { assert.equal((await reopened.run(receipt.receipt.id, GATEWAY_CHECK_POLICY)).state, 'cancelled'); assert.equal(calls, 1); }
  finally { await reopened.close(); await remove(root); }
});

test('expired preview metadata is bounded while old receipts cannot revive', async () => {
  let clock = Date.now();
  const checks = new GatewayChecks(':memory:', prepareFixture(success), () => clock);
  try {
    const old = await checks.preview();
    for (let i = 0; i < 110; i++) { clock += 300001; await checks.preview(); }
    assert.ok(checks.list().length <= 10);
    await assert.rejects(checks.run(old.receipt.id, GATEWAY_CHECK_POLICY), /不可用/);
  } finally { await checks.close(); }
});

test('a terminated process leaves a durable spent claim; a new process owner cannot resubmit it', async () => {
  const root = await folder(); let id, calls = 0;
  const child = fork(new URL('../../../contracts/fixtures/gateway-check-crash.mjs', import.meta.url), [root], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true, execArgv: [], env: {} });
  try {
    const entered = new Promise((resolve, reject) => {
      child.on('message', value => { if (value.id) id = value.id; if (value.entered) resolve(); });
      child.once('error', reject); child.once('exit', () => reject(new Error('Fixture exited before claim observation.')));
    });
    await entered;
    const exited = once(child, 'exit'); child.kill(); await exited;
    const reopened = new GatewayChecks(join(root, 'checks.sqlite'), prepareFixture(async function* () { calls++; yield* success(); }));
    try {
      assert.equal(reopened.list()[0].state, 'untracked');
      assert.equal((await reopened.run(id, GATEWAY_CHECK_POLICY)).state, 'untracked');
      assert.equal(calls, 0);
    } finally { await reopened.close(); }
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await remove(root);
  }
});
