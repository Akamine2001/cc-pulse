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
        maxTurns: 20,
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
    return `あなたはcc-pulseプロジェクトのコードレビュアーです。前回のレビューコメントに対するファイル変更を分析してください。

# プロジェクトコンテキスト
${context}

# 前回の指摘内容
- **カテゴリ**: ${previousIssue.category}
- **重要度**: ${previousIssue.severity}
- **説明**: ${previousIssue.description}
- **推奨対応**: ${previousIssue.suggestion}

# コメント投稿後のファイル差分
\`\`\`diff
${fileDiff}
\`\`\`

# 判定基準

以下の3つのうち、いずれかを選択してください：

## A. major_change（大幅に実装が変わっている）
- ファイル全体が書き直されている
- クラス・関数の構造が大きく変わった
- 前回の指摘箇所が存在しない（削除された）
- **判定**: 前回の指摘は古くなったのでクローズ

## B. todo_added（TODO/コメントで対応計画記載）
- コード内にTODOコメントが追加されている
- Conversationへの返信で対応計画が説明されている
- 「次のPRで対応」などの記載がある
- **判定**: 対応計画が明確なのでクローズ

## C. not_resolved（根本的解決でない）
- 差分はあるが、前回の指摘は解決していない
- 部分的な修正で根本的な問題が残っている
- 別の問題が発生している
- **判定**: 再度コメントして対応を促す

# 結果の提出方法

分析が完了したら、**必ず mcp__conversation-analysis__submit_analysis ツールを使用して結果を提出してください**。

ツールの引数:
- action: 上記3つ（major_change, todo_added, not_resolved）から選択
- reasoning: 判定理由（具体的に説明、差分の内容を引用）

**重要**: 必ずツールを呼び出してください（テキストでの返答は不要です）`;
  }
}
