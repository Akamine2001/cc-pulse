// tools/pr-review/mcp/handlers/guidelines/get-unchecked.ts

import type { ToolHandler, ToolResult } from '../../types';
import type { ReviewContext } from '../../context/review-context';

export const getUncheckedGuidelineHandler: ToolHandler = {
  name: 'get_unchecked_guideline',

  description: 'Get one unchecked guideline. Returns null if all guidelines are checked.',

  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },

  async execute(_args: unknown, context: ReviewContext): Promise<ToolResult> {
    console.error('[MCP-ReviewUtil] Processing get_unchecked_guideline... ');

    const unchecked = context.getUncheckedGuideline();

    if (!unchecked) {
      console.error('[MCP-ReviewUtil] All guidelines are checked');
      return {
        content: [{ type: 'text', text: JSON.stringify(null) }]
      };
    }

    console.error(`[MCP-ReviewUtil] Returning unchecked guideline: ID ${unchecked.id}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(unchecked, null, 2) }]
    };
  }
};
