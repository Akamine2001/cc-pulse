/**
 * Conversation Diff Analyzer
 *
 * 前回のConversationに対するファイル差分を分析し、A/B/C判定を実施
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeCodeExecutablePath } from '../../../src/utils/paths';

import type { ReviewIssue, ConversationCheckResult } from '../types';
import { createPromptStream } from '../infrastructure/mcp/mcp-server-factory';
import { loadConversationDiffAnalysisPrompt } from '../infrastructure/file/prompt-loader';

type ConversationAnalysis = {
  action: 'major_change' | 'todo_added' | 'not_resolved';
  reasoning: string;
};

/**
 * Conversation差分アナライザー
 */
export class ConversationDiffAnalyzer {
  private analysisResult: ConversationAnalysis | null = null;

  /**
   * ファイル差分を分析して、修正状況を判定
   *
   * @param previousIssue 前回の指摘内容
   * @param fileDiff ファイル差分（コメント投稿時〜最新）
   * @param context プロジェクトコンテキスト
   * @returns 判定結果
   */
  async analyzeDiff(
    previousIssue: ReviewIssue,
    fileDiff: string,
    context: string
  ): Promise<ConversationCheckResult> {
    const claudeCodePath = getClaudeCodeExecutablePath();
    if (!claudeCodePath) {
      throw new Error('Claude Code CLI not found');
    }

    this.analysisResult = null;

    const promptText = this.buildPrompt(previousIssue, fileDiff, context);

    // Conversation analysis is now a simple tool call via stdio
    // (SDK MCP server removed)

    console.log(`🔍 Analyzing diff for: ${previousIssue.description.substring(0, 50)}...`);

    let stderrOutput = '';

    const stream = query({
      prompt: createPromptStream(promptText),
      options: {
        pathToClaudeCodeExecutable: claudeCodePath,
        maxTurns: 70,
        mcpServers: {},
        allowedTools: [],
        stderr: (data: string) => {
          stderrOutput += data;
          console.error(`[STDERR] ${data}`);
        }
      }
    });

    try {
      // TODO: Conversation diff analysis temporarily disabled
      // This feature requires a stdio MCP server implementation
      // For now, default to 'not_resolved'
      this.analysisResult = {
        action: 'not_resolved',
        reasoning: 'Conversation diff analysis is temporarily disabled. All issues are marked as not_resolved pending implementation of stdio MCP server for analysis.'
      };

      // for await (const message of stream) {
      //   // Stream processing disabled
      // }
    } catch (error) {
      console.error('❌ Error during conversation analysis');
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
      }
      if (stderrOutput) {
        console.error(`   Claude Code STDERR:\n${stderrOutput}`);
      }
      throw error;
    }

    if (!this.analysisResult) {
      console.error('[ERROR] Failed to get analysis result from Claude');
      if (stderrOutput) {
        console.error(`[ERROR] Claude Code STDERR output:\n${stderrOutput}`);
      }
      throw new Error('Failed to get analysis result from Claude');
    }

    // TypeScript null check
    const result = this.analysisResult;
    if (!result) {
      throw new Error('Analysis result is null');
    }

    return {
      action: result.action,
      reasoning: result.reasoning,
      fileDiff,
      hasReplies: false // この関数では判定しない（呼び出し側で設定）
    };
  }

  /**
   * 差分分析用のプロンプトを構築
   */
  private buildPrompt(
    previousIssue: ReviewIssue,
    fileDiff: string,
    context: string
  ): string {
    // 外部プロンプトMDファイルから読み込み
    return loadConversationDiffAnalysisPrompt(
      context,
      previousIssue.category,
      previousIssue.severity,
      previousIssue.description,
      previousIssue.suggestion,
      fileDiff
    );
  }
}
