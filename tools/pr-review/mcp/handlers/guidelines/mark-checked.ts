// tools/pr-review/mcp/handlers/guidelines/mark-checked.ts

import type { ToolHandler, ToolResult } from '../../types';
import type { ReviewContext } from '../../context/review-context';

export const markCheckedHandler: ToolHandler = {
  name: 'mark_checked',

  description: 'Mark a guideline as checked',

  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'Guideline ID to mark as checked'
      }
    },
    required: ['id']
  },

  async execute(args: unknown, context: ReviewContext): Promise<ToolResult> {
    console.error('[MCP-ReviewUtil] Processing mark_checked...');

    const { id } = args as { id: number };
    console.error(`[MCP-ReviewUtil] Marking guideline ID: ${id}`);

    const success = context.markGuidelineChecked(id);

    if (!success) {
      console.error(`[MCP-ReviewUtil] ERROR: Guideline ID ${id} not found`);
      return {
        content: [{ type: 'text', text: `❌ Guideline ID ${id} not found` }],
        isError: true
      };
    }

    // ファイルに保存
    await context.saveGuidelines();

    const remaining = context.getUncheckedGuidelinesCount();
    console.error(`[MCP-ReviewUtil] Marked guideline ${id} as checked. Remaining: ${remaining}`);

    return {
      content: [{
        type: 'text',
        text: `✅ Guideline ${id} marked as checked. Remaining unchecked: ${remaining}`
      }]
    };
  }
};
