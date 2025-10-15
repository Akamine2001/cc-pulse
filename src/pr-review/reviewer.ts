import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeCodeExecutablePath } from '../utils/paths';
import { ReviewResultSchema, type ReviewResult } from './schemas';

/**
 * PRレビュアークラス
 * Claude Agent SDKを使用してコードレビューを実施
 */
export class PRReviewer {

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

    const promptText = this.buildPrompt(diff, projectContext);

    console.log('🤖 Starting Claude code review with Agent SDK...');

    const stream = query({
      prompt: this.createPromptStream(promptText),
      options: {
        pathToClaudeCodeExecutable: claudeCodePath,
        maxTurns: 1,  // 単発入力を明示
        allowedTools: []  // ツール不要、JSON生成のみ
      }
    });

    // ストリームからレスポンスを収集
    let responseText = '';
    for await (const message of stream) {
      if (message?.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            responseText += (block as any).text;
          }
        }
      }
    }

    // JSONを抽出してパース
    return this.parseReviewResponse(responseText);
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

# 出力形式
以下のJSON形式**のみ**で出力してください（Markdownのコードブロックは不要）：

{
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "category": "デグレーション" | "パフォーマンス" | "セキュリティ" | "コーディング規約" | "型安全性",
      "description": "問題の具体的な説明",
      "file_path": "該当ファイルのパス（オプション）",
      "line_range": { "start": 行番号, "end": 行番号 } (オプション),
      "impact": "影響範囲の説明",
      "suggestion": "推奨される対応方法"
    }
  ],
  "summary": "レビュー全体の総評（3-5文で）",
  "stats": {
    "total_issues": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0
  }
}

**重要**:
- 必ず有効なJSON形式で出力してください
- 問題がない場合は issues を空配列 [] にしてください
- stats の各カウントは issues の内容と一致させてください`;
  }

  /**
   * ClaudeのレスポンスからJSON を抽出してパース
   */
  private parseReviewResponse(responseText: string): ReviewResult {
    // JSONブロックを抽出（```json ... ``` 形式の場合）
    let jsonText = responseText.trim();

    const jsonBlockMatch = responseText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (jsonBlockMatch) {
      jsonText = jsonBlockMatch[1].trim();
    }

    // JSONとして最初に現れる { ... } を抽出
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Claude response');
    }

    try {
      const parsedData = JSON.parse(jsonMatch[0]);

      // Zodでバリデーション
      const validatedResult = ReviewResultSchema.parse(parsedData);

      // statsの整合性チェック（念のため）
      const actualStats = {
        total_issues: validatedResult.issues.length,
        critical: validatedResult.issues.filter(i => i.severity === 'critical').length,
        high: validatedResult.issues.filter(i => i.severity === 'high').length,
        medium: validatedResult.issues.filter(i => i.severity === 'medium').length,
        low: validatedResult.issues.filter(i => i.severity === 'low').length
      };

      // statsを実際の値で上書き
      validatedResult.stats = actualStats;

      return validatedResult;
    } catch (error) {
      console.error('❌ Failed to parse review response:', error);
      console.error('Response text:', responseText);
      throw new Error(`Failed to parse review response: ${error}`);
    }
  }
}
