#!/usr/bin/env node
/** Stdio relay for curated programs. The published MCP client inherits ambient
 * variables; only this relay receives them. The third-party child gets a small
 * OS environment and its recipe's explicit data location. This is not a sandbox. */
import { spawn } from 'node:child_process';
import { join, isAbsolute, dirname } from 'node:path';
import { mkdirSync, realpathSync } from 'node:fs';
import { MCP_RECIPES, mcpId } from './mcp-market-schema.ts';
import { canonicalMcpWorkspace, inspectMcpInstallation, mcpChildEnvironment } from './mcp-market.ts';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 10 || args[0] !== '--id' || args[2] !== '--directory' || args[4] !== '--digest' || args[6] !== '--workspace' || args[8] !== '--data') throw new Error('Invalid launch.');
  const id = mcpId.parse(args[1]), directory = args[3]!, digest = args[5]!, workspace = canonicalMcpWorkspace(args[7]!), data = args[9]!;
  if (!isAbsolute(directory) || !/^[a-f0-9]{64}$/.test(digest) || !isAbsolute(data)) throw new Error('Invalid launch.');
  if (inspectMcpInstallation(directory).digest !== digest) throw new Error('Program changed.');
  const recipe = MCP_RECIPES[id], root = realpathSync(directory);
  const entry = join(root, 'node_modules', recipe.package, recipe.entry);
  // Inspection refuses symlinks throughout the tree; recipes fix the entry path.
  mkdirSync(dirname(data), { recursive: true });
  const child = spawn(process.execPath, [entry, ...(id === 'filesystem' ? [workspace] : [])], {
    cwd: root, env: mcpChildEnvironment(id === 'memory' ? { MEMORY_FILE_PATH: data } : {}),
    windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
  });
  process.stdin.pipe(child.stdin); child.stdout.pipe(process.stdout);
  child.stdin.on('error', () => {});
  const stop = (): void => { child.kill(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  process.stdout.on('error', stop);
  await new Promise<void>(resolve => {
    let failed = false;
    child.once('error', () => { failed = true; });
    child.once('close', code => { process.stdin.unpipe(child.stdin); process.stdin.pause(); process.exitCode = !failed && code === 0 ? 0 : 1; resolve(); });
  });
}
main().catch(() => { process.stderr.write('DSH-zhen MCP could not start; check the connection panel.\n'); process.exitCode = 1; });
