import test from 'node:test';
import assert from 'node:assert/strict';
import { readWallet } from '../lib/gateway.js';

test('wallet uses only the fixed Host endpoint and returns no account metadata', async () => {
  const result = await readWallet('EXAMPLE_TEST_ONLY_KEY', async (url, options) => {
    assert.equal(url, 'https://api.seedance.nz/api/usage/wallet/');
    assert.equal(options.headers.Authorization, 'Bearer EXAMPLE_TEST_ONLY_KEY');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    return Response.json({ code: true, data: { amount: 3, used_amount: .5, display_type: 'CNY', username: 'EXAMPLE_USER' } });
  });
  assert.equal(result.amount, 3); assert.equal(result.currency, 'CNY');
  assert.deepEqual(Object.keys(result).sort(), ['amount', 'checkedAt', 'currency', 'usedAmount']);
});

test('network errors are redacted and reads have no automatic retry', async () => {
  let calls = 0;
  await assert.rejects(readWallet('EXAMPLE_TEST_ONLY_KEY', async () => { calls++; throw new Error('EXAMPLE_TEST_ONLY_KEY'); }), error => error.code === 'NETWORK' && !error.message.includes('EXAMPLE_TEST_ONLY_KEY'));
  assert.equal(calls, 1);
});

test('wallet rejects oversized responses and unknown currency formats', async () => {
  await assert.rejects(readWallet('EXAMPLE_TEST_ONLY_KEY', async () => new Response('x'.repeat(65537))), error => error.code === 'RESPONSE');
  await assert.rejects(readWallet('EXAMPLE_TEST_ONLY_KEY', async () => Response.json({ code: true, data: { amount: 1, used_amount: 0, display_type: '???' } })), error => error.code === 'RESPONSE');
});

test('wallet HTTP refusal does not expose provider error payload', async () => {
  await assert.rejects(readWallet('EXAMPLE_TEST_ONLY_KEY', async () => new Response('EXAMPLE PRIVATE RESPONSE', { status: 401 })), error => error.code === 'AUTH' && !error.message.includes('PRIVATE'));
});
