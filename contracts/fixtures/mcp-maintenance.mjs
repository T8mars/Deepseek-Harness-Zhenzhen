import { mkdtempSync, realpathSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { McpMarket } from '../../packages/dsh-zhen/lib/mcp-market.js';
import { MCP_RECIPES } from '../../packages/dsh-zhen/lib/mcp-market-schema.js';
import { fixtureInstallation } from './mcp-market.mjs';

/** Synthetic program and download boundary; real SDK/DSH transport still runs. */
export function maintenanceFixture() {
  const temp=realpathSync.native(tmpdir()),root=mkdtempSync(join(temp,'dsh-zhen-mcp-maintenance-'));
  const records=fixtureInstallation(root),old=records[0],recipe=MCP_RECIPES.memory;
  const entry=join(root,'packages/memory',old.release.version,'node_modules',recipe.package,recipe.entry),body=readFileSync(entry,'utf8');
  let release={...old.release},downloads=0,fail=false;
  const fetcher=async(url,options)=>{
    if(options?.headers?.Authorization)throw Error('EXAMPLE_ONLY_UNEXPECTED_CREDENTIAL');
    if(url.startsWith('https://raw.githubusercontent.com/'))return new Response('EXAMPLE ONLY source license fixture');
    return Response.json({name:recipe.package,version:release.version,repository:{url:'git+https://github.com/modelcontextprotocol/servers.git'},bin:{'mcp-server-memory':recipe.entry},engines:{node:release.node},license:release.license,gitHead:release.gitHead,dist:{integrity:release.integrity,tarball:`https://registry.npmjs.org/${recipe.package}/-/server-memory-${release.version}.tgz`}});
  };
  const installer=async(stage,cache,signal)=>{
    downloads++;signal?.throwIfAborted();if(fail)throw Error('EXAMPLE_ONLY_INSTALL_FAILURE');
    const directory=join(stage,'node_modules',recipe.package);mkdirSync(join(directory,'dist'),{recursive:true});
    writeFileSync(join(directory,'package.json'),JSON.stringify({name:recipe.package,version:release.version,type:'module'}));
    writeFileSync(join(directory,recipe.entry),body+`\n// EXAMPLE ONLY rebuilt program ${downloads}\n`);
    writeFileSync(join(stage,'pnpm-lock.yaml'),`lockfileVersion: '9.0'\npackages:\n  '${recipe.package}@${release.version}':\n    resolution:\n      integrity: ${recipe.integrity}\n`);
  };
  let market=new McpMarket(root,fetcher,installer);
  return{root,entry,old,body,fetcher,installer,get market(){return market;},get downloads(){return downloads;},set fail(value){fail=value;},set release(value){release=value;},reopen(){market.close();market=new McpMarket(root,fetcher,installer);return market;},dispose(){market.close();const absolute=realpathSync.native(root),rel=relative(temp,absolute);if(!rel||isAbsolute(rel)||rel.startsWith('..')||rel.includes('/')||rel.includes('\\'))throw Error('Maintenance cleanup refused.');rmSync(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:100});}};
}
