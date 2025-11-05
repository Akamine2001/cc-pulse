import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk/sdkTypes';
import { getClaudeCodeExecutablePath } from '../../utils/paths';
import { AgentExecutionError, ClaudeCodeError } from './errors';
import type { NewsAgentConfig, ToolCallbackHandler } from './types';

/**
 * Claude Agent SDKの実行を管理するラッパークラス
 *
 * cc-pulseのニュース収集タスクに特化しており、以下の責務を持つ:
 * - Claude Agent SDKの実行管理とストリーム処理
 * - MCPサーバー設定のSDK形式への変換
 * - ツール使用、テキスト出力、エラー発生時のコールバック実行
 *
 * `tools/shared/claude/agent.ts`の設計を参考にしているが、
 * 実行ロック機構は不要なため省略されている。
 */
export class NewsAgentWrapper {
  private claudeCodePath: string;
  private config: NewsAgentConfig;

  /**
   * NewsAgentWrapperを初期化
   * @param config エージェントの共通設定
   * @throws Error Claude Code CLIが見つからない場合
   */
  constructor(config: NewsAgentConfig = {}) {
    const path = getClaudeCodeExecutablePath();
    if (!path) {
      throw new ClaudeCodeError(
        'Claude Code CLI not found. ' +
        'Please install it or set CLAUDE_PATH environment variable.',
      );
    }
    this.claudeCodePath = path;
    this.config = config;
  }

  /**
   * Claude Agent SDKを実行し、ニュース収集クエリを処理する
   * @param options 実行時オプション（プロンプト、サブエージェント設定、コールバック）
   * @returns 実行結果（stderrログを含む）
   * @throws Error 実行中にエラーが発生した場合
   */
  async execute(options: {
    prompt: string;
    agents?: Record<string, any>;
    onToolUse?: ToolCallbackHandler;
    onText?: (text: string) => void;
  }): Promise<{ stderr: string }> {
    const { prompt, agents, onToolUse, onText } = options;

    let stderrOutput = '';

    try {
      const stream = query({
        prompt,
        options: {
          pathToClaudeCodeExecutable: this.claudeCodePath,
          agents,
          mcpServers: this.config.mcpServers,
          allowedTools: this.config.allowedTools,
          maxTurns: this.config.maxTurns,
          stderr: (data: string) => {
            stderrOutput += data;
          },
        },
      });

      await this.processStreamMessage(stream, { onToolUse, onText });

      return { stderr: stderrOutput };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error during agent execution';
      throw new AgentExecutionError(message, stderrOutput, { originalError: error });
    }
  }

  /**
   * SDKからのストリームメッセージを処理する
   *
   * @param stream SDKから返されたAsyncIterableストリーム
   * @param callbacks 実行時コールバック
   * @private
   */
  private async processStreamMessage(
    stream: AsyncIterable<SDKMessage>,
    callbacks: {
      onToolUse?: ToolCallbackHandler;
      onText?: (text: string) => void;
    },
  ): Promise<void> {
    for await (const message of stream) {
      // `tools/shared/claude/agent.ts` と同じパターンを使用
      if (message?.type === 'assistant' && message.message?.content) {
        // SDKの型 `ContentBlock` は配列なので、ループ処理する
        for (const block of message.message.content) {
          // ツール使用を処理
          if (block.type === 'tool_use' && callbacks.onToolUse) {
            // SDKの `ToolUseBlock` は `id`, `name`, `input` を持つ
            // 型ガードにより `block` は `SDKToolUseBlock` 型に絞り込まれる
            const { name, input, id } = block;
            await callbacks.onToolUse(name, input, id);
          }

          // テキスト出力を処理
          if (block.type === 'text' && callbacks.onText) {
            // SDKの `TextBlock` は `text` プロパティを持つ
            const text = block.text;
            if (text?.trim()) {
              callbacks.onText(text);
            }
          }
        }
      }
    }
  }
}
