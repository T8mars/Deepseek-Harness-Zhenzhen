import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { inspectArtSource } from './art-policy.mjs';
import { checkRepository } from './check-private.mjs';

if (process.argv.length !== 3) throw new Error('Usage: npm run pack:art -- <art-source-folder>');
checkRepository(process.cwd());
const reviewed = inspectArtSource(resolve(process.argv[2]), { release: true });
const filename = `dsh-zhen-art-${reviewed.manifest.id}-${reviewed.sha256.slice(0, 16)}.zip`;
const destination = resolve('.runtime/art-packages');
mkdirSync(destination, { recursive: true });
const archive = zipSync(Object.fromEntries([...reviewed.files].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => [path, [bytes, { mtime: new Date(2020, 0, 1, 0, 0, 0) }]])), { level: 6 });
writeFileSync(resolve(destination, filename), archive);
console.log(JSON.stringify({ file: filename, files: reviewed.files.size, sha256: createHash('sha256').update(archive).digest('hex'), contentSha256: reviewed.sha256, licenseConfirmedByUser: true }));
