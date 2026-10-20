import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { inspectCanvasCli } from './canvas.ts';
import { canvasDiscoverySchema, canvasInstallCandidateSchema } from './canvas-discovery-schema.ts';
import type { CanvasDiscovery } from './canvas-discovery-schema.ts';

const safeVersion = (value: unknown): value is string => typeof value === 'string' && /^[0-9A-Za-z](?:[0-9A-Za-z._+-]{0,62}[0-9A-Za-z])?$/.test(value) && !value.includes('..');
function localPath(value: string): void {
  if (!isAbsolute(value) || value.length > 4096 || /^[/\\]{2}/.test(value)) throw new Error('LOCAL_PATH_REQUIRED');
  // Discovery is an inventory of local managed files. Do not traverse junctions
  // into network shares or follow a marker to an unrelated filesystem tree.
  for (let cursor = value; ; cursor = dirname(cursor)) {
    try { if (lstatSync(cursor).isSymbolicLink()) throw new Error('LINK_REFUSED'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (dirname(cursor) === cursor) break;
  }
}
function jsonFile(path: string): Record<string, unknown> {
  localPath(path);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 65536) throw new Error('METADATA_INVALID');
  const bytes = readFileSync(path);
  if (bytes.length > 65536) throw new Error('METADATA_INVALID');
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('METADATA_INVALID');
  return value as Record<string, unknown>;
}

/** Match the Canvas installer's documented default/managed discovery roots.
 * Reads metadata and fingerprints only: no require(), process, pairing or HTTP. */
export function discoverCanvasInstalls(options: { env?: NodeJS.ProcessEnv; home?: string } = {}): CanvasDiscovery {
  const env = options.env ?? process.env, home = options.home ?? homedir();
  const roots = new Set<string>();
  const report: CanvasDiscovery = { candidates: [], issues: [] };
  const issue = (): void => { if (report.issues.length < 8) report.issues.push('一处画布安装记录不完整或已变化，请在画布设置中修复 Agent 工具安装。'); };
  const addRoot = (value: unknown): void => {
    if (typeof value !== 'string') throw new Error('INSTALL_ROOT_INVALID');
    localPath(value);
    const canonical = realpathSync.native(value);
    if (!roots.has(canonical) && roots.size < 8) roots.add(canonical);
  };
  try { addRoot(env.ZCANVAS_INSTALL_ROOT?.trim() || join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'ZhenzhenCanvas', 'Agent')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') issue(); }
  for (const directory of [join(home, '.agents', 'skills', 'zhenzhen-canvas'), join(env.CODEX_HOME || join(home, '.codex'), 'skills', 'zhenzhen-canvas')]) {
    try {
      const marker = jsonFile(join(directory, '.zcanvas-managed.json'));
      if (marker.schema !== 't8-zcanvas-discovery-copy-v1' || typeof marker.skillDigest !== 'string' || !/^[a-f0-9]{64}$/.test(marker.skillDigest)) throw new Error('MARKER_INVALID');
      addRoot(marker.installRoot);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') issue(); }
  }
  for (const installRoot of roots) {
    try {
      const owner = jsonFile(join(installRoot, '.zcanvas-install.json'));
      if (owner.schema !== 't8-zcanvas-install-v1' || owner.skillName !== 'zhenzhen-canvas' || !safeVersion(owner.cliVersion) || !safeVersion(owner.skillVersion)) throw new Error('OWNER_INVALID');
      const root = join(installRoot, 'runtime', owner.cliVersion);
      localPath(root);
      const manifest = jsonFile(join(root, 'manifest.json'));
      if (manifest.cliVersion !== owner.cliVersion || manifest.skillVersion !== owner.skillVersion || manifest.responseSchema !== 't8-agent-control-response-v1' || manifest.canvasPatchProtocol !== 't8-canvas-patch-v1') throw new Error('MANIFEST_INVALID');
      const config = inspectCanvasCli(root);
      // Do not present metadata from an earlier version alongside a newer pin.
      if (JSON.stringify(jsonFile(join(root, 'manifest.json'))) !== JSON.stringify(manifest)) throw new Error('MANIFEST_CHANGED');
      report.candidates.push(canvasInstallCandidateSchema.parse({ root: config.root, digest: config.digest, cliVersion: manifest.cliVersion, skillVersion: manifest.skillVersion, nodeSchemaDigest: manifest.nodeSchemaDigest, providerCatalogDigest: manifest.providerCatalogDigest }));
    } catch { issue(); }
  }
  return canvasDiscoverySchema.parse(report);
}
