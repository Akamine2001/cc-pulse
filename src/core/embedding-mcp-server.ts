import { join } from 'path';
import type { McpStdioServerConfig } from '@anthropic-ai/claude-agent-sdk/sdkTypes';

/**
 * Create Embedding MCP Server configuration (Python-based)
 *
 * Returns configuration for Python MCP server (mcp/server.py)
 * Agent SDK will automatically start the process and manage stdio communication
 */
export function createEmbeddingMcpServer(): McpStdioServerConfig {
  const mcpDir = join(process.cwd(), 'mcp');
  const serverScript = join(mcpDir, 'server.py');

  return {
    type: 'stdio',
    command: 'uv',
    args: ['run', '--directory', mcpDir, 'python', serverScript],
    env: {
      PYTHONUNBUFFERED: '1',  // Ensure Python output is not buffered
    }
  };
}
