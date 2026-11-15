/**
 * @pipes/mcp - MCP server entry point (stdio JSON-RPC)
 */
import { startServer } from './server.js';

export { startServer, TOOLS, handleRequest, PROTOCOL_VERSION, SERVER_INFO } from './server.js';

const isDirect = Boolean(
  process.argv[1] &&
    (process.argv[1].endsWith('packages/mcp/src/index.ts') ||
      process.argv[1].endsWith('packages/mcp/dist/index.js') ||
      process.argv[1].endsWith('/mcp/src/index.ts') ||
      process.argv[1].endsWith('/mcp/src/index.js')),
);

if (isDirect || process.env.PIPES_MCP_STDIO === '1') {
  startServer();
}
