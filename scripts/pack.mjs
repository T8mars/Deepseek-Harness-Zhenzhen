import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { checkRepository, checkPackList } from './check-private.mjs';
import { checkDeclarations } from './declaration-output.mjs';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(resolve(root, 'packages/dsh-zhen/package.json'), 'utf8'));
checkRepository(root);
mkdirSync(resolve(root, '.runtime/packages'), { recursive: true });
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run with npm run pack:bundle.');
const allowed = /^(package\.json|NOTICE\.md|THIRD_PARTY_NOTICES\.md|LICENSE|lib\/(index\.js|client\.js|remote\.js|typert\.js|canvas-server\.js|mcp-server\.js|(?:pdf-text|docx-text)-worker\.js|(?:types|client-types)\/.*\.d\.ts)|cordis\.patch\.yml|skills\/[^/]+\/(SKILL\.md|manifest\.json)|catalog\/[^/]+\.json)$/;
function validate(files) {
  checkPackList(files);
  checkDeclarations(root, files, manifest);
  for (const file of files) if (!allowed.test(file.path)) throw new Error(`Unexpected package entry: ${file.path}`);
}
const preview = JSON.parse(execFileSync(process.execPath, [npm, 'pack', './packages/dsh-zhen', '--ignore-scripts', '--json', '--dry-run'], { encoding: 'utf8' }))[0];
validate(preview.files);
const output = execFileSync(process.execPath, [npm, 'pack', './packages/dsh-zhen', '--ignore-scripts', '--json', '--pack-destination', '.runtime/packages'], { encoding: 'utf8' });
const packed = JSON.parse(output)[0];
validate(packed.files);
if (JSON.stringify(packed.files.map(x => x.path).sort()) !== JSON.stringify(preview.files.map(x => x.path).sort())) throw new Error('Package contents changed after preview.');
const bytes = readFileSync(resolve(root, '.runtime/packages', packed.filename));
const sha256 = createHash('sha256').update(bytes).digest('hex');
const file = packed.filename.replace(/\.tgz$/, `-${sha256.slice(0, 16)}.tgz`);
const target = resolve(root, '.runtime/packages', file);
if (!existsSync(target)) copyFileSync(resolve(root, '.runtime/packages', packed.filename), target);
writeFileSync(resolve(root, '.runtime/package-artifact.json'), JSON.stringify({ file, sha256 }) + '\n');
console.log(JSON.stringify({ file, files: packed.files.length, sha256 }));
