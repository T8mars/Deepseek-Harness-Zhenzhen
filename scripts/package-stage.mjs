import {lstatSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join, dirname, relative, isAbsolute} from 'node:path';
import {checkPackList} from './check-private.mjs';

// Only raw, reviewed text inputs. Generated JavaScript and future binary files
// are copied byte-for-byte; this does not rewrite the user's working tree.
export function canonicalPackageText(path) {
 return /^(?:LICENSE|NOTICE\.md|THIRD_PARTY_NOTICES\.md|package\.json|cordis\.patch\.yml|catalog\/[^/]+\.json|skills\/[^/]+\/(?:SKILL\.md|manifest\.json))$/.test(path);
}

export function createPackageStage(packageRoot, entries) {
 const paths = entries.map(entry => typeof entry === 'string' ? entry : entry.path);
 checkPackList(paths);
 if (paths.length > 5000 || new Set(paths).size !== paths.length || paths.some(path => typeof path !== 'string' || path.includes('\\') || isAbsolute(path) || path.split('/').some(part => !part || part === '.' || part === '..' || /[:\0]/.test(part)))) throw new Error('Invalid package staging paths.');
 const source = realpathSync.native(packageRoot), base = realpathSync.native(tmpdir());
 const root = realpathSync.native(mkdtempSync(join(base, 'dsh-zhen-pack-')));
 let disposed = false, normalizedFiles = 0;
 const cleanup = () => {
  if (disposed) return;
  const absolute = realpathSync.native(root), part = relative(base, absolute);
  if (!part || isAbsolute(part) || part.startsWith('..') || part.includes('/') || part.includes('\\') || !part.startsWith('dsh-zhen-pack-')) throw new Error('Package staging cleanup escaped its temporary directory.');
  rmSync(absolute, {recursive: true, force: true, maxRetries: 5, retryDelay: 200});
  disposed = true;
 };
 try {
  for (const path of paths) {
   const file = resolve(source, path), stat = lstatSync(file);
   const physical = realpathSync.native(file), actual = relative(source, physical).replaceAll('\\', '/');
   if (!stat.isFile() || stat.isSymbolicLink() || actual !== path) throw new Error('Package staging requires ordinary files within the package.');
   let bytes = readFileSync(file);
   if (canonicalPackageText(path)) {
    const text = new TextDecoder('utf8', {fatal: true, ignoreBOM: true}).decode(bytes);
    const canonical = Buffer.from(text.replace(/\r\n/g, '\n'));
    if (!bytes.equals(canonical)) normalizedFiles++;
    bytes = canonical;
   }
   const target = join(root, path);
   mkdirSync(dirname(target), {recursive: true});
   writeFileSync(target, bytes, {flag: 'wx', mode: stat.mode & 0o777});
  }
  return {root, normalizedFiles, cleanup};
 } catch (error) {
  cleanup();
  throw error;
 }
}
