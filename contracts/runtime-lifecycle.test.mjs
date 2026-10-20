import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { acquireRuntimeLease } from '../scripts/runtime-lifecycle.mjs';

test('launcher reserves the port before profile changes and retains ownership through Host handoff', async () => {
  const temp = await realpath(tmpdir()), root = await mkdtemp(join(temp, 'dsh-zhen-launch-'));
  let lease, second;
  try {
    lease = await acquireRuntimeLease(root, 0);
    const before = await readFile(join(root, 'launch-lock.json'), 'utf8');
    await assert.rejects(acquireRuntimeLease(root, lease.port), /already in use/);
    assert.equal(await readFile(join(root, 'launch-lock.json'), 'utf8'), before);
    await lease.releasePort();
    await assert.rejects(acquireRuntimeLease(root, lease.port), /Another launcher/);
    assert.equal(await readFile(join(root, 'launch-lock.json'), 'utf8'), before);
    await lease.release();
    second = await acquireRuntimeLease(root, lease.port);
    assert.notEqual(await readFile(join(root, 'launch-lock.json'), 'utf8'), before);
  } finally {
    await second?.release(); await lease?.release();
    const absolute = await realpath(root), rel = relative(temp, absolute);
    if (!rel || isAbsolute(rel) || rel.startsWith('..') || rel.includes('/') || rel.includes('\\')) throw new Error('Cleanup target refused.');
    await rm(absolute, { recursive: true, force: true });
  }
});

test('launcher recovers a confirmed dead owner only with the port reserved and preserves malformed locks', async () => {
  const temp = await realpath(tmpdir()), root = await mkdtemp(join(temp, 'dsh-zhen-launch-'));
  let lease, server;
  try {
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { windowsHide: true, stdio: 'ignore' });
    await new Promise((done, reject) => { child.once('error', reject); child.once('close', done); });
    const path = join(root, 'launch-lock.json'), previous = { schemaVersion: 1, pid: child.pid, token: randomUUID() };
    await writeFile(path, JSON.stringify(previous));
    lease = await acquireRuntimeLease(root, 0);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).pid, process.pid);
    await lease.release();
    await writeFile(path, 'EXAMPLE ONLY malformed ownership fixture');
    await assert.rejects(acquireRuntimeLease(root, 0));
    assert.equal(await readFile(path, 'utf8'), 'EXAMPLE ONLY malformed ownership fixture');
    // Failure paths close their reservations; a fresh socket remains available.
    server = createServer(); await new Promise(done => server.listen(0, '127.0.0.1', done));
  } finally {
    if (server?.listening) await new Promise(done => server.close(done));
    await lease?.release();
    const absolute = await realpath(root), rel = relative(temp, absolute);
    if (!rel || isAbsolute(rel) || rel.startsWith('..') || rel.includes('/') || rel.includes('\\')) throw new Error('Cleanup target refused.');
    await rm(absolute, { recursive: true, force: true });
  }
});
