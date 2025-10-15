import { query, tool, createSdkMcpServer, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeCodeExecutablePath } from '../utils/paths';
import {
  ReviewResultSchema,
  type ReviewResult
} from './schemas';

/**
 * PRレビュアークラス
 * Claude Agent SDKを使用してコードレビューを実施
 */
export class PRReviewer {
  private reviewResult: ReviewResult | null = null;

  /**
   * レビュー結果を提出するMCPサーバーを作成
   */
  private createReviewMcpServer() {
    const submitReviewTool = tool(
      'submit_review',
      'Submit the code review results in structured format with schema validation',
      ReviewResultSchema.shape,
      async (args) => {
        // ツールが呼ばれた時点で、スキーマに沿ったデータが保証されている
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
          stats: actualStats  // 実際の値で上書き
        };

        return {
          content: [{
            type: 'text' as const,
            text: `Review submitted successfully. Found ${args.issues.length} issues.`
          }]
        };
      }
    );

    return createSdkMcpServer({
      name: 'review-output',
      version: '1.0.0',
      tools: [submitReviewTool]
    });
  }

  /**
   * 単一プロンプトをAsyncIterableに変換するヘルパー
   */
  private async* createPromptStream(promptText: string): AsyncIterable<SDKUserMessage> {
    yield {
      type: 'user' as const,
      session_id: '',
      message: {
        role: 'user' as const,
        content: promptText
      },
      parent_tool_use_id: null
    };
  }

  /**
   * PRの差分をレビューして構造化されたレビュー結果を返す
   */
  async review(diff: string, projectContext: string): Promise<ReviewResult> {
    const claudeCodePath = getClaudeCodeExecutablePath();
    if (!claudeCodePath) {
      throw new Error(
        'Claude Code CLI not found. Please install it or set CLAUDE_PATH environment variable.\n' +
        'Install: https://docs.claude.com/en/docs/claude-code'
      );
    }

    // レビュー結果をリセット
    this.reviewResult = null;

    const promptText = this.buildPrompt(diff, projectContext);
    const reviewMcpServer = this.createReviewMcpServer();

    console.log('🤖 Starting Claude code review with Agent SDK...');

    const stream = query({
      prompt: this.createPromptStream(promptText),
      options: {
        pathToClaudeCodeExecutable: claudeCodePath,
        maxTurns: 5,  // ツール呼び出しを考慮して複数ターン許可
        mcpServers: {
          'review-output': reviewMcpServer  // MCP Serverとして登録
        },
        allowedTools: ['mcp__review-output__submit_review']  // MCPツール名で指定
      }
    });

    // ストリームを処理（ツールが呼ばれるのを待つ）
    for await (const message of stream) {
      if (message?.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'tool_use') {
            const toolUse = block as any;
            console.log(`[DEBUG] Tool called: ${toolUse.name}`);

            // submit_reviewツールが呼ばれたら、inputから結果を取得
            if (toolUse.name === 'mcp__review-output__submit_review') {
              // ツールのinputがスキーマ検証済みのデータ
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

      // 結果取得完了したらループを抜ける
      if (this.reviewResult) {
        break;
      }
    }

    if (!this.reviewResult) {
      throw new Error('Failed to get review result from Claude (tool was not called)');
    }

    return this.reviewResult;
  }

  /**
   * レビュー用のプロンプトを構築
   */
  private buildPrompt(diff: string, projectContext: string): string {
    return `あなたはcc-pulseプロジェクトのコードレビュアーです。以下のPull Requestの差分をレビューしてください。

# プロジェクトコンテキスト
${projectContext}

# PR差分
\`\`\`diff
${diff}
\`\`\`

# レビュー観点
以下の観点で問題点を指摘してください：
1. **デグレーション**: 既存機能への悪影響
2. **パフォーマンス**: 実行速度やメモリ使用量への影響
3. **セキュリティ**: API KEY漏洩、インジェクション脆弱性など
4. **コーディング規約**: CLAUDE.mdの規約遵守
5. **型安全性**: TypeScriptの型定義の適切性

# 結果の提出方法
レビューが完了したら、**必ず mcp__review-output__submit_review ツールを使用して結果を提出してください**。

ツールの引数:
- issues: 検出された問題のリスト（問題がない場合は空配列）
- summary: レビュー全体の総評（3-5文で）
- stats: 問題の統計情報（total_issues, critical, high, medium, low）

**重要**:
- stats の各カウントは issues の内容と正確に一致させてください
- 必ずツールを呼び出してください（テキストでの返答は不要です）`;
  }
}
