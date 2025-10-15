import { query } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeCodeExecutablePath } from '../utils/paths';
import { IssueResolutionSchema, type IssueResolution, type ReviewIssue } from './schemas';

/**
 * 前回指摘した問題の修正状況をClaude Agent SDKで判定
 */
export class ResolutionChecker {
  /**
   * 前回の問題が解決されたか判定
   */
  async checkResolution(
    previousIssue: ReviewIssue,
    originalCode: string | null,
    currentCode: string,
    projectContext: string
  ): Promise<IssueResolution> {
    const claudeCodePath = getClaudeCodeExecutablePath();
    if (!claudeCodePath) {
      throw new Error('Claude Code CLI not found');
    }

    const prompt = this.buildPrompt(previousIssue, originalCode, currentCode, projectContext);

    console.log(`🔍 Checking resolution for: ${previousIssue.description.substring(0, 50)}...`);

    const stream = query({
      prompt,
      options: {
        pathToClaudeCodeExecutable: claudeCodePath,
        allowedTools: []
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

    return this.parseResolution(responseText);
  }

  /**
   * 修正判定用のプロンプトを構築
   */
  private buildPrompt(
    previousIssue: ReviewIssue,
    originalCode: string | null,
    currentCode: string,
    projectContext: string
  ): string {
    let prompt = `あなたは前回指摘したレビュー問題が解決されたか判定するレビュアーです。

# プロジェクトコンテキスト
${projectContext}

# 前回の指摘
**カテゴリ**: ${previousIssue.category}
**重要度**: ${previousIssue.severity}
**説明**: ${previousIssue.description}
**影響**: ${previousIssue.impact}
**推奨対応**: ${previousIssue.suggestion}

`;

    // 元のコードがある場合は含める
    if (originalCode) {
      prompt += `# 前回指摘した時のコード
\`\`\`
${originalCode}
\`\`\`

`;
    }

    prompt += `# 現在のコード（該当箇所）
\`\`\`
${currentCode}
\`\`\`

${originalCode ? '上記の「前回指摘した時のコード」と「現在のコード」を比較して、問題が修正されたか判定してください。' : ''}

# 判定基準
以下のいずれかに該当するか判定してください：

1. **fixed**: 問題が完全に修正されている
   - 推奨対応が実施されている
   - または同等の解決策が実装されている

2. **todo_added**: 問題は残っているが、TODOコメントとして記録されている
   - 例: // TODO: セキュリティ対策を追加
   - 例: // FIXME: パフォーマンス改善が必要

3. **needs_decision**: 修正方針についての質問・相談コメントがある
   - 例: // どちらの実装が良いか相談したい
   - 例: // この対応で良いか確認してください
   - この場合、owner_mention_neededをtrueにしてください

4. **not_fixed**: 上記に該当せず、問題が未解決

# 出力形式（JSON）
以下のJSON形式**のみ**で出力してください：

{
  "status": "fixed" | "todo_added" | "needs_decision" | "not_fixed",
  "reasoning": "判定理由を1-2文で簡潔に",
  "code_snippet": "該当部分のコード（証拠）",
  "owner_mention_needed": true/false
}

**重要**: 必ず有効なJSON形式で出力してください`;
  }

  /**
   * Claudeのレスポンスから判定結果を抽出してパース
   */
  private parseResolution(responseText: string): IssueResolution {
    // JSONブロックを抽出（```json ... ``` 形式の場合）
    let jsonText = responseText.trim();

    const jsonBlockMatch = responseText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (jsonBlockMatch) {
      jsonText = jsonBlockMatch[1].trim();
    }

    // JSONとして最初に現れる { ... } を抽出
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from resolution check response');
    }

    try {
      const parsedData = JSON.parse(jsonMatch[0]);

      // Zodでバリデーション
      const validatedResult = IssueResolutionSchema.parse(parsedData);

      return validatedResult;
    } catch (error) {
      console.error('❌ Failed to parse resolution response:', error);
      console.error('Response text:', responseText);
      throw new Error(`Failed to parse resolution response: ${error}`);
    }
  }
}
