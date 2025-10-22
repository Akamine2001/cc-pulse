#!/usr/bin/env bun
/**
 * MCP Server for PR review utilities (TypeScript stdio)
 *
 * Provides tools:
 * - format_review: Format and validate review data before submission
 * - submit_review: Submit the final review result
 * - get_comments_for_file: Get existing review comments for a specific file
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { existsSync } from 'fs';
import { Octokit } from 'octokit';
import { GitHubClient } from '../infrastructure/github/github-client';
import { ThreadResolver } from '../infrastructure/github/thread-resolver';
import { BOT_SIGNATURE } from '../shared/constants';

// Import schemas from shared
import { ReviewIssueSchema, ReviewStatsSchema, type ReviewComment } from '../shared/schemas';

// Global storage for existing comments (indexed by file_path)
const commentsByFile = new Map<string, ReviewComment[]>();

// GitHub clients (initialized from environment variables)
let octokit: Octokit | null = null;
let githubClient: GitHubClient | null = null;
let threadResolver: ThreadResolver | null = null;
let prNumber: number = 0;
let prAuthor: string = '';

// Input schemas
const FormatReviewInputSchema = z.object({
  issues: z.array(ReviewIssueSchema),
  summary: z.string(),
  stats: ReviewStatsSchema
});

const SubmitReviewInputSchema = z.object({
  issues: z.array(ReviewIssueSchema),
  summary: z.string(),
  stats: ReviewStatsSchema
});

type FormatReviewInput = z.infer<typeof FormatReviewInputSchema>;
type SubmitReviewInput = z.infer<typeof SubmitReviewInputSchema>;

/**
 * Initialize existing comments from JSON file
 * Reads from path specified in EXISTING_COMMENTS_PATH environment variable
 */
async function initializeComments() {
  const filePath = process.env.EXISTING_COMMENTS_PATH;

  if (!filePath || !existsSync(filePath)) {
    console.error('[MCP] No existing comments file found');
    return;
  }

  try {
    const comments: ReviewComment[] = await Bun.file(filePath).json();

    for (const comment of comments) {
      if (!commentsByFile.has(comment.file_path)) {
        commentsByFile.set(comment.file_path, []);
      }
      commentsByFile.get(comment.file_path)!.push(comment);
    }

    console.error(`[MCP] Loaded ${comments.length} existing comments from ${filePath}`);
  } catch (error) {
    console.error('[MCP] Failed to load existing comments:', error);
  }
}

/**
 * Initialize GitHub clients from environment variables
 */
function initializeGitHubClients() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const prNumberStr = process.env.PR_NUMBER;
  prAuthor = process.env.PR_AUTHOR || '';

  if (!token || !owner || !repo || !prNumberStr) {
    console.error('[MCP] Missing required environment variables for GitHub API');
    return;
  }

  prNumber = parseInt(prNumberStr, 10);
  octokit = new Octokit({ auth: token });
  githubClient = new GitHubClient(octokit, owner, repo);
  threadResolver = new ThreadResolver(octokit);

  console.error('[MCP] GitHub clients initialized');
}

// Create MCP server
const server = new Server(
  {
    name: 'review-util',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'format_review',
        description: 'Format and validate review data before submission. Call this with your review data to validate the format before calling submit_review.',
        inputSchema: zodToJsonSchema(FormatReviewInputSchema, { $refStrategy: 'none' })
      },
      {
        name: 'submit_review',
        description: 'Submit the final review result. ONLY call this after format_review succeeds.',
        inputSchema: zodToJsonSchema(SubmitReviewInputSchema, { $refStrategy: 'none' })
      },
      {
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
        }
      },
      {
        name: 'update_conversation',
        description: 'Update conversation status and post comment based on A/B/C analysis',
        inputSchema: {
          type: 'object',
          properties: {
            comment_id: {
              type: 'number',
              description: 'Comment ID from get_comments_for_file'
            },
            thread_id: {
              type: ['string', 'null'],
              description: 'Thread ID from get_comments_for_file (nullable)'
            },
            action: {
              type: 'string',
              enum: ['no_change', 'has_replies', 'major_change', 'todo_added', 'not_resolved'],
              description: 'Action to take: no_change (差分なし), has_replies (返信あり), major_change (大幅変更), todo_added (TODO追加), not_resolved (未解決)'
            },
            reasoning: {
              type: 'string',
              description: 'Reasoning for the action (具体的な判定理由)'
            }
          },
          required: ['comment_id', 'action', 'reasoning']
        }
      }
    ] as Tool[]
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'format_review') {
    const input = FormatReviewInputSchema.parse(args);

    // Validate stats consistency
    const actualStats = {
      total_issues: input.issues.length,
      critical: input.issues.filter(i => i.severity === 'critical').length,
      high: input.issues.filter(i => i.severity === 'high').length,
      medium: input.issues.filter(i => i.severity === 'medium').length,
      low: input.issues.filter(i => i.severity === 'low').length
    };

    const statsMatch =
      actualStats.total_issues === input.stats.total_issues &&
      actualStats.critical === input.stats.critical &&
      actualStats.high === input.stats.high &&
      actualStats.medium === input.stats.medium &&
      actualStats.low === input.stats.low;

    if (!statsMatch) {
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ Stats mismatch detected!\n\nExpected: ${JSON.stringify(input.stats)}\nActual: ${JSON.stringify(actualStats)}\n\nPlease correct the stats and try again.`
          }
        ]
      };
    }

    // Validation passed
    return {
      content: [
        {
          type: 'text',
          text: `✅ Review data validated successfully!\n\nFormatted review (${input.issues.length} issues):\n- Critical: ${actualStats.critical}\n- High: ${actualStats.high}\n- Medium: ${actualStats.medium}\n- Low: ${actualStats.low}\n\n✅ Validation passed! Now call submit_review with this exact data.`
        }
      ]
    };
  }

  if (name === 'submit_review') {
    const input = SubmitReviewInputSchema.parse(args);

    // Stats validation (same as format_review)
    const actualStats = {
      total_issues: input.issues.length,
      critical: input.issues.filter(i => i.severity === 'critical').length,
      high: input.issues.filter(i => i.severity === 'high').length,
      medium: input.issues.filter(i => i.severity === 'medium').length,
      low: input.issues.filter(i => i.severity === 'low').length
    };

    // Return success message
    return {
      content: [
        {
          type: 'text',
          text: `✅ Review result submitted successfully.\n\nTotal issues: ${actualStats.total_issues}\n- Critical: ${actualStats.critical}\n- High: ${actualStats.high}\n- Medium: ${actualStats.medium}\n- Low: ${actualStats.low}`
        }
      ]
    };
  }

  if (name === 'get_comments_for_file') {
    const { file_path } = args as { file_path: string };
    const comments = commentsByFile.get(file_path) || [];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(comments, null, 2)
        }
      ]
    };
  }

  if (name === 'update_conversation') {
    const { comment_id, thread_id, action, reasoning } = args as {
      comment_id: number;
      thread_id: string | null;
      action: 'no_change' | 'has_replies' | 'major_change' | 'todo_added' | 'not_resolved';
      reasoning: string;
    };

    if (!githubClient || !threadResolver) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ GitHub clients not initialized'
          }
        ],
        isError: true
      };
    }

    try {
      switch (action) {
        case 'no_change':
          // 差分なし → 警告コメント
          await githubClient.postReplyComment(
            prNumber,
            comment_id,
            `⚠️ このファイルはコメント投稿後に変更されていません。\n\n${reasoning}\n\n引き続き対応をお願いします 🙏\n\n_- ${BOT_SIGNATURE}_`
          );
          console.error(`[MCP] Posted warning for comment ${comment_id}`);
          break;

        case 'has_replies':
          // 返信あり → オーナーメンション
          await githubClient.postReplyComment(
            prNumber,
            comment_id,
            `@${prAuthor} こちらのConversationについて、判断をお願いします。\n\n${reasoning}\n\nファイルに変更がありましたが、議論が継続中のため、自動クローズしていません。\n\n_- ${BOT_SIGNATURE}_`
          );
          console.error(`[MCP] Mentioned owner for comment ${comment_id}`);
          break;

        case 'major_change':
          // 大幅変更 → スレッドResolve + 成功コメント
          if (thread_id) {
            await threadResolver.resolveThread(thread_id);
            console.error(`[MCP] Resolved thread ${thread_id}`);
          }
          await githubClient.postReplyComment(
            prNumber,
            comment_id,
            `✅ 実装が大幅に変更されました\n\n${reasoning}\n\n前回の指摘は無効になりました。新しい実装に問題があれば、次のレビューでお知らせします。\n\n_- ${BOT_SIGNATURE}_`
          );
          console.error(`[MCP] Resolved comment ${comment_id} (major_change)`);
          break;

        case 'todo_added':
          // TODO追加 → スレッドResolve + 成功コメント
          if (thread_id) {
            await threadResolver.resolveThread(thread_id);
            console.error(`[MCP] Resolved thread ${thread_id}`);
          }
          await githubClient.postReplyComment(
            prNumber,
            comment_id,
            `✅ TODO/コメントで対応計画が記載されました\n\n${reasoning}\n\n対応計画が明確なため、クローズします。\n\n_- ${BOT_SIGNATURE}_`
          );
          console.error(`[MCP] Resolved comment ${comment_id} (todo_added)`);
          break;

        case 'not_resolved':
          // 未解決 → 再コメント
          await githubClient.postReplyComment(
            prNumber,
            comment_id,
            `⚠️ まだ根本的な解決に至っていません\n\n${reasoning}\n\n引き続き対応をお願いします 🙏\n\n_- ${BOT_SIGNATURE}_`
          );
          console.error(`[MCP] Posted reminder for comment ${comment_id}`);
          break;
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ ${action} processed successfully for comment ${comment_id}`
          }
        ]
      };
    } catch (error) {
      console.error(`[MCP] Failed to update conversation for comment ${comment_id}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to update conversation: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Run server
async function main() {
  // Initialize existing comments from JSON file
  await initializeComments();

  // Initialize GitHub clients
  initializeGitHubClients();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
