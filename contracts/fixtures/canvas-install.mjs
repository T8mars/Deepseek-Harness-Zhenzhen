import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export function exampleCanvasInstall(base) {
  const home = join(base, 'EXAMPLE_HOME'), install = join(base, 'EXAMPLE_LOCAL', 'ZhenzhenCanvas', 'Agent');
  const root = join(install, 'runtime', '0.1.0-dev');
  mkdirSync(join(root, 'src'), { recursive: true });
  const manifest = { schema: 't8-zcanvas-manifest-v1', skillName: 'zhenzhen-canvas', cliVersion: '0.1.0-dev', skillVersion: '0.1.0-dev', controlProtocol: 't8-agent-control-v1', responseSchema: 't8-agent-control-response-v1', canvasPatchProtocol: 't8-canvas-patch-v1', nodeSchemaDigest: '1'.repeat(64), providerCatalogDigest: '2'.repeat(64) };
  writeFileSync(join(install, '.zcanvas-install.json'), JSON.stringify({ schema: 't8-zcanvas-install-v1', skillName: 'zhenzhen-canvas', cliVersion: manifest.cliVersion, skillVersion: manifest.skillVersion }));
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
  // Requiring any fixture module would be a discovery regression.
  for (const file of ['agentClient.cjs', 'discovery.cjs', 'secureStore.cjs']) writeFileSync(join(root, 'src', file), "throw Error('EXAMPLE_CLI_MUST_NOT_EXECUTE_DURING_DISCOVERY');");
  return { home, install, root, manifest, options: { home, env: { LOCALAPPDATA: join(base, 'EXAMPLE_LOCAL'), CODEX_HOME: join(base, 'EXAMPLE_CODEX') } } };
}
