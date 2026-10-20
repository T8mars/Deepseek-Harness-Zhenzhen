import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
export const DSH_REPOSITORY = 'git+https://github.com/deepseek-ai/deepseek-harness.git';
export const canonicalVersion = value => typeof value === 'string' && /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*))*)?$/.test(value) && value.length <= 60;
// Pure SemVer precedence for the publisher: no candidate dependency is loaded
// in the job carrying write credentials. Build-metadata variants are excluded.
export function newerVersion(candidate, current) {
  if (!canonicalVersion(candidate) || !canonicalVersion(current)) return false;
  const split = value => { const at = value.indexOf('-'); return { core: (at < 0 ? value : value.slice(0, at)).split('.').map(BigInt), pre: at < 0 ? [] : value.slice(at + 1).split('.') }; };
  const next = split(candidate), old = split(current);
  for (let index = 0; index < 3; index++) if (next.core[index] !== old.core[index]) return next.core[index] > old.core[index];
  if (!next.pre.length || !old.pre.length) return !next.pre.length && !!old.pre.length;
  for (let index = 0; index < Math.max(next.pre.length, old.pre.length); index++) {
    const a = next.pre[index], b = old.pre[index];
    if (a === b) continue;
    if (a === undefined || b === undefined) return b === undefined;
    const numericA = /^\d+$/.test(a), numericB = /^\d+$/.test(b);
    return numericA && numericB ? BigInt(a) > BigInt(b) : numericA !== numericB ? !numericA : a > b;
  }
  return false;
}
export const sha256 = text => createHash('sha256').update(text).digest('hex');
export function corePackage(name) { return /^@deepseek-ai\/dsh(?:-[a-z0-9-]+)?$/.test(name); }
export function requiredPackages(root, plugin) { return [...new Set([root.dependencies, root.devDependencies, plugin.peerDependencies].flatMap(section => Object.keys(section ?? {}).filter(corePackage)))].sort(); }
export function validatePublication(name, target, metadata) {
  if (!corePackage(name) || !canonicalVersion(target) || metadata.name !== name || metadata.version !== target || metadata.repository?.url !== DSH_REPOSITORY || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(metadata.dist?.integrity ?? '')) throw new Error(`Published package identity refused: ${name}.`);
  const expected = `https://registry.npmjs.org/${name}/-/${name.split('/')[1]}-${target}.tgz`;
  if (metadata.dist.tarball !== expected) throw new Error(`Published package URL refused: ${name}.`);
  return { name, version: target, integrity: metadata.dist.integrity };
}
export function compatibilitySource(version, hosts) {
  if (!canonicalVersion(version) || !Array.isArray(hosts) || hosts.length > 30 || !hosts.every(canonicalVersion) || !hosts.includes(version)) throw new Error('Instruction compatibility lineage refused.');
  return `/** Exact runtime pin and reviewed instruction-only compatibility lineage.\n * Adding a candidate here does not authorize execution or data downgrade. */\nexport const SUPPORTED_DSH = '${version}';\nexport const INSTRUCTION_HOSTS: readonly string[] = ${JSON.stringify([...new Set(hosts)])};\n`;
}
export function readCompatibility(text) {
  const pin = text.match(/export const SUPPORTED_DSH = '([^']+)';/), list = text.match(/export const INSTRUCTION_HOSTS: readonly string\[\] = (\[[^\n]+\]);/);
  if (!pin || !list) throw new Error('Unknown compatibility declaration.');
  // Initial human formatting may use single quotes; version tokens cannot contain quotes.
  const tokens = list[1].match(/['"]([^'"]+)['"]/g)?.map(value => value.slice(1,-1)) ?? [];
  if (!canonicalVersion(pin[1]) || !tokens.every(canonicalVersion) || !tokens.includes(pin[1])) throw new Error('Unknown compatibility lineage.');
  return { version: pin[1], hosts: tokens };
}
export function upgradedManifests(root, plugin, lock, compatibility, target) {
  if (!canonicalVersion(target.version) || target.tag !== `dsh-v${target.version}` || !/^[a-f0-9]{40}$/.test(target.commit) || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(target.integrity)) throw new Error('Upgrade target refused.');
  const nextRoot = structuredClone(root), nextPlugin = structuredClone(plugin), nextLock = structuredClone(lock);
  for (const section of [nextRoot.dependencies, nextRoot.devDependencies, nextPlugin.peerDependencies]) for (const name of Object.keys(section ?? {})) if (corePackage(name)) section[name] = target.version;
  nextPlugin.engines.dsh = target.version;
  nextLock.dsh = { ...nextLock.dsh, tag: target.tag, commit: target.commit, version: target.version, registryIntegrity: target.integrity, runtimeVerified: false, runtimeVerificationScope: 'Upgrade candidate; requires contracts, guide review, isolated installation and canary.' };
  return { root: nextRoot, plugin: nextPlugin, lock: nextLock, compatibility: compatibilitySource(target.version, [...compatibility.hosts, target.version]) };
}
export function guideChanges(before, after) {
  const old = new Map(before.map(item => [item.path,item.sha])), next = new Map(after.map(item => [item.path,item.sha]));
  return [...new Set([...old.keys(),...next.keys()])].sort().flatMap(path => old.get(path) === next.get(path) ? [] : [{ path, before: old.get(path) ?? '', after: next.get(path) ?? '', kind: !old.has(path) ? 'added' : !next.has(path) ? 'removed' : 'modified' }]);
}
export function profileFacts(rows) {
  if (!Array.isArray(rows) || rows.length > 2000) throw new Error('Profile rows refused.');
  const keys = (value, prefix = '', depth = 0) => {
    if (depth > 12 || !value || typeof value !== 'object') return [];
    if (Array.isArray(value)) return [...new Set(value.flatMap(item => keys(item, `${prefix}[]`, depth + 1)))];
    return Object.keys(value).sort().flatMap(key => [prefix ? `${prefix}.${key}` : key, ...keys(value[key], prefix ? `${prefix}.${key}` : key, depth + 1)]);
  };
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
  // Input comes only from a fresh shipped template through captureProfile.
  // Hash default values; never save real profile settings or configuration text.
  const facts = rows.map(row => { if (typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(row.id)) throw new Error('Profile row id refused.'); return { id: row.id, name: typeof row.name === 'string' ? row.name : '', keys: [...new Set(keys(row.config))].sort(), configDigest: sha256(JSON.stringify({ config: canonical(row.config ?? null), disabled: row.disabled === true })) }; }).sort((a,b)=>a.id.localeCompare(b.id));
  if (new Set(facts.map(item=>item.id)).size !== facts.length) throw new Error('Duplicate profile row.');
  return facts;
}
export function profileChanges(before, after) {
  const old = new Map(before.map(row=>[row.id,row])), next = new Map(after.map(row=>[row.id,row]));
  return [...new Set([...old.keys(),...next.keys()])].sort().flatMap(id => isDeepStrictEqual(old.get(id), next.get(id)) ? [] : [{ id, before: old.has(id) ? sha256(JSON.stringify(old.get(id))) : '', after: next.has(id) ? sha256(JSON.stringify(next.get(id))) : '', kind: !old.has(id) ? 'added' : !next.has(id) ? 'removed' : 'modified' }]);
}
export function pendingReviews(plan, acknowledgments) {
  const required = [...plan.guideChanges.map(item=>({type:'guide',id:item.path,digest:item.after||item.before})), ...(plan.profileChanges??[]).map(item=>({type:'profile',id:item.id,digest:item.after||item.before}))];
  return required.filter(item => !acknowledgments.some(ack => ack.targetCommit === plan.target.commit && ack.type === item.type && ack.id === item.id && ack.digest === item.digest && ['handled','not-applicable'].includes(ack.decision) && typeof ack.rationale === 'string' && ack.rationale.trim().length >= 20));
}
