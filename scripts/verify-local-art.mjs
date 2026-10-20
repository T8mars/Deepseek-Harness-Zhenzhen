import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { selectDefaultArt } from './launch-art.mjs';
import { createArtRuntime } from './art-runtime.mjs';
import { transferDefaultArt } from '../packages/dsh-zhen/lib/default-art-transfer.js';
const args = process.argv.slice(2); if (args.length !== 2 || args[0] !== '--source' || !isAbsolute(args[1])) throw Error('Usage: npm run verify:local-art -- --source <absolute confirmed local art folder>');
const selected = selectDefaultArt(process.cwd(), { DSH_ZHEN_ART_ROOT: args[1] }); assert.equal(selected.state, 'ready');
const temporary = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-verify-art-'))), previousFetch = globalThis.fetch; let runtime, networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw Error('Local art verification forbids network fetch'); };
try {
  runtime = await createArtRuntime({ home: join(temporary, 'EXAMPLE_HOST'), root: selected.environment.DSH_ZHEN_ART_ROOT, digest: selected.digest });
  const received = await transferDefaultArt(runtime.api); assert.equal(received.info.state, 'ready'); assert.equal(runtime.counts.credentials, 0); assert.equal(networkAttempts, 0); assert.ok(runtime.counts.maxWireBytes <= 65536);
  const report = { at: new Date().toISOString(), packageId: received.info.pack.id, sourceDigest: selected.digest, dshEntrySha256: createHash('sha256').update(readFileSync('packages/dsh-zhen/lib/index.js')).digest('hex'), carrier: 'published-gateway-in-process-json', chunkRequests: runtime.counts.chunks, largestJsonBytes: runtime.counts.maxWireBytes, assets: [...received.assets.values()].map(({ descriptor }) => ({ sha256: descriptor.sha256, bytes: descriptor.size, width: descriptor.width, height: descriptor.height, type: descriptor.type })), slots: received.info.pack.assets.map(item => item.slot), credentialsRead: 0, networkAttempts, browserDecode: false, browserRendered: false, userBrowserStorageWritten: false, modelCalls: 0 };
  mkdirSync('.runtime/evidence', { recursive: true }); writeFileSync('.runtime/evidence/local-default-art.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
} finally { await runtime?.dispose(); globalThis.fetch = previousFetch; const rel = relative(realpathSync.native(tmpdir()), temporary); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); rmSync(temporary, { recursive: true, force: true }); }
