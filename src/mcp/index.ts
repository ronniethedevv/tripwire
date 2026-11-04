// Tripwire MCP server (stdio), spawned by the tripwire agent's session.
// Logs go to STDERR only: stdout is the MCP protocol stream.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openStore } from '../store/index.js';
import { loadMcpConfig } from './config.js';
import { createMcpServer } from './server.js';
import { LoopService } from './service.js';

async function main(): Promise<void> {
  const config = loadMcpConfig(process.env);
  const store = openStore(config.databasePath);
  const service = new LoopService({ store, humanHandles: config.humanHandles });
  const server = createMcpServer(service, { zone: config.zone });
  await server.connect(new StdioServerTransport());
  console.error('tripwire mcp server connected (stdio)');
}

main().catch((error: unknown) => {
  console.error('tripwire mcp server failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
