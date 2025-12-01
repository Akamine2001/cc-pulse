import type { ToolHandler, ToolResult } from '../../types';
import type { ReviewContext } from '../../context/review-context';
import { ReviewIssueSchema } from '../../../shared/schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const addReviewCommentHandler: ToolHandler = {
  name: 'add_review_comment',

  description: 'Add a review issue to buffer (does not post to GitHub yet). Use this for each issue found during review.',

  inputSchema: zodToJsonSchema(ReviewIssueSchema, { $refStrategy: 'none' }),

  async execute(args: unknown, context: ReviewContext): Promise<ToolResult> {
    const issue = ReviewIssueSchema.parse(args);

    // バッファに追加
    context.addReviewIssue(issue);

    const bufferSize = context.getReviewIssuesCount();
    console.error(`[MCP] Added review issue to buffer: ${issue.category} (${issue.severity})`);
    console.error(`[MCP] Buffer size: ${bufferSize} issues`);

    return {
      content: [{
        type: 'text',
        text: `✅ Review issue added to buffer. Total buffered: ${bufferSize}`
      }]
    };
  }
};
