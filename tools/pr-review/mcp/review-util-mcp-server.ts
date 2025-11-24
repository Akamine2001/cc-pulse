#!/usr/bin/env bun
/**
 * MCP Server for PR review utilities (TypeScript stdio)
 *
 * Provides tools:
 * - submit_review: Submit the final review result with automatic validation
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
import { PRClient } from '../../shared/github/pr-client';
import { ThreadResolver } from '../../shared/github/thread-resolver';
import { BOT_SIGNATURE, AI_AGENT_MENTION } from '../../shared/constants';

// Import schemas from shared
import {
  ReviewIssueSchema,
  ReviewStatsSchema,
  SubmitAllReviewsInputSchema,
  type ReviewComment,
  type ReviewIssue,
  type CategoryComment
} from '../shared/schemas';
import type { GuidelinesFile } from '../shared/guidelines-types';

// Global storage for existing comments (indexed by file_path)
const commentsByFile = new Map<string, ReviewComment[]>();

// Review issues buffer
const reviewIssuesBuffer: ReviewIssue[] = [];

// GitHub clients (initialized from environment variables)
let octokit: Octokit | null = null;
let prClient: PRClient | null = null;
let threadResolver: ThreadResolver | null = null;
let prNumber: number = 0;
let prAuthor: string = '';
let headSha: string = '';
let owner: string = '';
let repo: string = '';
let guidelinesFilePath: string = '';

// Guidelines state (loaded from JSON file)
let guidelinesData: GuidelinesFile | null = null;

// Input schema
const SubmitReviewInputSchema = z.object({
  issues: z.array(ReviewIssueSchema),
  summary: z.string(),
  stats: ReviewStatsSchema
});

type SubmitReviewInput = z.infer<typeof SubmitReviewInputSchema>;

/**
 * サマリーを生成
 *
 * @param summaryComment 全体の総評
 * @param categoryComments カテゴリ別の評価コメント
 * @param issues レビュー問題リスト
 * @returns フォーマット済みサマリー
 */
function generateSummaryFromTemplate(
  summaryComment: string,
  categoryComments: CategoryComment[],
  issues: ReviewIssue[]
): string {
  let summary = `**総評**\n${summaryComment}\n\n`;

  summary += `**主な指摘**\n`;

  // カテゴリごとの件数を集計
  const categoryCount = new Map<string, number>();
  for (const issue of issues) {
    const count = categoryCount.get(issue.category) || 0;
    categoryCount.set(issue.category, count + 1);
  }

  // カテゴリコメントと件数を組み合わせて出力
  for (const { category, comment } of categoryComments) {
    const count = categoryCount.get(category) || 0;
    summary += `- ${category}: ${count}件 - ${comment}\n`;
  }

  return summary;
}

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
  owner = process.env.GITHUB_OWNER || '';
  repo = process.env.GITHUB_REPO || '';
  const prNumberStr = process.env.PR_NUMBER;
  prAuthor = process.env.PR_AUTHOR || '';
  headSha = process.env.HEAD_SHA || '';
  guidelinesFilePath = process.env.GUIDELINES_FILE_PATH || '';
  const isLocalMode = process.env.LOCAL_MODE === 'true';

  // prNumberは必ず設定（ローカルモードでも使用する）
  if (prNumberStr) {
    prNumber = parseInt(prNumberStr, 10);
  }

  if (isLocalMode) {
    console.error('[MCP] Running in LOCAL_MODE - GitHub posting disabled');
    return;
  }

  if (!token || !owner || !repo || !prNumberStr) {
    console.error('[MCP] Missing required environment variables for GitHub API');
    return;
  }
  octokit = new Octokit({ auth: token });
  prClient = new PRClient(octokit, owner, repo);
  threadResolver = new ThreadResolver(octokit);

  console.error('[MCP] GitHub clients initialized');
}

/**
 * Initialize guidelines from JSON file
 */
async function initializeGuidelines() {
  if (!guidelinesFilePath || !existsSync(guidelinesFilePath)) {
    console.error('[MCP-ReviewUtil] No guidelines file found:', guidelinesFilePath);
    return;
  }

  try {
    guidelinesData = await Bun.file(guidelinesFilePath).json();
    console.error(`[MCP-ReviewUtil] Loaded ${guidelinesData?.guidelines.length || 0} guidelines from ${guidelinesFilePath}`);
  } catch (error) {
    console.error('[MCP-ReviewUtil] Failed to load guidelines:', error);
  }
}

/**
 * Save guidelines back to JSON file
 */
async function saveGuidelines() {
  if (!guidelinesData || !guidelinesFilePath) {
    console.error('[MCP-ReviewUtil] Cannot save: no data or file path');
    return;
  }

  try {
    await Bun.write(guidelinesFilePath, JSON.stringify(guidelinesData, null, 2));
    console.error(`[MCP-ReviewUtil] Saved guidelines to ${guidelinesFilePath}`);
  } catch (error) {
    console.error('[MCP-ReviewUtil] Failed to save guidelines:', error);
    throw error;
  }
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
        name: 'add_review_comment',
        description: 'Add a review issue to buffer (does not post to GitHub yet). Use this for each issue found during review.',
        inputSchema: zodToJsonSchema(ReviewIssueSchema, { $refStrategy: 'none' })
      },
      {
        name: 'submit_all_reviews',
        description: 'Submit all buffered review issues to GitHub with overall comment and category assessments. Call this once at the end after all guidelines are checked.',
        inputSchema: zodToJsonSchema(SubmitAllReviewsInputSchema, { $refStrategy: 'none' })
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
      },
      {
        name: 'get_unchecked_guideline',
        description: 'Get one unchecked guideline. Returns null if all guidelines are checked.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
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
        }
      },
      {
        name: 'get_all_guidelines',
        description: 'Get all guidelines with their current status',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ] as Tool[]
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'add_review_comment') {
    const issue = ReviewIssueSchema.parse(args);

    // バッファに追加
    reviewIssuesBuffer.push(issue);

    console.error(`[MCP] Added review issue to buffer: ${issue.category} (${issue.severity})`);
    console.error(`[MCP] Buffer size: ${reviewIssuesBuffer.length} issues`);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Review issue added to buffer. Total buffered: ${reviewIssuesBuffer.length}`
        }
      ]
    };
  }

  if (name === 'submit_all_reviews') {
    // Zodスキーマでパース
    const input = SubmitAllReviewsInputSchema.parse(args);

    // 統計を自動計算
    const stats = {
      total_issues: reviewIssuesBuffer.length,
      critical: reviewIssuesBuffer.filter(i => i.severity === 'critical').length,
      high: reviewIssuesBuffer.filter(i => i.severity === 'high').length,
      medium: reviewIssuesBuffer.filter(i => i.severity === 'medium').length,
      low: reviewIssuesBuffer.filter(i => i.severity === 'low').length
    };

    // サマリーを生成
    let summary = generateSummaryFromTemplate(
      input.summary_comment,
      input.category_comments,
      reviewIssuesBuffer
    );

    // Julesセッション情報が見つからなかった場合、サマリーに追記
    const julesSessionFound = process.env.JULES_SESSION_FOUND === 'true';
    if (!julesSessionFound) {
      summary += '\n\nℹ️ Julesセッション: 見つかりませんでした（@julesコメントは送信されません）';
    }

    const reviewResult = {
      issues: reviewIssuesBuffer,
      summary,
      stats
    };

    console.error(`[MCP] Submitting all reviews: ${reviewIssuesBuffer.length} issues`);

    // ローカルモードのチェックを最優先（GitHubクライアント不要）
    const isLocalMode = process.env.LOCAL_MODE === 'true';

    if (isLocalMode) {
      // ローカルモード: mdファイルに保存
      try {
        console.error('[MCP] LOCAL_MODE detected - saving to file instead of GitHub...');

        const { formatReviewAsMarkdown, formatOutOfDiffComment } = await import('../shared/formatter.js');
        const reviewMarkdown = formatReviewAsMarkdown(reviewResult);

        // 差分ファイルリストを取得（差分外判定用）
        const { DiffParser } = await import('../lib/parsers.js');
        const diffParser = new DiffParser();
        const diffFiles = diffParser.getModifiedFiles();

        // インラインコメント（差分内かつline_rangeあり）
        const inlineIssues = reviewResult.issues.filter(
          issue => issue.file_path && issue.line_range && diffFiles.includes(issue.file_path)
        );

        // 差分外コメント（file_pathあり、diffFilesに含まれない）
        const outOfDiffIssues = reviewResult.issues.filter(
          issue => issue.file_path && !diffFiles.includes(issue.file_path)
        );

        let fullMarkdown = `# PR #${prNumber} 自動レビュー結果\n\n`;
        fullMarkdown += `## 📊 サマリー（PRコメント）\n\n`;
        fullMarkdown += `> **GitHub投稿先**: PRの会話タブに通常のコメントとして投稿されます\n\n`;
        fullMarkdown += `${reviewMarkdown}\n\n`;

        if (inlineIssues.length > 0) {
          fullMarkdown += `---\n\n## 💬 インラインコメント（PR Reviewコメント）\n\n`;
          fullMarkdown += `> **GitHub投稿先**: 差分ビューの各行にインラインで投稿されます（Files changedタブ）\n\n`;

          // ファイルごとにグループ化
          const byFile = new Map<string, typeof inlineIssues>();
          for (const issue of inlineIssues) {
            const file = issue.file_path!;
            if (!byFile.has(file)) {
              byFile.set(file, []);
            }
            byFile.get(file)!.push(issue);
          }

          for (const [file, issues] of byFile.entries()) {
            fullMarkdown += `### ${file}\n\n`;
            for (const issue of issues) {
              fullMarkdown += `#### Line ${issue.line_range!.start}-${issue.line_range!.end} (${issue.severity})\n\n`;
              fullMarkdown += `${issue.description}\n\n`;
              if (issue.suggestion) {
                fullMarkdown += `**提案**:\n${issue.suggestion}\n\n`;
              }
            }
          }
        }

        if (outOfDiffIssues.length > 0) {
          fullMarkdown += `---\n\n## ⚠️ 差分外ファイルへの指摘（PRコメント）\n\n`;
          fullMarkdown += `> **GitHub投稿先**: PRの会話タブに通常のコメントとして投稿されます\n\n`;
          fullMarkdown += `以下のファイルはPR差分に含まれていませんが、関連する問題が見つかりました。\n\n`;

          for (const issue of outOfDiffIssues) {
            const severityLabel = { critical: '重大', high: '重要', medium: '中程度', low: '軽微' }[issue.severity];
            const lineInfo = issue.line_range ? `:${issue.line_range.start}-${issue.line_range.end}` : '';

            fullMarkdown += `### ${issue.file_path}${lineInfo} (${severityLabel})\n\n`;
            fullMarkdown += `**問題**:\n${issue.description}\n\n`;
            fullMarkdown += `**提案**:\n${issue.suggestion}\n\n`;
          }
        }

        // outputディレクトリに保存
        const { dirname, join } = await import('path');
        const { mkdir } = await import('fs/promises');
        const { fileURLToPath } = await import('url');

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const outputDir = join(__dirname, '../output');
        const outputPath = join(outputDir, `pr-${prNumber}-review.md`);

        await mkdir(outputDir, { recursive: true });
        await Bun.write(outputPath, fullMarkdown);

        console.error(`[MCP] Review saved to: ${outputPath}`);

        // バッファをクリア
        reviewIssuesBuffer.length = 0;
        console.error(`[MCP] Review buffer cleared`);

        return {
          content: [
            {
              type: 'text',
              text: `✅ Review saved to file (LOCAL_MODE).\n\nFile: ${outputPath}\n\nTotal issues: ${stats.total_issues}\n- Critical: ${stats.critical}\n- High: ${stats.high}\n- Medium: ${stats.medium}\n- Low: ${stats.low}`
            }
          ]
        };
      } catch (error) {
        console.error('[MCP] Failed to save review to file:', error);
        return {
          content: [
            {
              type: 'text',
              text: `❌ Failed to save review to file: ${error instanceof Error ? error.message : String(error)}`
            }
          ],
          isError: true
        };
      }
    }

    // 通常モード: GitHubに投稿
    // GitHub clients check
    if (!prClient || !octokit) {
      console.error('[MCP] GitHub clients not initialized, skipping GitHub posting');
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ Review result validated but not posted to GitHub (clients not initialized).\n\nTotal issues: ${stats.total_issues}\n- Critical: ${stats.critical}\n- High: ${stats.high}\n- Medium: ${stats.medium}\n- Low: ${stats.low}`
          }
        ]
      };
    }

    if (!headSha) {
      console.error('[MCP] HEAD_SHA not provided, skipping GitHub posting');
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ Review result validated but not posted to GitHub (HEAD_SHA missing).\n\nTotal issues: ${stats.total_issues}`
          }
        ]
      };
    }
    try {
      // 差分ファイルリストを取得
      const { DiffParser } = await import('../lib/parsers.js');
      const diffParser = new DiffParser();
      const diffFiles = diffParser.getModifiedFiles();
      console.error(`[MCP] Diff contains ${diffFiles.length} files`);

      // 1. Post inline comments（差分内のファイル）
      console.error('[MCP] Posting inline comments to GitHub...');
      const { postInlineComments } = await import('../lib/github.js');
      await postInlineComments(prClient, reviewResult, headSha, prNumber, diffFiles);

      // 2. Post out-of-diff comments（差分外のファイル）
      console.error('[MCP] Posting out-of-diff comments to GitHub...');
      const { postOutOfDiffComments } = await import('../lib/github.js');
      await postOutOfDiffComments(prClient, reviewResult, diffFiles, prNumber);

      // 3. Post summary comment
      console.error('[MCP] Posting summary comment to GitHub...');
      const { postReviewSummaryComment } = await import('../lib/github.js');
      const { formatReviewAsMarkdown } = await import('../shared/formatter.js');
      const reviewMarkdown = formatReviewAsMarkdown(reviewResult);
      await postReviewSummaryComment(prClient, prNumber, reviewMarkdown);

      // バッファをクリア
      reviewIssuesBuffer.length = 0;
      console.error(`[MCP] Review buffer cleared`);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Review submitted and posted to GitHub successfully.\n\nTotal issues: ${stats.total_issues}\n- Critical: ${stats.critical}\n- High: ${stats.high}\n- Medium: ${stats.medium}\n- Low: ${stats.low}`
          }
        ]
      };
    } catch (error) {
      console.error('[MCP] Failed to post review to GitHub:', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to post review to GitHub: ${error instanceof Error ? error.message : String(error)}\n\nReview was validated but not posted.`
          }
        ],
        isError: true
      };
    }
  }

  if (name === 'get_comments_for_file') {
    const { file_path } = args as { file_path: string };
    const allComments = commentsByFile.get(file_path) || [];

    // Resolve済みコメントを除外
    const unresolvedComments = allComments.filter(c => !c.is_resolved);

    console.error(`[MCP] get_comments_for_file: ${file_path} - ${allComments.length} total, ${unresolvedComments.length} unresolved`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(unresolvedComments, null, 2)
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

    if (!prClient || !threadResolver) {
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
          await prClient.postReplyComment(
            prNumber,
            comment_id,
            `@${AI_AGENT_MENTION}\n\n⚠️ このファイルはコメント投稿後に変更されていません。\n\n${reasoning}\n\n引き続き対応をお願いします 🙏\n\n_- ${BOT_SIGNATURE}_`
          );
          console.error(`[MCP] Posted warning for comment ${comment_id}`);
          break;

        case 'has_replies':
          // 返信あり → オーナーメンション
          await prClient.postReplyComment(
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
          await prClient.postReplyComment(
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
          await prClient.postReplyComment(
            prNumber,
            comment_id,
            `✅ TODO/コメントで対応計画が記載されました\n\n${reasoning}\n\n対応計画が明確なため、クローズします。\n\n_- ${BOT_SIGNATURE}_`
          );
          console.error(`[MCP] Resolved comment ${comment_id} (todo_added)`);
          break;

        case 'not_resolved':
          // 未解決 → 再コメント
          await prClient.postReplyComment(
            prNumber,
            comment_id,
            `@${AI_AGENT_MENTION}\n\n⚠️ まだ根本的な解決に至っていません\n\n${reasoning}\n\n引き続き対応をお願いします 🙏\n\n_- ${BOT_SIGNATURE}_`
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

  if (name === 'get_unchecked_guideline') {
    console.error('[MCP-ReviewUtil] Processing get_unchecked_guideline...');

    if (!guidelinesData) {
      console.error('[MCP-ReviewUtil] ERROR: guidelinesData is null');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(null)
          }
        ]
      };
    }

    console.error(`[MCP-ReviewUtil] Total guidelines: ${guidelinesData.guidelines.length}`);
    console.error(`[MCP-ReviewUtil] Checked count: ${guidelinesData.guidelines.filter(g => g.checked).length}`);

    // 最初の未チェック観点を取得
    const unchecked = guidelinesData.guidelines.find(g => !g.checked);

    if (!unchecked) {
      console.error('[MCP-ReviewUtil] All guidelines are checked');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(null)
          }
        ]
      };
    }

    console.error(`[MCP-ReviewUtil] Returning unchecked guideline: ID ${unchecked.id}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(unchecked, null, 2)
        }
      ]
    };
  }

  if (name === 'mark_checked') {
    console.error('[MCP-ReviewUtil] Processing mark_checked...');
    const { id } = args as { id: number };
    console.error(`[MCP-ReviewUtil] Marking guideline ID: ${id}`);

    if (!guidelinesData) {
      console.error('[MCP-ReviewUtil] ERROR: guidelinesData is null');
      return {
        content: [
          {
            type: 'text',
            text: '❌ Guidelines data not loaded'
          }
        ],
        isError: true
      };
    }

    // 該当観点を探してcheckedをtrueに
    const guideline = guidelinesData.guidelines.find(g => g.id === id);

    if (!guideline) {
      console.error(`[MCP-ReviewUtil] ERROR: Guideline ID ${id} not found`);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Guideline ID ${id} not found`
          }
        ],
        isError: true
      };
    }

    console.error(`[MCP-ReviewUtil] Found guideline: ${guideline.rule.substring(0, 50)}...`);
    guideline.checked = true;

    // ファイルに保存
    console.error(`[MCP-ReviewUtil] Saving to file: ${guidelinesFilePath}`);
    await saveGuidelines();

    const remaining = guidelinesData.guidelines.filter(g => !g.checked).length;
    console.error(`[MCP-ReviewUtil] Marked guideline ${id} as checked. Remaining: ${remaining}`);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Guideline ${id} marked as checked. Remaining unchecked: ${remaining}`
        }
      ]
    };
  }

  if (name === 'get_all_guidelines') {
    if (!guidelinesData) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ guidelines: [] })
          }
        ]
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(guidelinesData, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Run server
async function main() {
  // Initialize existing comments from JSON file
  await initializeComments();

  // Initialize GitHub clients
  initializeGitHubClients();

  // Initialize guidelines from JSON file
  await initializeGuidelines();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
