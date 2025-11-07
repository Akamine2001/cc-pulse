/**
 * Claude Agent SDK wrapper class
 *
 * Claude Agent SDKの共通処理を抽出し、再利用可能なラッパークラスとして実装
 */

import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeCodeExecutablePath } from '../../../src/utils/paths';
import { sanitizeSensitiveData } from './sanitize';

/**
 * stdio形式のMCPサーバー設定
 */
export interface StdioMcpServer {
  command: string;                // コマンド（'bun', 'python', etc.）
  args: string[];                 // 引数（['run', 'path/to/server.ts']）
  env?: Record<string, string>;   // 環境変数（オプション）
}

/**
 * ClaudeAgent初期化設定（コンストラクタで指定）
 */
export interface ClaudeAgentConfig {
  model?: string;                              // モデル名（オプション、未指定時はSDK規定値）
  mcpServers?: Record<string, StdioMcpServer>; // MCPサーバー設定
  allowedTools?: string[];                     // 許可ツールリスト
  maxTurns?: number;                           // 最大ターン数（デフォルト: 70）

  // コールバック（全query()で共通）
  onToolUse?: (toolName: string, input: any) => void;
  onText?: (text: string) => void;
}

/**
 * query()実行時のオプション
 */
export interface ClaudeAgentQueryOptions<T = any> {
  prompt: string;                              // プロンプト（必須）

  // 以下は実行時に上書き可能（オプション）
  mcpServers?: Record<string, StdioMcpServer>;
  allowedTools?: string[];
  maxTurns?: number;

  /**
   * ツール呼び出し時のコールバック（レガシー）
   *
   * TODO: より拡張性の高いハンドラーパターンに置き換える
   * 以下のような設計を検討：
   *
   * 案1: ハンドラーマップ
   * toolHandlers?: Record<string, (input: any) => void>
   *
   * 案2: デコレーターパターン
   * toolHandlers?: ToolHandlerRegistry
   *
   * 案3: クラスベース
   * toolHandlers?: ToolHandlerClass
   *
   * 自動生成との互換性も考慮すること
   */
  onToolUse?: (toolName: string, input: any) => void;
  onText?: (text: string) => void;
}

/**
 * query()実行結果
 */
export interface ClaudeAgentResult {
  stderrOutput: string;  // stderrログ
}

/**
 * Claude Agent SDK wrapper class
 *
 * 実行ロック機構により、同時に1つのquery()のみ実行可能
 */
export class ClaudeAgent {
  private claudeCodePath: string;
  private config: ClaudeAgentConfig;
  private isExecuting = false;
  private executionQueue: Array<() => void> = [];

  /**
   * ClaudeAgentを初期化
   *
   * @param config 共通設定（全query()で使用）
   * @throws Error Claude Code CLIが見つからない場合
   */
  constructor(config: ClaudeAgentConfig = {}) {
    const path = getClaudeCodeExecutablePath();
    if (!path) {
      throw new Error(
        'Claude Code CLI not found. ' +
        'Please install it or set CLAUDE_PATH environment variable.'
      );
    }
    this.claudeCodePath = path;
    this.config = config;
  }

  /**
   * Claude Agentを実行
   *
   * コンストラクタで指定した設定を使用
   * 実行時に一部オプションを上書き可能
   *
   * 同一インスタンスで並列呼び出しした場合、自動的にキューイングされる
   *
   * @param options プロンプトと上書き設定（オプション）
   * @returns 実行結果
   */
  async query(options: ClaudeAgentQueryOptions): Promise<ClaudeAgentResult> {
    // 実行ロックを取得
    await this.acquireLock();

    try {
      return await this.executeQuery(options);
    } finally {
      // 実行ロックを解放
      this.releaseLock();
    }
  }

  /**
   * 実行ロックを取得
   * 既に実行中の場合、キューに追加して待機
   */
  private async acquireLock(): Promise<void> {
    if (!this.isExecuting) {
      this.isExecuting = true;
      return;
    }

    console.log('[ClaudeAgent] Another query is running. Waiting in queue...');
    await new Promise<void>((resolve) => {
      this.executionQueue.push(resolve);
    });
  }

  /**
   * 実行ロックを解放
   * キューに待機中のquery()があれば実行
   */
  private releaseLock(): void {
    const nextInQueue = this.executionQueue.shift();
    if (nextInQueue) {
      nextInQueue();  // 次のquery()を実行
    } else {
      this.isExecuting = false;  // キューが空ならロック解放
    }
  }

  /**
   * クエリを実行（内部実装）
   */
  private async executeQuery(options: ClaudeAgentQueryOptions): Promise<ClaudeAgentResult> {
    // 設定のマージ（実行時優先）
    const mergedMcpServers = { ...this.config.mcpServers, ...options.mcpServers };
    const mergedAllowedTools = options.allowedTools ?? this.config.allowedTools;
    const mergedMaxTurns = options.maxTurns ?? this.config.maxTurns ?? 70;
    const mergedOnToolUse = options.onToolUse ?? this.config.onToolUse;
    const mergedOnText = options.onText ?? this.config.onText;

    // MCPサーバー設定をSDK形式に変換
    const sdkMcpServers: Record<string, any> = {};
    for (const [name, server] of Object.entries(mergedMcpServers)) {
      sdkMcpServers[name] = {
        type: 'stdio' as const,
        command: server.command,
        args: server.args,
        env: server.env
      };
    }

    // stderrを収集
    let stderrOutput = '';

    try {
      const stream = query({
        prompt: this.createPromptStream(options.prompt),
        options: {
          pathToClaudeCodeExecutable: this.claudeCodePath,
          maxTurns: mergedMaxTurns,
          mcpServers: sdkMcpServers,
          allowedTools: mergedAllowedTools,
          stderr: (data: string) => {
            stderrOutput += data;
            console.error(`[STDERR] ${sanitizeSensitiveData(data)}`);
          }
        }
      });

      // ストリームを処理（最後まで実行）
      for await (const message of stream) {
        this.logStreamMessage(message);

        if (message?.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            // ツール呼び出し
            if (block.type === 'tool_use') {
              const toolUse = block as any;
              console.log(`[Tool] ${toolUse.name}`);

              if (process.env.DEBUG_TOOL_INPUT === 'true') {
                console.log(`[Input]`, JSON.stringify(toolUse.input, null, 2));
              }

              if (mergedOnToolUse) {
                mergedOnToolUse(toolUse.name, toolUse.input);
              }
            }

            // テキスト出力
            if (block.type === 'text') {
              const text = (block as any).text;
              if (text?.trim()) {
                console.log(`[Text] ${text.substring(0, 200)}`);

                if (mergedOnText) {
                  mergedOnText(text);
                }
              }
            }
          }
        }

        if (message?.type === 'user' && message.message?.content && Array.isArray(message.message.content)) {
          for (const block of message.message.content) {
            if (block.type === 'tool_result') {
              const toolResult = block as any;

              if (process.env.DEBUG_TOOL_INPUT === 'true') {
                console.log(`[Tool Result] (tool_use_id: ${toolResult.tool_use_id})`);
                console.log(JSON.stringify(toolResult.content, null, 2));

                if (toolResult.isError) {
                  console.error(`[Tool Error] Tool execution failed`);
                }
              }
            }
          }
        }
      }

      // 正常終了（最後まで実行完了）
      return {
        stderrOutput
      };

    } catch (error: any) {
      console.error('❌ Claude Agent execution failed');
      console.error('   Error:', sanitizeSensitiveData(error.message));
      console.error('   Stack:', sanitizeSensitiveData(error.stack));
      console.error('   STDERR:', sanitizeSensitiveData(stderrOutput));
      throw error;
    }
  }

  /**
   * プロンプトストリームを生成
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
   * ストリームメッセージのデバッグログ
   */
  private logStreamMessage(message: any) {
    if (process.env.DEBUG_STREAM === 'true') {
      console.log(`[DEBUG] ========== Stream Message ==========`);
      console.log(`[DEBUG] Type: ${message?.type}`);
      console.log(`[DEBUG] Full:`, JSON.stringify(message, null, 2));
      console.log(`[DEBUG] ====================================`);
    }
  }
}
