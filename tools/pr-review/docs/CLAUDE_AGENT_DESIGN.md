# ClaudeAgent Class - Detailed Design

**Purpose**: Claude Agent SDKの共通処理を抽出し、再利用可能なラッパークラスとして実装

**Location**: `tools/pr-review/lib/claude.ts`

---

## Overview

### 背景

現在、`reviewer.ts`と`comment-resolver.ts`で以下の処理が重複している：

1. `getClaudeCodeExecutablePath()`の取得
2. MCPサーバー設定（stdio形式）
3. `query()`の呼び出しパターン
4. ストリーム処理（ツール呼び出し、テキスト出力のログ）
5. stderrの収集とエラーハンドリング

これらを共通化し、`ClaudeAgent`クラスとして抽出する。

### 設計方針

1. **インスタンス化時に共通設定を保持**
   - モデル名、MCPサーバー、allowedTools、maxTurnsなど
   - 以降、`query()`呼び出し時はプロンプトのみ渡す

2. **実行ロック機構（キューイング）**
   - Claude Agent SDKの制約により、同一インスタンスでの並列実行を防ぐ
   - 並列呼び出しは自動的にキューイングされ、順次実行される

3. **stdio形式のみサポート**
   - SDK MCPサーバーは非推奨（`docs/MCP_SERVER_GUIDELINES.md`参照）
   - pathToClaudeCodeExecutableと併用する場合、stdio形式必須

---

## API Design

### Type Definitions

```typescript
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
  extractResult: (message: any) => T | null;   // 結果抽出関数（必須）

  // 以下は実行時に上書き可能（オプション）
  mcpServers?: Record<string, StdioMcpServer>;
  allowedTools?: string[];
  maxTurns?: number;
  onToolUse?: (toolName: string, input: any) => void;
  onText?: (text: string) => void;
}

/**
 * query()実行結果
 */
export interface ClaudeAgentResult<T> {
  result: T | null;      // 抽出された結果（nullの場合は失敗）
  stderrOutput: string;  // stderrログ
}
```

### Class Definition

```typescript
/**
 * Claude Agent SDK wrapper class
 *
 * 実行ロック機構により、同時に1つのquery()のみ実行可能
 */
export class ClaudeAgent {
  /**
   * ClaudeAgentを初期化
   *
   * @param config 共通設定（全query()で使用）
   * @throws Error Claude Code CLIが見つからない場合
   *
   * @example
   * const agent = new ClaudeAgent({
   *   mcpServers: {
   *     'review-util': {
   *       command: 'bun',
   *       args: ['run', 'path/to/server.ts'],
   *       env: { KEY: 'value' }
   *     }
   *   },
   *   allowedTools: ['Read', 'mcp__review-util__submit_review'],
   *   maxTurns: 50,
   *   onToolUse: (name, input) => console.log(`Tool: ${name}`)
   * });
   */
  constructor(config: ClaudeAgentConfig = {});

  /**
   * Claude Agentを実行
   *
   * コンストラクタで指定した設定を使用
   * 実行時に一部オプションを上書き可能
   *
   * 同一インスタンスで並列呼び出しした場合、自動的にキューイングされる
   *
   * @param options プロンプトと結果抽出関数（必須）+ 上書き設定（オプション）
   * @returns 実行結果
   *
   * @example
   * const result = await agent.query({
   *   prompt: 'Review this code...',
   *   extractResult: (msg) => extractReviewResult(msg),
   *   onToolUse: (name, input) => {
   *     if (name === 'submit_review') {
   *       reviewResult = input;
   *     }
   *   }
   * });
   */
  async query<T = any>(options: ClaudeAgentQueryOptions<T>): Promise<ClaudeAgentResult<T>>;
}
```

---

## Implementation Details

### 実行ロック機構

```typescript
private isExecuting = false;                    // 実行中フラグ
private executionQueue: Array<() => void> = []; // 待機キュー

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
```

### 設定のマージ

コンストラクタの設定と実行時オプションをマージ（実行時優先）：

```typescript
const mergedMcpServers = { ...this.config.mcpServers, ...options.mcpServers };
const mergedAllowedTools = options.allowedTools ?? this.config.allowedTools;
const mergedMaxTurns = options.maxTurns ?? this.config.maxTurns ?? 70;
const mergedOnToolUse = options.onToolUse ?? this.config.onToolUse;
const mergedOnText = options.onText ?? this.config.onText;
```

### ストリーム処理

```typescript
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

  // 結果抽出（ユーザー定義の関数）
  const result = options.extractResult(message);
  if (result !== null) {
    extractedResult = result;
    break;  // 結果が取得できたら終了
  }
}
```

### デバッグログ

環境変数で制御：

```typescript
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
```

---

## Usage Examples

### Example 1: 基本的な使い方

```typescript
const agent = new ClaudeAgent({
  mcpServers: {
    'review-util': {
      command: 'bun',
      args: ['run', 'path/to/server.ts'],
      env: { COMMENTS_PATH: '/tmp/comments.json' }
    }
  },
  allowedTools: [
    'Read',
    'mcp__review-util__submit_review'
  ],
  maxTurns: 70
});

const result = await agent.query({
  prompt: 'Review this PR...',
  extractResult: (message) => {
    // submit_reviewツールが呼ばれた時の引数を抽出
    if (message?.type === 'assistant') {
      for (const block of message.message?.content || []) {
        if (block.type === 'tool_use' &&
            block.name === 'mcp__review-util__submit_review') {
          return block.input;
        }
      }
    }
    return null;
  }
});

console.log(`Review result:`, result.result);
```

### Example 2: コールバックで結果取得

```typescript
let reviewResult: ReviewResult | null = null;

const agent = new ClaudeAgent({
  mcpServers: { ... },
  allowedTools: [ ... ],
  onToolUse: (toolName, input) => {
    if (toolName === 'mcp__review-util__submit_review') {
      reviewResult = input;
      console.log(`Captured: ${input.issues.length} issues`);
    }
  }
});

await agent.query({
  prompt: 'Review this PR...',
  extractResult: () => reviewResult  // コールバックで設定された値を返す
});
```

### Example 3: 実行時に設定上書き

```typescript
const agent = new ClaudeAgent({
  maxTurns: 50,
  allowedTools: ['Read']
});

// 実行時にMCPサーバーと追加ツールを指定
await agent.query({
  prompt: 'Resolve comments...',
  extractResult: () => null,
  mcpServers: {
    'review-util': {
      command: 'bun',
      args: ['run', 'path/to/server.ts'],
      env: {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        PR_NUMBER: '123'
      }
    }
  },
  allowedTools: [
    'Read',
    'mcp__review-util__update_conversation'
  ]
});
```

### Example 4: 複数回query()呼び出し

```typescript
const agent = new ClaudeAgent({ ... });

// Phase 1: コメント解決
await agent.query({
  prompt: 'Resolve previous comments...',
  extractResult: () => null
});

// Phase 2: 新規レビュー（同じ設定を再利用）
const result = await agent.query({
  prompt: 'Review this PR...',
  extractResult: (msg) => extractReviewResult(msg)
});
```

### Example 5: 並列呼び出し（自動キューイング）

```typescript
const agent = new ClaudeAgent({ ... });

// 並列呼び出し → 自動的に順次実行される
const [result1, result2] = await Promise.all([
  agent.query({ prompt: 'Task 1', ... }),  // 先に実行
  agent.query({ prompt: 'Task 2', ... })   // キュー待ち → Task 1完了後に実行
]);
```

ログ出力：
```
[Tool] mcp__review-util__submit_review
✅ Captured: 5 issues
[ClaudeAgent] Another query is running. Waiting in queue...
[Tool] mcp__review-util__update_conversation
```

---

## Error Handling

### Claude Code CLI not found

```typescript
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
```

### Stream processing errors

```typescript
try {
  return await this.executeQuery(options);
} catch (error: any) {
  console.error('❌ Claude Agent execution failed');
  console.error('   Error:', error.message);
  console.error('   Stack:', error.stack);
  console.error('   STDERR:', stderrOutput);
  throw error;
}
```

### Result extraction failure

```typescript
if (!result) {
  throw new Error(
    'Query failed: extractResult did not return a value.\n' +
    `STDERR: ${stderrOutput}`
  );
}
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('ClaudeAgent', () => {
  it('should initialize with config', () => {
    const agent = new ClaudeAgent({
      maxTurns: 50,
      allowedTools: ['Read']
    });
    expect(agent).toBeDefined();
  });

  it('should throw if Claude Code CLI not found', () => {
    // Mock getClaudeCodeExecutablePath to return null
    expect(() => new ClaudeAgent()).toThrow('Claude Code CLI not found');
  });

  it('should queue concurrent queries', async () => {
    const agent = new ClaudeAgent({ ... });

    // Mock sdkQuery
    const mockQuery = jest.fn();

    const [result1, result2] = await Promise.all([
      agent.query({ prompt: 'Task 1', ... }),
      agent.query({ prompt: 'Task 2', ... })
    ]);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    // 順次実行されることを確認
  });
});
```

### Integration Tests

```typescript
describe('ClaudeAgent Integration', () => {
  it('should execute review with real MCP server', async () => {
    const agent = new ClaudeAgent({
      mcpServers: {
        'review-util': {
          command: 'bun',
          args: ['run', 'path/to/server.ts']
        }
      }
    });

    const result = await agent.query({
      prompt: 'Review this code...',
      extractResult: (msg) => extractResult(msg)
    });

    expect(result.result).toBeDefined();
  });
});
```

---

## Performance Considerations

### Memory

- **ストリームバッファリング**: 必要最小限のメッセージのみ保持
- **stderrログ**: 文字列連結のみ（大量出力時は要注意）

### Execution Time

- **キューイング**: 並列呼び出し時も順次実行されるため、実行時間は加算される
- **早期終了**: `extractResult`でnull以外を返すと即座に終了

---

## Environment Variables

| 変数名 | 説明 | デフォルト |
|-------|------|-----------|
| `DEBUG_STREAM` | ストリームメッセージの詳細ログ出力 | `false` |
| `DEBUG_TOOL_INPUT` | ツール入力の詳細ログ出力 | `false` |
| `CLAUDE_PATH` | Claude Code CLIのパス | 自動検出 |

---

## Migration Guide

### Before (現在のコード)

```typescript
const claudeCodePath = getClaudeCodeExecutablePath();
if (!claudeCodePath) {
  throw new Error('Claude Code CLI not found');
}

let stderrOutput = '';
const reviewMcpServer = {
  type: 'stdio' as const,
  command: 'bun',
  args: ['run', 'path/to/server.ts'],
  env: { KEY: 'value' }
};

const stream = query({
  prompt: createPromptStream(promptText),
  options: {
    pathToClaudeCodeExecutable: claudeCodePath,
    maxTurns: 70,
    mcpServers: { 'review-util': reviewMcpServer },
    allowedTools: ['Read', 'mcp__review-util__submit_review'],
    stderr: (data: string) => {
      stderrOutput += data;
      console.error(`[STDERR] ${data}`);
    }
  }
});

for await (const message of stream) {
  // ... 100行以上の処理 ...
}
```

### After (ClaudeAgent使用)

```typescript
const agent = new ClaudeAgent({
  mcpServers: {
    'review-util': {
      command: 'bun',
      args: ['run', 'path/to/server.ts'],
      env: { KEY: 'value' }
    }
  },
  allowedTools: ['Read', 'mcp__review-util__submit_review'],
  maxTurns: 70
});

const { result, stderrOutput } = await agent.query({
  prompt: promptText,
  extractResult: (msg) => extractResult(msg)
});
```

**削減コード**: 約100行 → 10行

---

## Future Enhancements

### 1. タイムアウト機能

```typescript
export interface ClaudeAgentConfig {
  timeout?: number;  // タイムアウト（ミリ秒）
}
```

### 2. リトライ機能

```typescript
export interface ClaudeAgentQueryOptions<T> {
  retryCount?: number;     // リトライ回数
  retryDelay?: number;     // リトライ間隔（ミリ秒）
}
```

### 3. プログレスコールバック

```typescript
export interface ClaudeAgentConfig {
  onProgress?: (turn: number, maxTurns: number) => void;
}
```

---

## References

- [Claude Agent SDK Documentation](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- `docs/MCP_SERVER_GUIDELINES.md` - MCP実装ガイドライン
- `tools/pr-review/docs/REFACTORING_PLAN.md` - リファクタリング計画

---

**Note**: 本ドキュメントは設計フェーズであり、実装は未着手です。
