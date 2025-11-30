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
    console.error('[MCP-ReviewUtil] Processing get_unchecked_guideline...');

    const guidelinesData = context.getGuidelines();

    if (!guidelinesData) {
      console.error('[MCP-ReviewUtil] ERROR: guidelinesData is null');
      return {
        content: [{ type: 'text', text: JSON.stringify(null) }]
      };
    }

    console.error(`[MCP-ReviewUtil] Total guidelines: ${guidelinesData.guidelines.length}`);
    console.error(`[MCP-ReviewUtil] Checked count: ${guidelinesData.guidelines.filter(g => g.checked).length}`);

    // 最初の未チェック観点を取得
    const unchecked = guidelinesData.guidelines.find(g => !g.checked);

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
