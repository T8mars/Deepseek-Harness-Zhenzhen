import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { checkRepository, checkPackList } from './check-private.mjs';
import { checkDeclarations } from './declaration-output.mjs';
import { createPackageStage } from './package-stage.mjs';
import {checkPackagePaths} from './package-policy.mjs';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(resolve(root, 'packages/dsh-zhen/package.json'), 'utf8'));
checkRepository(root);
mkdirSync(resolve(root, '.runtime/packages'), { recursive: true });
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run with npm run pack:bundle.');
function validate(files) {
  checkPackList(files);
  checkDeclarations(root, files, manifest);
  checkPackagePaths(files);
}
const preview = JSON.parse(execFileSync(process.execPath, [npm, 'pack', './packages/dsh-zhen', '--ignore-scripts', '--json', '--dry-run'], { encoding: 'utf8' }))[0];
validate(preview.files);
const stage = createPackageStage(resolve(root, 'packages/dsh-zhen'), preview.files);
let packed;
try {
  const output = execFileSync(process.execPath, [npm, 'pack', stage.root, '--ignore-scripts', '--json', '--pack-destination', resolve(root, '.runtime/packages')], { encoding: 'utf8' });
  packed = JSON.parse(output)[0];
} finally {
  stage.cleanup();
}
validate(packed.files);
if (JSON.stringify(packed.files.map(x => x.path).sort()) !== JSON.stringify(preview.files.map(x => x.path).sort())) throw new Error('Package contents changed after preview.');
const bytes = readFileSync(resolve(root, '.runtime/packages', packed.filename));
const sha256 = createHash('sha256').update(bytes).digest('hex');
const file = packed.filename.replace(/\.tgz$/, `-${sha256.slice(0, 16)}.tgz`);
const target = resolve(root, '.runtime/packages', file);
if (!existsSync(target)) copyFileSync(resolve(root, '.runtime/packages', packed.filename), target);
writeFileSync(resolve(root, '.runtime/package-artifact.json'), JSON.stringify({ file, sha256 }) + '\n');
console.log(JSON.stringify({ file, files: packed.files.length, sha256 }));
