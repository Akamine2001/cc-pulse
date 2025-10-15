import { query, tool, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeCodeExecutablePath } from '../utils/paths';
import { IssueResolutionSchema, type IssueResolution, type ReviewIssue } from './schemas';

/**
 * 前回指摘した問題の修正状況をClaude Agent SDKで判定
 */
export class ResolutionChecker {
  private resolutionResult: IssueResolution | null = null;

  /**
   * 修正判定結果を提出するツール
   */
  private createResolutionTool() {
    return tool(
      'submit_resolution',
      'Submit the resolution check result',
      IssueResolutionSchema.shape,
      async (args) => {
        this.resolutionResult = args as IssueResolution;
        return {
          content: [{ type: 'text' as const, text: 'Resolution result submitted successfully' }]
        };
      }
    );
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

    // 結果をリセット
    this.resolutionResult = null;

    const promptText = this.buildPrompt(previousIssue, originalCode, currentCode, projectContext);
    const resolutionTool = this.createResolutionTool();

    console.log(`🔍 Checking resolution for: ${previousIssue.description.substring(0, 50)}...`);

    const stream = query({
      prompt: this.createPromptStream(promptText),
      options: {
        pathToClaudeCodeExecutable: claudeCodePath,
        maxTurns: 5,  // ツール呼び出しを考慮
        allowedTools: [resolutionTool]
      }
    });

    // ストリームを処理（ツールが呼ばれるのを待つ）
    for await (const message of stream) {
      if (message?.type === 'assistant') {
        if (this.resolutionResult) {
          break; // 結果が取得できたら終了
        }
      }
    }

    if (!this.resolutionResult) {
      throw new Error('Failed to get resolution result from Claude (tool was not called)');
    }

    return this.resolutionResult;
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
    **推奨対応**: ${previousIssue.suggestion}`;

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

# 結果の提出方法
判定が完了したら、**必ず submit_resolution ツールを使用して結果を提出してください**。

- status: 判定結果（fixed, todo_added, needs_decision, not_fixed）
- reasoning: 判定理由を1-2文で簡潔に
- code_snippet: 該当部分のコード（証拠）
- owner_mention_needed: needs_decision の場合は true、それ以外は false`;
  }
}
