import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { McpMarket, mcpChildEnvironment } from '../packages/dsh-zhen/lib/mcp-market.js';
import { MCP_RECIPES } from '../packages/dsh-zhen/lib/mcp-market-schema.js';

// Actual published reference program; all memory and SQLite data are synthetic
// and confined to an owned system temporary directory. No model or paid API.
const temp=realpathSync.native(tmpdir()),root=mkdtempSync(join(temp,'dsh-zhen-real-mcp-maintenance-'));
const workspace=join(root,'EXAMPLE_ONLY_PROJECT');mkdirSync(workspace);
let market,client,transport;
async function stop(){await client?.close();await transport?.close();client=undefined;transport=undefined;}
async function start(){
  const program=market.launch('memory',MCP_RECIPES.memory.version);
  transport=new StdioClientTransport({command:process.execPath,args:[resolve('packages/dsh-zhen/lib/mcp-server.js'),'--id','memory','--directory',program.directory,'--digest',program.digest,'--workspace',workspace,'--data',market.dataPath('memory',workspace)],cwd:program.directory,env:mcpChildEnvironment(),stderr:'pipe'});
  client=new Client({name:'EXAMPLE_ONLY_MAINTENANCE_SMOKE',version:'1.0.0'});await client.connect(transport);
  assert.equal((await client.listTools()).tools.length,9);
}
try{
  market=new McpMarket(join(root,'mcp'));
  const recipe=MCP_RECIPES.memory;console.log('Installing the exact published memory server without lifecycle hooks…');
  const installed=await market.install('memory',recipe.version,recipe.integrity);market.select('memory',recipe.version,workspace);market.grant('EXAMPLE_OLD_SESSION','memory');await start();
  const created=await client.callTool({name:'create_entities',arguments:{entities:[{name:'EXAMPLE_ONLY_REPAIR_ENTITY',entityType:'EXAMPLE_ONLY',observations:['EXAMPLE_ONLY_PERSISTENT_OBSERVATION']}]}});assert.notEqual(created.isError,true);
  const data=market.dataPath('memory',workspace),before=createHash('sha256').update(readFileSync(data)).digest('hex');
  console.log('Draining the reference program and re-downloading its reviewed root version…');
  await market.repair('memory',recipe.version,stop);assert.equal(market.active().length,0);assert.equal(createHash('sha256').update(readFileSync(data)).digest('hex'),before);
  const repaired=market.snapshot().installations[0],archive=market.snapshot().archives[0];assert.equal(archive.verified,true);assert.equal(archive.programRetained,true);assert.equal(repaired.release.integrity,installed.release.integrity);
  market.select('memory',recipe.version,workspace);assert.throws(()=>market.assertSession('EXAMPLE_OLD_SESSION',workspace));await start();
  const graph=await client.callTool({name:'read_graph',arguments:{}});assert.notEqual(graph.isError,true);assert.match(JSON.stringify(graph),/EXAMPLE_ONLY_PERSISTENT_OBSERVATION/);await stop();
  console.log('Restoring the prior matching program copy and checking the same memory file…');
  await market.restoreArchive(archive.archiveId,stop);assert.equal(market.launch('memory',recipe.version).digest,installed.digest);assert.equal(market.active().length,0);market.select('memory',recipe.version,workspace);await start();
  const restored=await client.callTool({name:'read_graph',arguments:{}});assert.notEqual(restored.isError,true);assert.match(JSON.stringify(restored),/EXAMPLE_ONLY_PERSISTENT_OBSERVATION/);assert.equal(createHash('sha256').update(readFileSync(data)).digest('hex'),before);
  const evidence={at:new Date().toISOString(),node:process.versions.node,package:recipe.package,version:recipe.version,rootIntegrity:installed.release.integrity,oldDigest:installed.digest,repairedDigest:repaired.digest,originalRestored:true,syntheticMemoryPreserved:true,explicitReenableRequired:true,oldSessionRevoked:true,tools:9,browserInspected:false,paidCalls:0};
  mkdirSync('.runtime/evidence',{recursive:true});writeFileSync('.runtime/evidence/mcp-maintenance-stdio.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{
  await stop();market?.close();const absolute=realpathSync.native(root),rel=relative(temp,absolute);if(!rel||isAbsolute(rel)||rel.startsWith('..')||rel.includes('/')||rel.includes('\\'))throw Error('Smoke cleanup refused.');rmSync(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
