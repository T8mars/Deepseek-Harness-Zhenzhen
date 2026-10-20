import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export async function buildSkillCatalog(pkg) {
  const items = [];
  for (const folder of (await readdir(resolve(pkg, 'skills'), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!folder.isDirectory() || folder.isSymbolicLink()) throw new Error('Only skill directories are accepted.');
    const root = resolve(pkg, 'skills', folder.name);
    const files = await readdir(root);
    if (files.sort().join(',') !== 'SKILL.md,manifest.json') throw new Error(`Unsupported skill resources: ${folder.name}`);
    const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
    if (manifest.id !== folder.name) throw new Error('Skill ID differs from folder.');
    const content = (await readFile(resolve(root, 'SKILL.md'), 'utf8')).replaceAll('\r\n', '\n');
    items.push({ manifest: { ...manifest, digest: createHash('sha256').update(content).digest('hex') }, content });
  }
  await mkdir(resolve(pkg, 'catalog'), { recursive: true });
  await writeFile(resolve(pkg, 'catalog/skills.json'), JSON.stringify(items, null, 2) + '\n');
  // Public instruction-only feed. It contains exactly these reviewed skill packages,
  // never a workspace scan or the private root project instructions.
  const repositoryRoot = resolve(pkg, '../..');
  await mkdir(resolve(repositoryRoot, 'market'), { recursive: true });
  await writeFile(resolve(repositoryRoot, 'market/skills.v1.json'), JSON.stringify({ schemaVersion: 1, publisher: 'T8mars/Deepseek-Harness-Zhenzhen', skills: items }, null, 2) + '\n');
}
