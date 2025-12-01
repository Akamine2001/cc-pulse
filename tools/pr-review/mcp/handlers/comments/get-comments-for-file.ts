// tools/pr-review/mcp/handlers/comments/get-comments-for-file.ts

import type { ToolHandler, ToolResult } from '../../types';
import type { ReviewContext } from '../../context/review-context';

export const getCommentsForFileHandler: ToolHandler = {
  name: 'get_comments_for_file',

  description: 'Get existing review comments for a specific file to avoid duplicate issues',

  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'File path (e.g., "src/commands/setup.ts")'
      }
    },
    required: ['file_path']
  },

  async execute(args: unknown, context: ReviewContext): Promise<ToolResult> {
    const { file_path } = args as { file_path: string };

    // Resolve済みコメントを除外した結果を取得
    const unresolvedComments = context.getCommentsForFile(file_path);

    console.error(
      `[MCP] get_comments_for_file: ${file_path} - ${unresolvedComments.length} unresolved`
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(unresolvedComments, null, 2) }]
    };
  }
};
