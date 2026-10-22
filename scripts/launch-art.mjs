import { existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { inspectArtSource } from './art-policy.mjs';
/** Select the already confirmed local pack. It remains separate from the
 * public npm bundle; never inherit an incomplete or changed environment pin. */
export function selectDefaultArt(workspace, environment = {}) {
  const explicit = environment.DSH_ZHEN_ART_ROOT, provided = environment.DSH_ZHEN_ART_DIGEST;
  const defaults = ['community-creative-v2', 'community-creative-v1'].map(name => resolve(workspace, 'packages/dsh-zhen-client-brand/assets', name));
  const root = explicit || defaults.find(path => existsSync(resolve(path, 'manifest.json'))) || defaults[0];
  if (!explicit && !provided && !existsSync(resolve(root, 'manifest.json'))) return { state: 'none', environment: {} };
  try {
    if (!isAbsolute(root) || /^[/\\]{2}/.test(root) || !explicit && provided) throw Error('Invalid local art selection');
    const art = inspectArtSource(root, { release: true }); if (provided && provided !== art.sha256) throw Error('Changed local art selection');
    return { state: 'ready', digest: art.sha256, environment: { DSH_ZHEN_ART_ROOT: root, DSH_ZHEN_ART_DIGEST: art.sha256 } };
  } catch { return { state: 'unavailable', environment: {} }; }
}
