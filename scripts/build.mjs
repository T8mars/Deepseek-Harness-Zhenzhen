import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildSkillCatalog } from './skill-catalog.mjs';
import { cssTextPlugin } from './css-text.mjs';
import { parse } from 'yaml';

const root = process.cwd();
const pkg = resolve(root, 'packages/dsh-zhen');
const manifest = JSON.parse(await readFile(resolve(pkg, 'package.json'), 'utf8'));
await buildSkillCatalog(pkg);
await build({entryPoints:['rag-service','rag-backend-schema','canvas-assets','canvas-reference-schema','canvas-desktop-discovery','canvas-setup-schema','canvas-guidance','docx-text','docx-parse','docx-text-worker','knowledge-import-schema','document-error'].map(name=>resolve(pkg,`src/${name}.ts`)),outdir:resolve(pkg,'lib'),bundle:true,platform:'node',target:'node22',format:'esm',packages:'external',sourcemap:false});
const upstream = JSON.parse(await readFile(resolve(root, 'UPSTREAM.lock.json'), 'utf8'));
const compatibility = await readFile(resolve(pkg, 'src/compatibility.ts'), 'utf8');
if (!compatibility.includes(`export const SUPPORTED_DSH = '${upstream.dsh.version}';`) || manifest.engines.dsh !== upstream.dsh.version) throw new Error('Runtime compatibility pin and package engine differ from the reviewed lock.');
// Own version stays only in package.json so canary→stable can compare all other
// payload bytes exactly. The Host adds its installed version to UpdateBaseline.
await writeFile(resolve(pkg, 'catalog/runtime.json'), JSON.stringify({ dsh: upstream.dsh.version, canvas: upstream.canvas.version, canvasRevision: upstream.canvas.commit, gateway: upstream.seedance.sha256.toLowerCase() }) + '\n');
await build({ entryPoints: ['index', 'remote', 'typert', 'pdf-text', 'pdf-text-worker', 'gateway', 'gateway-check', 'gateway-check-schema', 'gateway-tasks', 'gateway-task-schema', 'gateway-media', 'gateway-media-schema', 'media-download', 'knowledge', 'market', 'local-skills', 'local-skills-schema', 'github-skills', 'github-skills-schema', 'skill-feed', 'canvas', 'canvas-discovery', 'canvas-discovery-schema', 'canvas-pairing', 'canvas-pairing-schema', 'canvas-workflow', 'canvas-workflow-schema', 'canvas-models', 'canvas-run', 'canvas-run-schema', 'canvas-native-plan', 'canvas-inbox', 'canvas-inbox-schema', 'canvas-contract', 'canvas-mcp', 'canvas-server', 'updates', 'rag-tool', 'mcp-market', 'mcp-market-schema', 'mcp-server', 'mcp-runtime', 'capabilities', 'capability-schema'].map(name => resolve(pkg, `src/${name}.ts`)), outdir: resolve(pkg, 'lib'), bundle: true,
  platform: 'node', target: 'node22', format: 'esm', packages: 'external', sourcemap: false });
await build({ entryPoints: ['github-access', 'github-access-schema'].map(name => resolve(pkg, `src/${name}.ts`)), outdir: resolve(pkg, 'lib'), bundle: true, platform: 'node', target: 'node22', format: 'esm', packages: 'external', sourcemap: false });
const { capabilityCatalogSchema } = await import('../packages/dsh-zhen/lib/capability-schema.js');
await build({ entryPoints: ['canvas-tasks', 'canvas-task-schema', 'canvas-transfer', 'canvas-transfer-schema', 'canvas-transfer-file', 'art-source', 'default-art', 'default-art-schema'].map(name => resolve(pkg, `src/${name}.ts`)), outdir: resolve(pkg, 'lib'), bundle: true, platform: 'node', target: 'node22', format: 'esm', packages: 'external', sourcemap: false });
const capabilities = capabilityCatalogSchema.parse(JSON.parse(await readFile(resolve(pkg, 'catalog/seedance.v1.json'), 'utf8')));
if (capabilities.sources.find(item => item.id === 'docs').sha256 !== upstream.seedance.sha256.toLowerCase()) throw new Error('Capability catalog and reviewed gateway baseline differ.');
const profile = parse(await readFile(resolve(pkg, 'cordis.patch.yml'), 'utf8')).find(row => row.id === 'llm-pi-ai').config.providers.seedance;
if (JSON.stringify(profile.models.map(item => item.id).sort()) !== JSON.stringify(capabilities.items.filter(item => item.family === 'chat' && item.kind === 'model').map(item => item.model).sort())) throw new Error('Reviewed chat catalog and configured model routes differ.');
await build({ entryPoints: [resolve(pkg, 'src/client/art-validation.ts')], outfile: resolve(pkg, 'lib/art-validation.js'), bundle: true, platform: 'node', target: 'node22', format: 'esm' });
await build({ entryPoints: ['default-art-transfer', 'art-overlay'].map(name => resolve(pkg, `src/client/${name}.ts`)), outdir: resolve(pkg, 'lib'), bundle: true, platform: 'node', target: 'node22', format: 'esm', packages: 'external' });
const browser = await build({ entryPoints: [resolve(pkg, 'src/client/index.tsx')], outfile: resolve(pkg, 'lib/client.js'), metafile: true,
  bundle: true, platform: 'browser', target: 'es2022', format: 'cjs',
  external: ['react', 'react/jsx-runtime'], loader: { '.css': 'text' }, plugins: [cssTextPlugin()],
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(manifest.name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;` },
  footer: { js: 'return module.exports;}});' },
});
const embedded = [...new Set(Object.keys(browser.metafile.inputs).filter(path => path.startsWith('node_modules/')).map(path => {
  const parts = path.slice('node_modules/'.length).split('/');
  return parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}))].sort();
const reviewed = ['@deepseek-ai/dsh-typert-protocol', 'zod'];
if (JSON.stringify(embedded) !== JSON.stringify(reviewed)) throw new Error('Bundled third-party packages changed; review their licenses before distributing.');
let notices = '# Bundled third-party notices\n\nThese notices cover code embedded in client.js. External runtime dependencies retain their own licenses. No third-party character artwork or fonts are included.\n';
for (const name of embedded) {
  const packageRoot = resolve(root, 'node_modules', name);
  const metadata = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  if (metadata.license !== 'MIT') throw new Error(`Review the changed license of ${name}.`);
  const license = await readFile(resolve(packageRoot, 'LICENSE'), 'utf8');
  notices += `\n## ${name} ${metadata.version}\n\n${license.trim()}\n`;
}
const saxesLicense=(await readFile(resolve(pkg,'licenses/saxes-6.0.0.txt'),'utf8')).replace(/\r\n/g,'\n');
const {createHash}=await import('node:crypto');if(createHash('sha256').update(saxesLicense).digest('hex')!=='0fac2374380621b22e6b50451057721a9c52935b02d16d106a9f04897f061d0e')throw Error('Reviewed saxes license changed.');
for(const [name,version,license]of [['saxes','6.0.0','ISC'],['xmlchars','2.2.0','MIT']]){const metadata=JSON.parse(await readFile(resolve(root,'node_modules',name,'package.json'),'utf8'));if(metadata.version!==version||metadata.license!==license)throw Error('Review changed DOCX dependency license/version.');const text=name==='saxes'?saxesLicense:await readFile(resolve(root,'node_modules',name,'LICENSE'),'utf8');notices+='\n## '+name+' '+version+' (external local DOCX decoder)\n\n'+text.trim()+'\n';}
await writeFile(resolve(pkg, 'THIRD_PARTY_NOTICES.md'), notices);
console.log('Built DSH-zhen Host, typed Remote codecs, and browser plugin.');
