/**
 * Conversation Diff Analyzer
 *
 * 前回のConversationに対するファイル差分を分析し、A/B/C判定を実施
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeCodeExecutablePath } from '../../../src/utils/paths';
import { z } from 'zod';
import type { ReviewIssue, ConversationCheckResult } from '../types';
import { createPromptStream, createOutputMcpServer } from '../infrastructure/mcp/mcp-server-factory';
import { loadConversationDiffAnalysisPrompt } from '../infrastructure/file/prompt-loader';

const ConversationAnalysisSchema = z.object({
  action: z.enum(['major_change', 'todo_added', 'not_resolved']),
  reasoning: z.string().describe('判定理由（具体的に説明）')
});

type ConversationAnalysis = z.infer<typeof ConversationAnalysisSchema>;

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

    const analysisMcpServer = createOutputMcpServer(
      'conversation-analysis',
      'submit_analysis',
      ConversationAnalysisSchema,
      (data) => {
        this.analysisResult = data;
      }
    );

    console.log(`🔍 Analyzing diff for: ${previousIssue.description.substring(0, 50)}...`);

    let stderrOutput = '';

    const stream = query({
      prompt: createPromptStream(promptText),
      options: {
        pathToClaudeCodeExecutable: claudeCodePath,
        maxTurns: 70,
        mcpServers: {
          'conversation-analysis': analysisMcpServer
        },
        allowedTools: ['mcp__conversation-analysis__submit_analysis'],
        stderr: (data: string) => {
          stderrOutput += data;
          console.error(`[STDERR] ${data}`);
        }
      }
    });

    try {
      for await (const message of stream) {
        if (message?.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              const toolUse = block as any;
              if (toolUse.name === 'mcp__conversation-analysis__submit_analysis') {
                this.analysisResult = toolUse.input as ConversationAnalysis;
                console.log(`[DEBUG] Analysis captured: ${this.analysisResult.action}`);
              }
            }
          }
        }

        if (this.analysisResult) {
          break;
        }
      }
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

    return {
      action: this.analysisResult.action,
      reasoning: this.analysisResult.reasoning,
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
