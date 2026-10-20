import { createServer } from 'node:net';
import { mkdir, open, lstat, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const issuedLeases = new WeakMap();

/** Only this module's live, still-reserved lease can cross the setup handoff. */
export async function assertRuntimeLease(lease, runtime, port = 5180) {
  const record = issuedLeases.get(lease);
  if (!record || record.runtime !== resolve(runtime) || record.port !== port || !record.active()) throw new Error('Prepared runtime ownership is unavailable.');
  const current = await readLock(join(runtime, 'launch-lock.json'));
  if (current?.value.pid !== process.pid || current.value.token !== record.token) throw new Error('Prepared runtime ownership changed.');
  return lease;
}

async function readLock(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1024) throw new Error('Launcher lock is not a bounded regular file.');
    const text = await readFile(path, 'utf8'), value = JSON.parse(text);
    if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.pid) || value.pid <= 0 || !/^[a-f0-9-]{36}$/.test(value.token)) throw new Error('Launcher lock is malformed; preserve it for inspection.');
    return { text, value };
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; if (error.code === 'EPERM') return true; throw error; }
}

// All cooperating launchers reserve the port BEFORE inspecting/recovering the
// file lock. The OS port reservation serializes stale-lock recovery as well as
// installation. The parent keeps its PID lock across the port handoff to DSH.
// This does not coordinate with an unrelated direct invocation of the DSH CLI.
export async function acquireRuntimeLease(runtime, port = 5180) {
  const server = createServer(socket => socket.destroy());
  await new Promise((done, reject) => {
    server.once('error', error => reject(new Error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the running Host before installing or starting a bundle.` : 'Unable to reserve the local Host port.')));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, done);
  });
  let reserved = true, owned = false, released = false;
  const path = join(runtime, 'launch-lock.json'), token = randomUUID();
  const releasePort = async () => { if (reserved) { reserved = false; await new Promise((done, reject) => server.close(error => error ? reject(error) : done())); } };
  try {
    await mkdir(runtime, { recursive: true });
    const previous = await readLock(path);
    if (previous) {
      if (alive(previous.value.pid)) throw new Error('Another launcher owns this profile. Stop it before installing or starting a bundle.');
      if ((await readLock(path))?.text !== previous.text) throw new Error('Launcher ownership changed; retry after the other launcher stops.');
      await unlink(path);
    }
    const handle = await open(path, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify({ schemaVersion: 1, pid: process.pid, token }) + '\n'); owned = true; }
    finally { await handle.close(); }
    const lease = {
      port: server.address().port,
      releasePort,
      async release() {
        if (released) return;
        released = true;
        try { if (owned && (await readLock(path))?.value.token === token) await unlink(path); }
        finally { await releasePort(); }
      },
    };
    issuedLeases.set(lease, { runtime: resolve(runtime), port: lease.port, token, active: () => owned && !released && reserved });
    return lease;
  } catch (error) { await releasePort(); throw error; }
}
