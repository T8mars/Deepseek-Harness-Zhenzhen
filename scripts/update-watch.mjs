import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverUpdates } from '../packages/dsh-zhen/lib/updates.js';

export function candidateRecord(sources) {
  return { schemaVersion: 1, activation: 'requires-contracts-and-review', candidates: sources.filter(source => source.changed && source.state === 'checked').map(({ id, current, available, revision, url }) => ({ id, current, available, revision, url })) };
}

export async function watch() {
  const lock = JSON.parse(await readFile('UPSTREAM.lock.json', 'utf8'));
  const manifest = JSON.parse(await readFile('packages/dsh-zhen/package.json', 'utf8'));
  const sources = await discoverUpdates({ dsh: lock.dsh.version, canvas: lock.canvas.version, canvasRevision: lock.canvas.commit, zhen: manifest.version, gateway: lock.seedance.sha256.toLowerCase() });
  await mkdir('.runtime', { recursive: true });
  await writeFile('.runtime/update-report.json', JSON.stringify({ checkedAt: new Date().toISOString(), sources }, null, 2) + '\n');
  if (sources.every(source => source.state === 'error')) throw new Error('All update feeds are unavailable; the candidate record was not changed.');
  const candidate = candidateRecord(sources);
  try {
    const previous = JSON.parse(await readFile('UPSTREAM.candidate.json', 'utf8'));
    const failed = new Set(sources.filter(source => source.state === 'error').map(source => source.id));
    for (const item of previous.candidates ?? []) if (failed.has(item.id)) candidate.candidates.push(item);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  candidate.candidates.sort((a, b) => a.id.localeCompare(b.id));
  let priorExists=false;try{await readFile('UPSTREAM.candidate.json');priorExists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if (candidate.candidates.length || priorExists) await writeFile('UPSTREAM.candidate.json', JSON.stringify(candidate, null, 2) + '\n');
  console.log(`Checked ${sources.length} public feeds; ${sources.filter(source => source.state === 'error').length} unavailable; ${candidate.candidates.length} candidate change(s). Unavailable feeds never activate an update.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await watch();
