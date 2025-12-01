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
import { ReviewContext } from './context/review-context';
import { guidelinesHandlers } from './handlers/guidelines/index.js';
import { commentsHandlers } from './handlers/comments/index.js';
import type { ToolHandler } from './types.js';

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
import type { ToolResult } from './types';

let context: ReviewContext;

// The MCP SDK does not export the server-side result type, so we define a local one
// that is compatible with our ToolResult
type ServerResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

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

// Register handlers
const handlers = new Map<string, ToolHandler>();

// New modular handlers
for (const handler of [...guidelinesHandlers, ...commentsHandlers]) {
  handlers.set(handler.name, handler);
}
// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const dynamicTools = [...handlers.values()].map(h => ({
    name: h.name,
    description: h.description,
    inputSchema: h.inputSchema,
  }));
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
      ...dynamicTools,
    ] as Tool[]
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Dynamic handler lookup
  const handler = handlers.get(name);
  if (handler) {
    const result: ToolResult = await handler.execute(args, context);
    return result as ServerResult;
  }

  if (name === 'add_review_comment') {
    const issue = ReviewIssueSchema.parse(args);

    // バッファに追加
    context.addReviewIssue(issue);

    console.error(`[MCP] Added review issue to buffer: ${issue.category} (${issue.severity})`);
    console.error(`[MCP] Buffer size: ${context.getReviewIssuesCount()} issues`);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Review issue added to buffer. Total buffered: ${context.getReviewIssuesCount()}`
        }
      ]
    };
  }

  if (name === 'submit_all_reviews') {
    // Zodスキーマでパース
    const input = SubmitAllReviewsInputSchema.parse(args);

    const reviewIssuesBuffer = [...context.getReviewIssuesBuffer()];

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
      reviewIssuesBuffer as ReviewIssue[]
    );

    // Julesセッション情報が見つからなかった場合、サマリーに追記
    if (!context.config.julesSessionFound) {
      summary += '\n\nℹ️ Julesセッション: 見つかりませんでした（julesコメントは送信されません）';
    }

    const reviewResult = {
      issues: reviewIssuesBuffer,
      summary,
      stats
    };

    console.error(`[MCP] Submitting all reviews: ${reviewIssuesBuffer.length} issues`);

    // ローカルモードのチェックを最優先（GitHubクライアント不要）
    if (context.config.isLocalMode) {
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

        // ファイル全体への指摘（差分内だがline_rangeなし）
        const fileWideIssues = reviewResult.issues.filter(
          issue => issue.file_path && !issue.line_range && diffFiles.includes(issue.file_path)
        );

        // 差分外コメント（file_pathあり、diffFilesに含まれない）
        const outOfDiffIssues = reviewResult.issues.filter(
          issue => issue.file_path && !diffFiles.includes(issue.file_path)
        );

        let fullMarkdown = `# PR #${context.config.prNumber} 自動レビュー結果\n\n`;
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

        if (fileWideIssues.length > 0) {
          fullMarkdown += `---\n\n## 📁 ファイル全体への指摘（PRコメント）\n\n`;
          fullMarkdown += `> **GitHub投稿先**: PRの会話タブに通常のコメントとして投稿されます\n\n`;
          fullMarkdown += `以下はファイル全体に対する指摘です（特定の行に限定されません）。\n\n`;

          for (const issue of fileWideIssues) {
            const severityLabel = { critical: '重大', high: '重要', medium: '中程度', low: '軽微' }[issue.severity];

            fullMarkdown += `### ${issue.file_path} (${severityLabel})\n\n`;
            fullMarkdown += `**カテゴリ**: ${issue.category}\n`;
            fullMarkdown += `**問題**:\n${issue.description}\n\n`;
            fullMarkdown += `**提案**:\n${issue.suggestion}\n\n`;
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
        const outputPath = join(outputDir, `pr-${context.config.prNumber}-review.md`);

        await mkdir(outputDir, { recursive: true });
        await Bun.write(outputPath, fullMarkdown);

        console.error(`[MCP] Review saved to: ${outputPath}`);

        // バッファをクリア
        context.clearReviewIssuesBuffer();
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
    const prClient = context.getPRClient();
    const octokit = context.getOctokit();
    const headSha = context.config.headSha;
    const prNumber = context.config.prNumber;

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

      // 2. Post file-wide comments（差分内だが行指定なし）
      console.error('[MCP] Posting file-wide comments to GitHub...');
      const { postFileWideComments } = await import('../lib/github.js');
      await postFileWideComments(prClient, reviewResult, diffFiles, prNumber);

      // 3. Post out-of-diff comments（差分外のファイル）
      console.error('[MCP] Posting out-of-diff comments to GitHub...');
      const { postOutOfDiffComments } = await import('../lib/github.js');
      await postOutOfDiffComments(prClient, reviewResult, diffFiles, prNumber);

      // 4. Post summary comment
      console.error('[MCP] Posting summary comment to GitHub...');
      const { postReviewSummaryComment } = await import('../lib/github.js');
      const { formatReviewAsMarkdown } = await import('../shared/formatter.js');
      const reviewMarkdown = formatReviewAsMarkdown(reviewResult);
      await postReviewSummaryComment(prClient, prNumber, reviewMarkdown);

      // バッファをクリア
      context.clearReviewIssuesBuffer();
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



  throw new Error(`Unknown tool: ${name}`);
});

// Run server
async function main() {
  context = await ReviewContext.create(process.env);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
