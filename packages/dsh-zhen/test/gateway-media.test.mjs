import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, symlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { downloadMedia, publicMediaAddress, mediaTarget } from '../lib/media-download.js';
import { GatewayMedia } from '../lib/gateway-media.js';
import { withMediaTransport, EXAMPLE_MEDIA_URL, EXAMPLE_PNG } from '../../../contracts/fixtures/media-transport.mjs';
const taskId = '11111111-1111-4111-8111-111111111111';
const managed = new Map();
function folder(t) { const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-zhen-media-test-'))); managed.set(root, []); t.after(async () => { for (const value of managed.get(root)) await value.close(); managed.delete(root); const rel = relative(realpathSync.native(tmpdir()), root); assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..')); rmSync(root, { recursive: true, force: true }); }); return root; }
function manager(t, root, sources = async () => [EXAMPLE_MEDIA_URL], exists = () => true, now = Date.now) { const value = new GatewayMedia(join(root, 'owned'), sources, exists, now); managed.get(root).push(value); return value; }

test('media address gate rejects private/reserved/encoded/mapped/local destinations and permits public IPv4/IPv6', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '100.100.100.200', '169.254.169.254', '172.16.0.1', '192.168.1.1', '192.0.2.1', '168.63.129.16', '198.18.0.1', '224.0.0.1', '255.255.255.255', '::1', '::ffff:8.8.8.8', '64:ff9b::808:808', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:808:808::1', 'not-an-ip']) assert.equal(publicMediaAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(publicMediaAddress(address), true, address);
  for (const url of ['file:///EXAMPLE', 'https://EXAMPLE_USER:EXAMPLE_PASS@media.example.com/a', 'http://2130706433/a', 'http://0x7f000001/a', 'http://[::ffff:127.0.0.1]/a', 'http://localhost/a', 'https://example.internal/a']) await assert.rejects(mediaTarget(url, new AbortController().signal), error => error.code === 'SOURCE');
});

test('media transfer pins one checked DNS answer, sends no credentials and retains exact bytes/hash', async t => {
  const root = folder(t);
  await withMediaTransport(async ({ requests, dnsQueries }) => {
    const result = await downloadMedia(EXAMPLE_MEDIA_URL, join(root, 'content.part'));
    assert.deepEqual(readFileSync(join(root, 'content.part')), EXAMPLE_PNG); assert.equal(result.sha256, createHash('sha256').update(EXAMPLE_PNG).digest('hex')); assert.equal(result.extension, 'png'); assert.equal(requests.length, 1); assert.deepEqual(dnsQueries, ['media.example.com']);
  });
});

test('mixed public/private DNS and a redirect-time rebind are rejected before an unsafe connection', async t => {
  const root = folder(t);
  await withMediaTransport(async ({ requests }) => { await assert.rejects(downloadMedia(EXAMPLE_MEDIA_URL, join(root, 'mixed.part')), error => error.code === 'SOURCE'); assert.equal(requests.length, 0); }, undefined, () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]);
  await withMediaTransport(async ({ requests }) => { await assert.rejects(downloadMedia(EXAMPLE_MEDIA_URL, join(root, 'rebind.part')), error => error.code === 'SOURCE'); assert.equal(requests.length, 1); }, (_request, response) => { response.writeHead(302, { Location: '/EXAMPLE_NEXT' }); response.end(); }, (_hostname, count) => [{ address: count === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }]);
});

test('public redirects are revalidated, private targets and excessive redirects never become downloads', async t => {
  const root = folder(t);
  await withMediaTransport(async ({ requests, dnsQueries }) => { await downloadMedia(EXAMPLE_MEDIA_URL, join(root, 'redirect.part')); assert.equal(requests.length, 2); assert.equal(dnsQueries.length, 2); }, (request, response) => { if (request.url.startsWith('/EXAMPLE_RESULT')) { response.writeHead(302, { Location: 'https://cdn.example.com/EXAMPLE_FINAL' }); response.end(); } else response.end(EXAMPLE_PNG); });
  await withMediaTransport(async ({ requests }) => { await assert.rejects(downloadMedia(EXAMPLE_MEDIA_URL, join(root, 'private.part')), error => error.code === 'SOURCE'); assert.equal(requests.length, 1); }, (_request, response) => { response.writeHead(302, { Location: 'http://169.254.169.254/EXAMPLE' }); response.end(); });
  await withMediaTransport(async ({ requests }) => { await assert.rejects(downloadMedia(EXAMPLE_MEDIA_URL, join(root, 'loop.part')), error => error.code === 'SOURCE'); assert.equal(requests.length, 4); }, (_request, response) => { response.writeHead(302, { Location: '/EXAMPLE_LOOP' }); response.end(); });
});

test('download limits, active content and expired-link errors are bounded/redacted without retry', async t => {
  const root = folder(t);
  for (const mode of ['large-header', 'large-stream', 'html', 'svg', 'expired', 'unknown']) await withMediaTransport(async ({ requests }) => {
    const expected = mode.startsWith('large') ? 'LIMIT' : mode === 'expired' ? 'EXPIRED' : 'FORMAT';
    await assert.rejects(downloadMedia(EXAMPLE_MEDIA_URL, join(root, `${mode}.part`), undefined, 32), error => error.code === expected && !error.message.includes('EXAMPLE_SIGNATURE'));
    assert.equal(requests.length, 1);
  }, (_request, response) => {
    if (mode === 'large-header') response.setHeader('Content-Length', '10000');
    if (mode === 'html') response.setHeader('Content-Type', 'text/html');
    if (mode === 'svg') response.setHeader('Content-Type', 'image/svg+xml');
    if (mode === 'expired') response.statusCode = 403;
    response.end(mode === 'large-stream' || mode === 'large-header' ? EXAMPLE_PNG : 'EXAMPLE_PRIVATE_PROVIDER_BODY');
  });
});

test('supported binary formats use byte signatures rather than remote filenames', async t => {
  const root = folder(t), glb = Buffer.alloc(16); glb.write('glTF'); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(16, 8);
  const cases = [['jpg', Buffer.from([255, 216, 255, 224])], ['wav', Buffer.from('RIFF0000WAVE0000')], ['flac', Buffer.from('fLaC0000')], ['mp3', Buffer.from('ID3EXAMPLE')], ['aac', Buffer.from([255, 241, 0, 0])], ['mp4', Buffer.from('0000ftypisom0000')], ['glb', glb], ['zip', Buffer.from([80, 75, 3, 4, 0, 0])]];
  for (const [extension, bytes] of cases) await withMediaTransport(async () => { assert.equal((await downloadMedia(EXAMPLE_MEDIA_URL, join(root, `${extension}.part`))).extension, extension); }, (_request, response) => response.end(bytes));
});

test('explicit export preserves bytes, duplicate clicks share one operation, receipts omit source URLs and forgetting retains files', async t => {
  const root = folder(t), output = join(root, 'EXAMPLE_OUTPUT'); mkdirSync(output); const value = manager(t, root);
  await withMediaTransport(async ({ requests }) => {
    const [ticket] = await value.preview(taskId); assert.equal(JSON.stringify(ticket).includes('SIGNATURE'), false); assert.equal(ticket.sourceHost, 'media.example.com');
    const a = value.save(ticket.id, output), b = value.save(ticket.id, output); assert.equal(a, b); const receipt = await a;
    assert.equal(receipt.recorded, true); assert.deepEqual(readFileSync(receipt.path), EXAMPLE_PNG); assert.equal((await value.save(ticket.id, output)).path, receipt.path); assert.equal(requests.length, 1); value.forget(receipt.id); assert.ok(existsSync(receipt.path));
    await value.close(); const text = readFileSync(join(root, 'owned', 'receipts.sqlite')).toString('utf8'); assert.equal(text.includes('EXAMPLE_SIGNATURE'), false); assert.equal(text.includes('https://'), false);
  });
});

test('existing destination files are not overwritten and relative/nonexistent directories cause no media request', async t => {
  const root = folder(t), output = join(root, 'EXAMPLE_OUTPUT'); mkdirSync(output); const value = manager(t, root);
  await withMediaTransport(async ({ requests }) => {
    const [ticket] = await value.preview(taskId), occupied = join(output, `dsh-zhen-${ticket.id}.png`); writeFileSync(occupied, 'EXAMPLE_USER_FILE');
    await assert.rejects(value.save(ticket.id, 'EXAMPLE_RELATIVE'), error => error.code === 'DIRECTORY'); assert.equal(requests.length, 0);
    for (const path of ['\\\\example.invalid\\EXAMPLE_SHARE', '//example.invalid/EXAMPLE_SHARE', join(root, 'EXAMPLE_MISSING')]) await assert.rejects(value.save(ticket.id, path), error => error.code === 'DIRECTORY'); assert.equal(requests.length, 0);
    await assert.rejects(value.save(ticket.id, output), error => error.code === 'FILE'); assert.equal(readFileSync(occupied, 'utf8'), 'EXAMPLE_USER_FILE'); assert.deepEqual(value.list(), []); assert.deepEqual(readdirSync(join(root, 'owned', 'staging')), []);
    const [next] = await value.preview(taskId); const receipt = await value.save(next.id, `"${output}"`); assert.deepEqual(readFileSync(receipt.path), EXAMPLE_PNG);
  });
});

test('expired and invalidated tickets cannot start network work; cancelling an active transfer removes owned partial staging', async t => {
  const root = folder(t), output = join(root, 'EXAMPLE_OUTPUT'); mkdirSync(output); let clock = Date.now(); const value = manager(t, root, undefined, undefined, () => clock);
  await withMediaTransport(async ({ requests, dnsQueries }) => { const [ticket] = await value.preview(taskId); clock += 300001; await assert.rejects(value.save(ticket.id, output), error => error.code === 'EXPIRED'); const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(downloadMedia(EXAMPLE_MEDIA_URL, join(root, 'early.part'), cancelled.signal), error => error.code === 'CANCELLED'); assert.equal(dnsQueries.length, 0); assert.equal(requests.length, 0); });
  let began; const started = new Promise(resolve => { began = resolve; });
  await withMediaTransport(async () => { const [ticket] = await value.preview(taskId), pending = value.save(ticket.id, output); await started; value.invalidate(); await assert.rejects(pending, error => ['CANCELLED'].includes(error.code)); assert.deepEqual(readdirSync(output), []); assert.deepEqual(readdirSync(join(root, 'owned', 'staging')), []); }, (_request, response) => { response.write(EXAMPLE_PNG.subarray(0, 20)); began(); });
});

test('staging junctions and destination replacement cannot redirect writes into another directory', async t => {
  const root = folder(t), output = join(root, 'EXAMPLE_OUTPUT'), outside = join(root, 'EXAMPLE_OTHER'); mkdirSync(output); mkdirSync(outside); writeFileSync(join(outside, 'sentinel'), 'EXAMPLE_KEEP'); const value = manager(t, root);
  symlinkSync(outside, join(root, 'owned', 'staging'), process.platform === 'win32' ? 'junction' : 'dir');
  await withMediaTransport(async ({ requests }) => { const [ticket] = await value.preview(taskId); await assert.rejects(value.save(ticket.id, output), error => error.code === 'FILE'); assert.equal(requests.length, 0); assert.deepEqual(readdirSync(outside), ['sentinel']); });
  rmSync(join(root, 'owned', 'staging')); // Remove this owned test link only; no recursive traversal.
  await withMediaTransport(async () => { const [ticket] = await value.preview(taskId); await assert.rejects(value.save(ticket.id, output), error => error.code === 'DIRECTORY'); assert.deepEqual(readdirSync(outside), ['sentinel']); }, (_request, response) => { renameSync(output, join(root, 'EXAMPLE_MOVED')); symlinkSync(outside, output, process.platform === 'win32' ? 'junction' : 'dir'); response.end(EXAMPLE_PNG); });
});

test('a completed file survives receipt-storage failure and the same ticket does not download again', async t => {
  const root = folder(t), output = join(root, 'EXAMPLE_OUTPUT'); mkdirSync(output); const value = manager(t, root), db = new DatabaseSync(join(root, 'owned', 'receipts.sqlite'));
  db.exec("CREATE TRIGGER example_refuse_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(FAIL,'EXAMPLE_STORAGE_FAILURE'); END;"); db.close();
  await withMediaTransport(async ({ requests }) => { const [ticket] = await value.preview(taskId), receipt = await value.save(ticket.id, output); assert.equal(receipt.recorded, false); assert.deepEqual(readFileSync(receipt.path), EXAMPLE_PNG); assert.equal((await value.save(ticket.id, output)).recorded, false); assert.equal(requests.length, 1); assert.deepEqual(value.list(), []); });
});

test('persisted receipts survive reopen while source tickets do not, and saved files remain independently owned by the user', async t => {
  const root = folder(t), output = join(root, 'EXAMPLE_OUTPUT'); mkdirSync(output); const value = manager(t, root); let receipt;
  await withMediaTransport(async () => { const [ticket] = await value.preview(taskId); receipt = await value.save(ticket.id, output); }); await value.close();
  const reopened = new GatewayMedia(join(root, 'owned'), async () => [], () => false);
  try { assert.equal(reopened.list()[0].path, receipt.path); assert.equal((await reopened.save(receipt.id, output)).sha256, receipt.sha256); await assert.rejects(reopened.save(randomUUID(), output), error => error.code === 'EXPIRED'); reopened.forget(receipt.id); assert.ok(existsSync(receipt.path)); }
  finally { await reopened.close(); }
});
