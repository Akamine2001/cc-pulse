import { join } from 'path';
import type { McpStdioServerConfig } from '@anthropic-ai/claude-agent-sdk/sdkTypes';

/**
 * Create Duplicate Checker MCP Server configuration (Python-based)
 *
 * Returns configuration for Python MCP server (tools/pr-review/mcp/duplicate-checker-server.py)
 * Agent SDK will automatically start the process and manage stdio communication
 */
export function createDuplicateCheckerMcpServer(): McpStdioServerConfig {
  const mcpDir = join(process.cwd(), 'tools', 'pr-review', 'mcp');
  const serverScript = join(mcpDir, 'duplicate-checker-server.py');

  return {
    type: 'stdio',
    command: 'uv',
    args: ['run', '--directory', mcpDir, 'python', serverScript],
    env: {
      PYTHONUNBUFFERED: '1',  // Ensure Python output is not buffered
    }
  };
}
