/**
 * ClaudeAgent - Claude Agent SDKのラッパークラス
 */

import { query, type Options, type SDKMessage, type McpServerConfig, type PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import { sanitizeSensitiveData } from './sanitize';

/**
 * stdio形式のMCPサーバー設定
 * (後方互換性のため、旧agent.tsと同じ型名でエクスポート)
 */
export interface StdioMcpServer {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Claude APIで利用可能なモデル
 */
export type ClaudeModel =
  // Claude 4 Generation
  | 'claude-sonnet-4-5'
  | 'claude-sonnet-4-5-20250929'
  | 'claude-opus-4-1'
  | 'claude-opus-4-1-20250805'
  | 'claude-opus-4'
  | 'claude-opus-4-20250514'
  | 'claude-haiku-4-5'
  | 'claude-haiku-4-5-20251001'
  // Claude 3.5 Generation
  | 'claude-3-5-sonnet'
  | 'claude-3-5-haiku'
  | 'claude-3-5-haiku-20241022';

export interface ClaudeAgentOptions {
  /** システムプロンプト */
  systemPrompt: string;
  /** 使用するモデル */
  model?: ClaudeModel;
  /** 許可するツールのリスト */
  allowedTools?: string[];
  /** 禁止するツールのリスト */
  disallowedTools?: string[];
  /** MCPサーバーの設定 (stdio/SSE/HTTP/SDK形式をサポート) */
  mcpServers?: Record<string, McpServerConfig>;
  /** 権限モード */
  permissionMode?: PermissionMode;
  /** 作業ディレクトリ */
  cwd?: string;
  /** 最大ターン数 (デフォルト: 100) */
  maxTurns?: number;

  /**
   * Extended Thinking用の最大トークン数
   *
   * 設定すると、Claude 4モデルでExtended Thinkingが有効になります。
   * 推奨値: 10000-20000
   * 最小値: 1024
   *
   * Extended Thinking有効時、onThinkingコールバックで思考過程を取得できます。
   */
  maxThinkingTokens?: number;

  /**
   * ツール呼び出し時のコールバック
   * MCPツールの入力パラメータをキャプチャする際に使用
   *
   * @example
   * ```typescript
   * const agent = new ClaudeAgent({
   *   systemPrompt: "...",
   *   onToolUse: (toolName, input) => {
   *     if (toolName === 'mcp__feature-review__create_review_guidelines') {
   *       capturedGuidelines = input as GuidelinesOutput;
   *     }
   *   }
   * });
   * ```
   */
  onToolUse?: (toolName: string, input: any) => void;

  /**
   * テキスト出力時のコールバック
   * Claudeの通常のテキスト応答（全モデル対応）を受け取る際に使用
   *
   * @example
   * ```typescript
   * const agent = new ClaudeAgent({
   *   systemPrompt: "...",
   *   onText: (text) => {
   *     console.log(`[Response] ${text}`);
   *     uiComponent.appendText(text);  // リアルタイム表示
   *   }
   * });
   * ```
   */
  onText?: (text: string) => void;

  /**
   * 思考過程出力時のコールバック
   * Extended Thinking対応モデル（Claude 4 Opus/Sonnet）使用時に呼ばれます
   *
   * Extended Thinkingを有効にする必要があります。
   * Haikuなどの非対応モデルでは呼ばれません。
   *
   * @example
   * ```typescript
   * const agent = new ClaudeAgent({
   *   systemPrompt: "...",
   *   model: "claude-opus-4",  // Extended Thinking対応
   *   onThinking: (thinking) => {
   *     console.log(`[🧠 Thinking] ${thinking}`);
   *     uiComponent.showThinking(thinking);
   *   }
   * });
   * ```
   */
  onThinking?: (thinking: string) => void;

  /**
   * Claude Code CLIの実行ファイルパス
   *
   * 未指定の場合、SDKが自動検出を試みます（環境変数CLAUDE_PATH、`which claude`、デフォルトパス）。
   *
   * 明示的に指定すると以下のメリットがあります:
   * - 早期エラー検出（コンストラクタ時にCLIの存在を確認）
   * - カスタムインストール場所への対応（Homebrew、企業環境など）
   * - 複数バージョンの使い分け（stable/beta/dev）
   * - CI/CD環境での一時パス対応
   *
   * @example
   * ```typescript
   * import { getClaudeCodeExecutablePath } from '../../../src/utils/paths';
   *
   * const claudePath = getClaudeCodeExecutablePath();
   * if (!claudePath) {
   *   throw new Error('Claude Code CLI not found.');
   * }
   *
   * const agent = new ClaudeAgent({
   *   systemPrompt: "...",
   *   pathToClaudeCodeExecutable: claudePath
   * });
   * ```
   */
  pathToClaudeCodeExecutable?: string;

  /**
   * stderrログのサニタイズを有効化（デフォルト: true）
   *
   * trueの場合、stderrに出力される機密情報（API KEY、トークンなど）を自動的にマスキングします。
   * GitHub Actionsなどのログに機密情報が漏洩するのを防ぎます。
   *
   * falseにすると、サニタイズを無効化してデバッグ時に詳細なログを確認できます。
   */
  sanitizeLogs?: boolean;
}

export interface QueryResponse {
  /** レスポンステキスト */
  text: string;
  /** セッションID */
  sessionId?: string;
  /** 使用統計 */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * ClaudeAgentクラス
 *
 * @example
 * ```typescript
 * const agent = new ClaudeAgent({
 *   systemPrompt: "あなたは親切なアシスタントです",
 *   model: "claude-sonnet-4-5",
 *   allowedTools: ["Read", "Write"]
 * });
 *
 * // 会話1
 * const response1 = await agent.query("こんにちは");
 * console.log(response1.text);
 *
 * // 会話2 (前の会話を覚えている)
 * const response2 = await agent.query("前に何を話しましたか?");
 * console.log(response2.text);
 * ```
 */
export class ClaudeAgent {
  private options: Options;
  private sessionId?: string;
  private onToolUseCallback?: (toolName: string, input: any) => void;
  private onTextCallback?: (text: string) => void;
  private onThinkingCallback?: (thinking: string) => void;
  private sanitizeLogs: boolean;

  constructor(config: ClaudeAgentOptions) {
    this.sanitizeLogs = config.sanitizeLogs ?? true; // デフォルト: サニタイズ有効

    this.options = {
      systemPrompt: config.systemPrompt,
      model: config.model,
      allowedTools: config.allowedTools,
      disallowedTools: config.disallowedTools,
      mcpServers: config.mcpServers,
      permissionMode: config.permissionMode,
      cwd: config.cwd,
      maxTurns: config.maxTurns ?? 100,
      maxThinkingTokens: config.maxThinkingTokens,
      pathToClaudeCodeExecutable: config.pathToClaudeCodeExecutable,
      includePartialMessages: true,
      // stderrコールバック：機密情報をサニタイズして出力
      stderr: (data: string) => {
        const output = this.sanitizeLogs ? sanitizeSensitiveData(data) : data;
        console.error(`[STDERR] ${output}`);
      }
    };

    this.onToolUseCallback = config.onToolUse;
    this.onTextCallback = config.onText;
    this.onThinkingCallback = config.onThinking;
  }

  /**
   * クエリを送信して完全なレスポンスを取得
   *
   * バッチ処理やシンプルなスクリプトに適しています。
   * セッションIDを内部で管理し、会話を継続できます。
   *
   * @param prompt - クエリ内容
   * @returns レスポンス
   */
  async query(prompt: string): Promise<QueryResponse> {
    const options: Options = {
      ...this.options,
      resume: this.sessionId,
    };

    const responseTexts: string[] = [];
    let usage: QueryResponse['usage'];

    try {
      for await (const message of query({ prompt, options })) {
        if (message.type === 'assistant') {
          for (const block of message.message.content) {
            // テキスト出力
            if (block.type === 'text') {
              const textBlock = block as any;
              responseTexts.push(textBlock.text);
              if (this.onTextCallback) {
                this.onTextCallback(textBlock.text);
              }
            }
            // ツール呼び出し検出
            if (block.type === 'tool_use') {
              const toolUse = block as any;
              if (this.onToolUseCallback) {
                this.onToolUseCallback(toolUse.name, toolUse.input);
              }
            }
            // 思考過程検出（Extended Thinking）
            if (block.type === 'thinking') {
              const thinkingBlock = block as any;
              if (this.onThinkingCallback) {
                this.onThinkingCallback(thinkingBlock.thinking);
              }
            }
          }
        } else if (message.type === 'result') {
          this.sessionId = message.session_id;
          usage = {
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
          };
        }
      }

      return {
        text: responseTexts.join(''),
        sessionId: this.sessionId,
        usage,
      };
    } catch (error: any) {
      // エラーメッセージもサニタイズ
      const errorMessage = this.sanitizeLogs
        ? sanitizeSensitiveData(error.message || String(error))
        : error.message || String(error);

      console.error('❌ Claude Agent execution failed');
      console.error('   Error:', errorMessage);
      throw error;
    }
  }

  /**
   * クエリを送信してストリーミングでレスポンスを取得
   *
   * チャットUIやインタラクティブなアプリケーションに適しています。
   * レスポンスが生成されるたびにリアルタイムで受け取れます。
   *
   * @param prompt - クエリ内容
   * @yields レスポンスメッセージ
   */
  async *queryStream(prompt: string): AsyncGenerator<SDKMessage, void, unknown> {
    const options: Options = {
      ...this.options,
      resume: this.sessionId,
    };

    for await (const message of query({ prompt, options })) {
      // コールバック処理
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          // テキスト出力
          if (block.type === 'text') {
            const textBlock = block as any;
            if (this.onTextCallback) {
              this.onTextCallback(textBlock.text);
            }
          }
          // ツール呼び出し検出
          if (block.type === 'tool_use') {
            const toolUse = block as any;
            if (this.onToolUseCallback) {
              this.onToolUseCallback(toolUse.name, toolUse.input);
            }
          }
          // 思考過程検出（Extended Thinking）
          if (block.type === 'thinking') {
            const thinkingBlock = block as any;
            if (this.onThinkingCallback) {
              this.onThinkingCallback(thinkingBlock.thinking);
            }
          }
        }
      }

      // セッションIDを保存
      if (message.type === 'result') {
        this.sessionId = message.session_id;
      }

      yield message;
    }
  }

  /**
   * セッションをリセット
   *
   * 新しい会話を始めたい場合に使用します。
   */
  resetSession(): void {
    this.sessionId = undefined;
  }

  /**
   * 現在のセッションIDを取得
   */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * セッションがアクティブかどうか
   */
  isActiveSession(): boolean {
    return this.sessionId !== undefined;
  }
}
