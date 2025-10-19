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
    const promptText = this.buildPrompt(diff, projectContext, reviewGuidelines, existingConversations, commentsForDb);

    // MCP Server - オブジェクトリテラルで直接定義
    const submitReviewTool = tool(
      'submit_review',
      'Submit the review result in structured format with schema validation',
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

        console.log(`✅ [MCP Callback] Review result received: ${args.issues.length} issues`);

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
      tools: [submitReviewTool]
    });

    console.log('🤖 Starting Claude code review with Agent SDK...');

    // stderrを収集
    let stderrOutput = '';

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
        maxTurns: 20,
        mcpServers: {
          'review-output': reviewMcpServer,
          'duplicate-checker': duplicateCheckerServer
        },
        allowedTools: [
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
    try {
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
    }
  }

  /**
   * レビュー用のプロンプトを構築
   */
  private buildPrompt(
    diff: string,
    projectContext: string,
    reviewGuidelines: string,
    existingConversations: string,
    commentsForDb: any[]
  ): string {
    const commentsJson = JSON.stringify(commentsForDb, null, 2);

    return `あなたはcc-pulseプロジェクトのコードレビュアーです。以下のPull Requestの差分をレビューしてください。

# STEP 1: Duplicate Checker DBの初期化（最初に必ず実行）

レビューを開始する前に、**必ず mcp__duplicate-checker__initialize_comments_db ツールを呼び出してください**。

引数:
\`\`\`json
{
  "comments": ${commentsJson}
}
\`\`\`

これにより、既存のレビューコメントがembedding化され、重複チェックが可能になります。

# STEP 2: コードレビュー実施

# プロジェクトコンテキスト
${projectContext}

# PR差分
\`\`\`diff
${diff}
\`\`\`

# レビュー観点
${reviewGuidelines}

${existingConversations}

# 重複チェックの方法

問題を見つけたら、**issuesに追加する前に** mcp__duplicate-checker__check_duplicate_issue ツールで重複チェックしてください。

**使い方**:
\`\`\`
mcp__duplicate-checker__check_duplicate_issue({
  "file_path": "対象ファイルのパス",
  "description": "問題の説明",
  "line": 行番号（optional）
})
\`\`\`

**ツールの返り値**:
- 類似度が高い順に既存の指摘がリストされます
- **類似度 >= 0.8**: ⚠️ 重複の可能性が高い → 慎重に判断してください
- **類似度 < 0.8**: あなた自身で判断してください

**判断基準**:
- 同じ問題だと判断した場合 → issuesに含めない
- 異なる問題だと判断した場合 → issuesに含める

# 結果の提出方法
レビューが完了したら、**必ず mcp__review-output__submit_review ツールを使用して結果を提出してください**。

ツールの引数:
- issues: 検出された問題のリスト（重複チェック済み、問題がない場合は空配列）
- summary: レビュー全体の総評（3-5文で）
- stats: 問題の統計情報（total_issues, critical, high, medium, low）

**重要**:
- stats の各カウントは issues の内容と正確に一致させてください
- 必ずツールを呼び出してください（テキストでの返答は不要です）`;
  }
}
