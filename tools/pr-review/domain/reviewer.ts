/**
 * PRレビュアークラス
 * Claude Agent SDKを使用してコードレビューを実施
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeCodeExecutablePath } from '../../../src/utils/paths';
import { ReviewResultSchema, type ReviewResult } from '../shared/schemas';
import { createPromptStream, createOutputMcpServer } from '../infrastructure/mcp/mcp-server-factory';

export class PRReviewer {
  private reviewResult: ReviewResult | null = null;

  /**
   * PRの差分をレビューして構造化されたレビュー結果を返す
   *
   * @param diff PR差分
   * @param projectContext プロジェクトコンテキスト
   * @param reviewGuidelines レビュー観点
   * @param existingConversations 既存Conversationの内容（重複指摘を避けるため）
   */
  async review(
    diff: string,
    projectContext: string,
    reviewGuidelines: string,
    existingConversations: string
  ): Promise<ReviewResult> {
    const claudeCodePath = getClaudeCodeExecutablePath();
    if (!claudeCodePath) {
      throw new Error(
        'Claude Code CLI not found. Please install it or set CLAUDE_PATH environment variable.\n' +
        'Install: https://docs.claude.com/en/docs/claude-code'
      );
    }

    // レビュー結果をリセット
    this.reviewResult = null;

    const promptText = this.buildPrompt(diff, projectContext, reviewGuidelines, existingConversations);

    // MCP Server Factoryを使用してMCPサーバーを生成
    const reviewMcpServer = createOutputMcpServer(
      'review-output',
      'submit_review',
      ReviewResultSchema,
      (data) => {
        // statsの整合性チェック（念のため）
        const actualStats = {
          total_issues: data.issues.length,
          critical: data.issues.filter(i => i.severity === 'critical').length,
          high: data.issues.filter(i => i.severity === 'high').length,
          medium: data.issues.filter(i => i.severity === 'medium').length,
          low: data.issues.filter(i => i.severity === 'low').length
        };

        this.reviewResult = {
          issues: data.issues,
          summary: data.summary,
          stats: actualStats
        };
      }
    );

    console.log('🤖 Starting Claude code review with Agent SDK...');

    // stderrを収集
    let stderrOutput = '';

    const stream = query({
      prompt: createPromptStream(promptText),
      options: {
        pathToClaudeCodeExecutable: claudeCodePath,
        maxTurns: 20,
        mcpServers: {
          'review-output': reviewMcpServer
        },
        allowedTools: ['mcp__review-output__submit_review'],
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

              if (toolUse.name === 'mcp__review-output__submit_review') {
                const actualStats = {
                  total_issues: toolUse.input.issues.length,
                  critical: toolUse.input.issues.filter((i: any) => i.severity === 'critical').length,
                  high: toolUse.input.issues.filter((i: any) => i.severity === 'high').length,
                  medium: toolUse.input.issues.filter((i: any) => i.severity === 'medium').length,
                  low: toolUse.input.issues.filter((i: any) => i.severity === 'low').length
                };

                this.reviewResult = {
                  issues: toolUse.input.issues,
                  summary: toolUse.input.summary,
                  stats: actualStats
                };

                console.log(`[DEBUG] Review result captured: ${this.reviewResult.issues.length} issues`);
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
    } catch (error) {
      console.error('❌ Error during review stream processing');
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
      }
      if (stderrOutput) {
        console.error(`   Claude Code STDERR:\n${stderrOutput}`);
      }
      throw error;
    }

    if (!this.reviewResult) {
      console.error('[ERROR] Failed to get review result from Claude (tool was not called)');
      if (stderrOutput) {
        console.error(`[ERROR] Claude Code STDERR output:\n${stderrOutput}`);
      }
      throw new Error('Failed to get review result from Claude (tool was not called)');
    }

    return this.reviewResult;
  }

  /**
   * レビュー用のプロンプトを構築
   */
  private buildPrompt(
    diff: string,
    projectContext: string,
    reviewGuidelines: string,
    existingConversations: string
  ): string {
    return `あなたはcc-pulseプロジェクトのコードレビュアーです。以下のPull Requestの差分をレビューしてください。

# プロジェクトコンテキスト
${projectContext}

# PR差分
\`\`\`diff
${diff}
\`\`\`

# レビュー観点
${reviewGuidelines}

${existingConversations}

# 結果の提出方法
レビューが完了したら、**必ず mcp__review-output__submit_review ツールを使用して結果を提出してください**。

ツールの引数:
- issues: 検出された問題のリスト（問題がない場合は空配列）
- summary: レビュー全体の総評（3-5文で）
- stats: 問題の統計情報（total_issues, critical, high, medium, low）

**重要**:
- stats の各カウントは issues の内容と正確に一致させてください
- 必ずツールを呼び出してください（テキストでの返答は不要です）
- 既に指摘済みの問題と重複する指摘は避けてください`;
  }
}
