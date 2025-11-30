// tools/pr-review/mcp/handlers/guidelines/get-all.ts

import type { ToolHandler, ToolResult } from '../../types';
import type { ReviewContext } from '../../context/review-context';

export const getAllGuidelinesHandler: ToolHandler = {
  name: 'get_all_guidelines',

  description: 'Get all guidelines with their current status',

  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },

  async execute(_args: unknown, context: ReviewContext): Promise<ToolResult> {
    const guidelinesData = context.getGuidelines();

    if (!guidelinesData) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ guidelines: [] }) }]
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(guidelinesData, null, 2) }]
    };
  }
};
