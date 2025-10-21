/**
 * PRレビュアークラス
 * Claude Agent SDKを使用してコードレビューを実施
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeCodeExecutablePath } from '../../../src/utils/paths';
import type { ReviewResult } from '../shared/schemas';
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

      console.log('🤖 Starting Claude code review with Agent SDK...');

      // Review output MCP server (stdio - TypeScript)
      const reviewMcpServer = {
        type: 'stdio' as const,
        command: 'bun',
        args: [
          'run',
          `${__dirname}/../mcp/review-output-server.ts`
        ]
      };

      // Duplicate checker MCP server (stdio - Python)
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
        // 全メッセージタイプをログ出力（デバッグ用）
        console.log(`[DEBUG] ========== Stream Message ==========`);
        console.log(`[DEBUG] Message type: ${message?.type}`);
        console.log(`[DEBUG] Full message:`, JSON.stringify(message, null, 2));
        console.log(`[DEBUG] ====================================`);

        if (message?.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            // ツール呼び出しログ（全ツール対象）
            if (block.type === 'tool_use') {
              const toolUse = block as any;
              console.log(`[DEBUG] Tool called: ${toolUse.name}`);
              console.log(`[DEBUG] Tool input (full):`, JSON.stringify(toolUse.input, null, 2));

              // submit_review が呼ばれたら、引数を直接取得してレビュー結果として保存
              if (toolUse.name === 'mcp__review-output__submit_review') {
                this.reviewResult = toolUse.input;
                console.log(`✅ [submit_review] Review result captured from tool input: ${toolUse.input.issues?.length || 0} issues`);
              }

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
            if ((block as any).type === 'tool_result') {
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
