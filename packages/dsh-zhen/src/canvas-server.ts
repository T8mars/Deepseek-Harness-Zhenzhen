#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CanvasBridge } from './canvas.ts';
import { createCanvasMcp } from './canvas-mcp.ts';

const args = process.argv.slice(2);
if ((args.length !== 4 && args.length !== 6) || args[0] !== '--cli-root' || args[2] !== '--digest' || !/^[a-f0-9]{64}$/.test(args[3]!) || (args.length === 6 && args[4] !== '--instance')) {
  process.stderr.write('Usage: dsh-zhen-canvas-mcp --cli-root <installed-cli-directory> --digest <reviewed-sha256> [--instance <id>]\n');
  process.exit(2);
}
const bridge = new CanvasBridge({ root: args[1]!, digest: args[3]!, instance: args[5] ?? '' });
const server = createCanvasMcp(bridge);
await server.connect(new StdioServerTransport());
