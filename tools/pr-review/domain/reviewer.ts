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
      // STEP 1: フォーマット検証ツール
      const formatReviewTool = tool(
      'format_review',
      'Format and validate review data before submission. Call this with your review data to validate the format before calling submit_review.',
      {
        issues: z.array(ReviewIssueSchema),
        summary: z.string(),
        stats: ReviewStatsSchema
      },
      async (args) => {
        // Zodバリデーション成功 - ここに到達した時点でスキーマは有効
        console.log(`✅ [format_review] Validated ${args.issues.length} issues`);

        const actualStats = {
          total_issues: args.issues.length,
          critical: args.issues.filter(i => i.severity === 'critical').length,
          high: args.issues.filter(i => i.severity === 'high').length,
          medium: args.issues.filter(i => i.severity === 'medium').length,
          low: args.issues.filter(i => i.severity === 'low').length
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

      console.log('🔧 [DEBUG] Review MCP Server created with tools:', reviewMcpServer);
      console.log('🔧 [DEBUG] Server type:', reviewMcpServer.type);
      console.log('🔧 [DEBUG] Server name:', reviewMcpServer.name);
      console.log('🔧 [DEBUG] Has instance:', !!reviewMcpServer.instance);
      console.log('🔧 [DEBUG] Instance registered tools:', reviewMcpServer.instance?._registeredTools);
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
            // ツール呼び出しログ（全ツール対象）
            if (block.type === 'tool_use') {
              const toolUse = block as any;
              console.log(`[DEBUG] Tool called: ${toolUse.name}`);
              console.log(`[DEBUG] Tool input (full):`, JSON.stringify(toolUse.input, null, 2));

              // review-output系ツールの詳細な型情報
              if (toolUse.name === 'mcp__review-output__format_review' || 
                  toolUse.name === 'mcp__review-output__submit_review') {
                console.log(`[DEBUG] issues type: ${typeof toolUse.input?.issues}`);
                console.log(`[DEBUG] issues is array: ${Array.isArray(toolUse.input?.issues)}`);
                console.log(`[DEBUG] stats type: ${typeof toolUse.input?.stats}`);
                console.log(`[DEBUG] stats is object: ${typeof toolUse.input?.stats === 'object' && !Array.isArray(toolUse.input?.stats)}`);
                
                if (typeof toolUse.input?.issues === 'string') {
                  console.log(`[DEBUG] ⚠️ WARNING: issues is a string, not an array!`);
                }
                if (typeof toolUse.input?.stats === 'string') {
                  console.log(`[DEBUG] ⚠️ WARNING: stats is a string, not an object!`);
                }
              }
            }

            // ツール実行結果ログ（新規追加：エラー確認用）
            if (block.type === 'tool_result') {
              const toolResult = block as any;
              console.log(`[DEBUG] Tool result received`);
              console.log(`[DEBUG] Tool use ID: ${toolResult.tool_use_id}`);
              console.log(`[DEBUG] Is error: ${toolResult.is_error || false}`);
              console.log(`[DEBUG] Result content:`, JSON.stringify(toolResult.content, null, 2));
              
              if (toolResult.is_error) {
                console.log(`[DEBUG] ⚠️ TOOL ERROR DETECTED ⚠️`);
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
