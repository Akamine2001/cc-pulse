import type { ToolHandler, ToolResult } from '../../types';
import type { ReviewContext } from '../../context/review-context';
import { SubmitAllReviewsInputSchema } from '../../../shared/schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  generateSummary,
  calculateStats,
  saveReviewToLocalFile,
  postReviewToGitHub
} from './submit-helpers';

export const submitAllReviewsHandler: ToolHandler = {
  name: 'submit_all_reviews',

  description: 'Submit all buffered review issues to GitHub with overall comment and category assessments. Call this once at the end after all guidelines are checked.',

  inputSchema: zodToJsonSchema(SubmitAllReviewsInputSchema, { $refStrategy: 'none' }),

  async execute(args: unknown, context: ReviewContext): Promise<ToolResult> {
    const input = SubmitAllReviewsInputSchema.parse(args);
    const issues = context.getReviewIssuesBuffer();

    // 統計を計算
    const stats = calculateStats(issues);

    // サマリーを生成
    const summary = generateSummary(
      input.summary_comment,
      input.category_comments,
      [...issues],
      context.config.julesSessionFound
    );

    const reviewResult = {
      issues: [...issues],
      summary,
      stats
    };

    console.error(`[MCP] Submitting all reviews: ${issues.length} issues`);

    // ローカルモード判定
    if (context.config.isLocalMode) {
      try {
        console.error('[MCP] LOCAL_MODE detected - saving to file...');

        const { DiffParser } = await import('../../../lib/parsers.js');
        const diffParser = new DiffParser();
        const diffFiles = diffParser.getModifiedFiles();

        const outputPath = await saveReviewToLocalFile(
          reviewResult,
          context.config.prNumber,
          diffFiles
        );

        // バッファをクリア
        context.clearReviewIssuesBuffer();
        console.error(`[MCP] Review buffer cleared`);

        return {
          content: [{
            type: 'text',
            text: `✅ Review saved to file (LOCAL_MODE).\n\nFile: ${outputPath}\n\nTotal issues: ${stats.total_issues}\n- Critical: ${stats.critical}\n- High: ${stats.high}\n- Medium: ${stats.medium}\n- Low: ${stats.low}`
          }]
        };
      } catch (error) {
        console.error('[MCP] Failed to save review to file:', error);
        return {
          content: [{
            type: 'text',
            text: `❌ Failed to save review: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }

    // GitHubモード
    const prClient = context.getPRClient();
    if (!prClient) {
      console.error('[MCP] GitHub clients not initialized');
      return {
        content: [{
          type: 'text',
          text: `⚠️ Review validated but not posted (clients not initialized).\n\nTotal: ${stats.total_issues}`
        }]
      };
    }

    if (!context.config.headSha) {
      console.error('[MCP] HEAD_SHA not provided');
      return {
        content: [{
          type: 'text',
          text: `⚠️ Review validated but not posted (HEAD_SHA missing).\n\nTotal: ${stats.total_issues}`
        }]
      };
    }

    try {
      const { DiffParser } = await import('../../../lib/parsers.js');
      const diffParser = new DiffParser();
      const diffFiles = diffParser.getModifiedFiles();

      console.error(`[MCP] Diff contains ${diffFiles.length} files`);

      await postReviewToGitHub(context, reviewResult, diffFiles);

      // バッファをクリア
      context.clearReviewIssuesBuffer();
      console.error(`[MCP] Review buffer cleared`);

      return {
        content: [{
          type: 'text',
          text: `✅ Review submitted to GitHub.\n\nTotal: ${stats.total_issues}\n- Critical: ${stats.critical}\n- High: ${stats.high}\n- Medium: ${stats.medium}\n- Low: ${stats.low}`
        }]
      };
    } catch (error) {
      console.error('[MCP] Failed to post review to GitHub:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to post review: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
};
