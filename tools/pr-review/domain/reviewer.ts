/**
 * PRレビュアークラス
 * Claude Agent SDKを使用してコードレビューを実施
 */

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { getClaudeCodeExecutablePath } from '../../../src/utils/paths';
import { ReviewIssueSchema, ReviewStatsSchema, type ReviewResult } from '../shared/schemas';
import { createPromptStream } from '../infrastructure/mcp/mcp-server-factory';
import { createDuplicateCheckerMcpServer } from '../infrastructure/mcp/duplicate-checker-mcp';
import { loadReviewPrompt } from '../infrastructure/file/prompt-loader';
import { saveDiffByFiles, deleteTempDiffFiles, type FileDiff } from '../infrastructure/file/diff-file-manager';

export class PRReviewer {
  private reviewResult: ReviewResult | null = null;

  /**
   * PRの差分をレビューして構造化されたレビュー結果を返す
   *
   * @param diff PR差分
   * @param projectContext プロジェクトコンテキスト
   * @param reviewGuidelines レビュー観点
   * @param existingConversations 既存Conversationの内容（重複指摘を避けるため）
   * @param commentsForDb Duplicate Checker DB初期化用のコメントリスト
   */
  async review(
    diff: string,
    projectContext: string,
    reviewGuidelines: string,
    existingConversations: string,
    commentsForDb: any[]
  ): Promise<ReviewResult> {
    // 差分をファイル単位で分割して一時ファイルに保存
    const fileDiffs = saveDiffByFiles(diff);

    // stderrを収集（catchブロックからもアクセスできるようにtryの外で宣言）
    let stderrOutput = '';

    try {
      // プロンプトを生成（ファイル単位の差分リストを渡す）
      const promptText = this.buildPrompt(fileDiffs, projectContext, reviewGuidelines, existingConversations, commentsForDb);

      // MCP Server - 2段階検証方式
      // STEP 1: フォーマット検証ツール（エラー非送出型）
      const formatReviewTool = tool(
      'format_review',
      'Format and validate review data before submission. Use this to prepare your review in the correct structure. If validation fails, this tool will return error messages to help you fix the format.',
      {
        issues: z.any(),  // 緩いスキーマで受け入れ、内部で検証
        summary: z.any(),
        stats: z.any()
      },
      async (args) => {
        console.log(`📝 [format_review] Validating review data...`);

        try {
          // 手動バリデーション
          const errors: string[] = [];

          // issuesのバリデーション
          if (!Array.isArray(args.issues)) {
            errors.push(`❌ "issues" must be an array, not a ${typeof args.issues}. Do NOT pass JSON string - pass the array object directly.`);
          } else {
            // 各issueの検証
            const issueSchema = z.array(ReviewIssueSchema);
            const issuesResult = issueSchema.safeParse(args.issues);
            if (!issuesResult.success && 'error' in issuesResult) {
              errors.push(`❌ "issues" array contains invalid items:\n${issuesResult.error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`);
            }
          }

          // summaryのバリデーション
          if (typeof args.summary !== 'string') {
            errors.push(`❌ "summary" must be a string, not a ${typeof args.summary}.`);
          }

          // statsのバリデーション
          if (typeof args.stats !== 'object' || args.stats === null) {
            errors.push(`❌ "stats" must be an object, not a ${typeof args.stats}. Do NOT pass JSON string - pass the object directly.`);
          } else {
            const statsResult = ReviewStatsSchema.safeParse(args.stats);
            if (!statsResult.success && 'error' in statsResult) {
              errors.push(`❌ "stats" object is invalid:\n${statsResult.error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`);
            }
          }

          // エラーがある場合はフィードバックを返す
          if (errors.length > 0) {
            console.warn(`⚠️ [format_review] Validation failed with ${errors.length} errors`);
            return {
              content: [{
                type: 'text' as const,
                text: `❌ Format validation failed. Please fix the following errors and retry:

${errors.join('\n\n')}

Expected format:
{
  "issues": [
    {
      "severity": "high" | "medium" | "low" | "critical",
      "category": "string",
      "description": "string",
      "file_path": "string",
      "line_range": { "start": number, "end": number },
      "impact": "string",
      "suggestion": "string"
    }
  ],
  "summary": "string",
  "stats": {
    "total_issues": number,
    "critical": number,
    "high": number,
    "medium": number,
    "low": number
  }
}

Please retry format_review with the corrected data.`
              }]
            };
          }

          // バリデーション成功 - statsの整合性チェック
          console.log(`✅ [format_review] Validated ${args.issues.length} issues`);

          const actualStats = {
            total_issues: args.issues.length,
            critical: args.issues.filter((i: any) => i.severity === 'critical').length,
            high: args.issues.filter((i: any) => i.severity === 'high').length,
            medium: args.issues.filter((i: any) => i.severity === 'medium').length,
            low: args.issues.filter((i: any) => i.severity === 'low').length
          };

          // statsが一致しているか確認
          const statsMatch =
            actualStats.total_issues === args.stats.total_issues &&
            actualStats.critical === args.stats.critical &&
            actualStats.high === args.stats.high &&
            actualStats.medium === args.stats.medium &&
            actualStats.low === args.stats.low;

          if (!statsMatch) {
            console.warn(`⚠️ [format_review] Stats mismatch detected, using actual counts`);
          }

          const validatedData = {
            issues: args.issues,
            summary: args.summary,
            stats: actualStats
          };

          return {
            content: [{
              type: 'text' as const,
              text: `✅ Review data validated successfully!

Formatted review (${args.issues.length} issues):
${JSON.stringify(validatedData, null, 2)}

✅ Validation passed! Now call submit_review with this exact data.`
            }]
          };

        } catch (error: any) {
          console.error(`❌ [format_review] Unexpected error:`, error);
          return {
            content: [{
              type: 'text' as const,
              text: `❌ Unexpected error during validation: ${error.message}

Please check your input format and retry.`
            }]
          };
        }
      }
    );

    // STEP 2: 最終提出ツール
      const submitReviewTool = tool(
      'submit_review',
      'Submit the final review result. ONLY call this after format_review succeeds.',
      {
        issues: z.array(ReviewIssueSchema),
        summary: z.string(),
        stats: ReviewStatsSchema
      },
      async (args) => {
        // statsの整合性チェック（念のため）
        const actualStats = {
          total_issues: args.issues.length,
          critical: args.issues.filter(i => i.severity === 'critical').length,
          high: args.issues.filter(i => i.severity === 'high').length,
          medium: args.issues.filter(i => i.severity === 'medium').length,
          low: args.issues.filter(i => i.severity === 'low').length
        };

        this.reviewResult = {
          issues: args.issues,
          summary: args.summary,
          stats: actualStats
        };

        console.log(`✅ [submit_review] Review result received: ${args.issues.length} issues`);

        return {
          content: [{
            type: 'text' as const,
            text: 'Review result submitted successfully.'
          }]
        };
      }
    );

      const reviewMcpServer = createSdkMcpServer({
      name: 'review-output',
      version: '1.0.0',
      tools: [formatReviewTool, submitReviewTool]
      });

      console.log('🤖 Starting Claude code review with Agent SDK...');

    // Duplicate checker MCP server
      const duplicateCheckerServer = createDuplicateCheckerMcpServer();

      const claudeCodePath = getClaudeCodeExecutablePath();
      if (!claudeCodePath) {
        throw new Error('Claude Code CLI not found. Please install it or set CLAUDE_PATH environment variable.');
      }

      const stream = query({
      prompt: createPromptStream(promptText),
      options: {
        pathToClaudeCodeExecutable: claudeCodePath,
        maxTurns: 70,
        mcpServers: {
          'review-output': reviewMcpServer,
          'duplicate-checker': duplicateCheckerServer
        },
        allowedTools: [
          'Read',  // 差分ファイル読み込み用
          'mcp__review-output__format_review',
          'mcp__review-output__submit_review',
          'mcp__duplicate-checker__check_duplicate_issue',
          'mcp__duplicate-checker__initialize_comments_db'
        ],
        stderr: (data: string) => {
          stderrOutput += data;
          console.error(`[STDERR] ${data}`);
        }
      }
      });

      // ストリームを処理
      for await (const message of stream) {
        if (message?.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              const toolUse = block as any;
              console.log(`[DEBUG] Tool called: ${toolUse.name}`);

              // submit_reviewの生データをログ出力（デバッグ用）
              if (toolUse.name === 'mcp__review-output__submit_review') {
                console.log(`[DEBUG] submit_review raw input:`, JSON.stringify(toolUse.input, null, 2));
                console.log(`[DEBUG] issues type: ${typeof toolUse.input?.issues}`);
                console.log(`[DEBUG] issues value:`, toolUse.input?.issues);
              }
            }

            if (block.type === 'text') {
              const text = (block as any).text;
              if (text && text.trim()) {
                console.log(`[DEBUG] Text: ${text.substring(0, 200)}`);
              }
            }
          }
        }

        if (this.reviewResult) {
          break;
        }
      }

      if (!this.reviewResult) {
        throw new Error(
          'Review failed: submit_review tool was not called by Claude.\n' +
          `STDERR Output:\n${stderrOutput}`
        );
      }

      return this.reviewResult;

    } catch (error: any) {
      console.error('❌ Error during review stream processing');
      console.error('   Error:', error.message);
      console.error('   Stack:', error.stack);
      console.error('   Claude Code STDERR:');
      console.error(stderrOutput);
      throw error;
    } finally {
      // 一時ファイルをクリーンアップ
      deleteTempDiffFiles(fileDiffs);
    }
  }

  /**
   * レビュー用のプロンプトを構築
   */
  private buildPrompt(
    fileDiffs: FileDiff[],
    projectContext: string,
    reviewGuidelines: string,
    existingConversations: string,
    commentsForDb: any[]
  ): string {
    const commentsJson = JSON.stringify(commentsForDb, null, 2);

    // 外部プロンプトMDファイルから読み込み（差分はファイルリストで指定）
    return loadReviewPrompt(fileDiffs, projectContext, reviewGuidelines, existingConversations, commentsJson);
  }
}
