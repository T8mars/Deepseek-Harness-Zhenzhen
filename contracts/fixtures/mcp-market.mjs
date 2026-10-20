import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { inspectMcpInstallation } from '../../packages/dsh-zhen/lib/mcp-market.js';
import { MCP_RECIPES } from '../../packages/dsh-zhen/lib/mcp-market-schema.js';
const require = createRequire(import.meta.url);
const moduleUrl = name => pathToFileURL(require.resolve(name)).href;
export function fixtureInstallation(root, versions = ['2026.8.31']) {
  const installations = versions.map(version => {
    const recipe = MCP_RECIPES.memory, directory = join(root, 'packages', 'memory', version);
    const pkg = join(directory, 'node_modules', recipe.package); mkdirSync(join(pkg, 'dist'), { recursive: true });
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: recipe.package, version, type: 'module' }));
    writeFileSync(join(pkg, 'dist/index.js'), `
import { Server } from ${JSON.stringify(moduleUrl('@modelcontextprotocol/sdk/server/index.js'))};
import { StdioServerTransport } from ${JSON.stringify(moduleUrl('@modelcontextprotocol/sdk/server/stdio.js'))};
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from ${JSON.stringify(moduleUrl('@modelcontextprotocol/sdk/types.js'))};
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const boot=randomUUID();
const server = new Server({name:'EXAMPLE_ONLY_TEST_SERVER',version:'1.0.0'},{capabilities:{tools:{},resources:{}}}); let running=0;
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'fixture_probe',description:'Synthetic fixture only',inputSchema:{type:'object',properties:{wait:{type:'boolean'}}}}]}));
server.setRequestHandler(CallToolRequestSchema,async request=>{
  const overlap=running++>0;
  if(request.params.arguments?.wait){writeFileSync(process.env.MEMORY_FILE_PATH+'.started','EXAMPLE_ONLY');await new Promise(resolve=>setTimeout(resolve,180));}
  running--; return {content:[{type:'text',text:JSON.stringify({boot,overlap,safe:!process.env.EXAMPLE_ONLY_SECRET && !process.env.DSH_HOME && !process.env.NODE_OPTIONS,data:process.env.MEMORY_FILE_PATH})}]};
});
server.setRequestHandler(ListResourcesRequestSchema,async()=>({resources:[{uri:'memory://EXAMPLE_ONLY',name:'EXAMPLE_ONLY'}]}));
server.setRequestHandler(ReadResourceRequestSchema,async()=>({contents:[{uri:'memory://EXAMPLE_ONLY',text:'EXAMPLE_ONLY_RESOURCE'}]}));
await server.connect(new StdioServerTransport());
`);
    writeFileSync(join(directory, 'package.json'), '{"private":true}');
    writeFileSync(join(directory, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\npackages:\n  '${recipe.package}@${version}':\n    resolution:\n      integrity: ${recipe.integrity}\n`);
    return { release: { id: 'memory', version, integrity: recipe.integrity, gitHead: '1'.repeat(40), node: '', license: 'EXAMPLE_ONLY_FIXTURE', checkedAt: new Date().toISOString() }, ...inspectMcpInstallation(directory), installedAt: new Date().toISOString() };
  });
  writeFileSync(join(root, 'market.json'), JSON.stringify({ automatic: false, checkedAt: '', message: 'EXAMPLE_ONLY_FIXTURE', nextEpoch: 1, candidates: [], installations, selections: [] }));
  return installations;
}
