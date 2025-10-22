# MCP Server Implementation Guidelines

このドキュメントは、cc-pulseプロジェクトでMCPサーバーを実装する際の重要な知見をまとめています。

## 重要な発見：複雑な型定義とAgent SDKの言語統一

### 問題の背景

Claude Agent SDKとMCPサーバーを組み合わせて使用する際、**ネストしたカスタムオブジェクト**を含む複雑な型定義を持つツールで問題が発生することがあります。

### 問題の実例：Pydanticの `$ref` 問題

#### Pydantic（Python）で定義した場合

```python
class ReviewStats(BaseModel):
    total_issues: int
    critical: int
    high: int
    medium: int
    low: int

class FormatReviewInput(BaseModel):
    issues: List[ReviewIssue]
    summary: str
    stats: ReviewStats  # ← ネストしたカスタムモデル
```

**生成されるJSON Schema**：
```json
{
  "properties": {
    "stats": {
      "$ref": "#/$defs/ReviewStats"  // ← 参照形式
    }
  },
  "$defs": {
    "ReviewStats": {
      "type": "object",
      "properties": { ... }
    }
  }
}
```

**問題**：
Claudeが `$ref` を正しく解決できず、`stats` を**JSON文字列**として渡してしまう：

```json
{
  "stats": "{\"total_issues\": 5, \"critical\": 0}"  // ← 文字列！
}
```

結果、Pydanticのバリデーションで失敗します。

---

### 解決策：TypeScript + Zod でインライン展開

#### Zod（TypeScript）で定義した場合

```typescript
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const ReviewStatsSchema = z.object({
  total_issues: z.number(),
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number()
});

const FormatReviewInputSchema = z.object({
  issues: z.array(ReviewIssueSchema),
  summary: z.string(),
  stats: ReviewStatsSchema
});

// JSON Schemaに変換（$refを使わない）
const jsonSchema = zodToJsonSchema(FormatReviewInputSchema, {
  $refStrategy: 'none'  // ← これが重要！
});
```

**生成されるJSON Schema**：
```json
{
  "properties": {
    "stats": {
      "type": "object",  // ← 直接定義！$refなし
      "properties": {
        "total_issues": {"type": "number"},
        "critical": {"type": "number"},
        "high": {"type": "number"},
        "medium": {"type": "number"},
        "low": {"type": "number"}
      },
      "required": ["total_issues", "critical", "high", "medium", "low"]
    }
  }
}
```

**結果**：
Claudeが `stats` を**オブジェクト**として正しく渡せる：

```json
{
  "stats": {
    "total_issues": 5,
    "critical": 0,
    "high": 0,
    "medium": 3,
    "low": 2
  }
}
```

---

## ガイドライン1：Agent SDKとMCPサーバーの言語統一

### 原則

**複雑な型定義（ネストしたカスタムオブジェクト）を持つMCPツールを実装する場合**：

```
Claude Agent SDK（TypeScript）を使用
→ MCPサーバーもTypeScriptで実装
→ Zodで型定義 + `$refStrategy: 'none'`

Python Agent SDKを使用
→ MCPサーバーもPythonで実装（推測）
```

### 実装例：TypeScript stdio MCPサーバー

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'my_tool',
        description: 'Tool with complex nested objects',
        inputSchema: zodToJsonSchema(MyInputSchema, {
          $refStrategy: 'none'  // ← 必須
        })
      }
    ]
  };
});
```

---

## ガイドライン2：pathToClaudeCodeExecutable と MCPサーバータイプ

### 重要な制約

| MCPサーバータイプ | pathToClaudeCodeExecutable | 動作 | 理由 |
|-----------------|---------------------------|------|------|
| **SDK MCPサーバー** | あり | ❌ 失敗 | 別プロセスから親プロセスのインスタンスにアクセス不可 |
| **SDK MCPサーバー** | なし | ⚠️ 制限あり | ファイルアクセス権限が厳しい |
| **stdio MCPサーバー** | あり | ✅ 正常 | 別プロセスとして独立動作 |
| **stdio MCPサーバー** | なし | ⚠️ 制限あり | ファイルアクセス権限が厳しい |

### 原則

```
pathToClaudeCodeExecutableを使用する場合（推奨）
→ stdio MCPサーバーのみ使用可能
→ SDK MCPサーバーは併用不可
```

**理由**：
- `pathToClaudeCodeExecutable` は Claude Code CLI を別プロセスとして起動
- SDK MCPサーバーは同じプロセス内で動作するインスタンス
- 別プロセスから親プロセス内のインスタンスにアクセスできない
- "Stream closed" エラーが発生

### pathToClaudeCodeExecutableを使うメリット

- ✅ Claude Code CLI のセキュリティ機能（ファイルアクセス制御）
- ✅ 安定した動作
- ✅ Read/Write/Bashなどの組み込みツールが使える

**推奨**: 本番環境では pathToClaudeCodeExecutable を使用し、stdio MCPサーバーで実装する

---

## cc-pulseでの実装パターン

### ニュース収集システム（src/core/agent.ts）

```typescript
const stream = query({
  options: {
    pathToClaudeCodeExecutable: claudeCodePath,
    mcpServers: {
      'output': createOutputToolsServer(),  // SDK MCP（動作するが非推奨）
      'embedding': createEmbeddingMcpServer()  // Python stdio（推奨）
    }
  }
});
```

**注意**: `output` はSDK MCPサーバーですが、将来的にはstdio化を推奨

### PRレビューツール（tools/pr-review/domain/reviewer.ts）

```typescript
const stream = query({
  options: {
    pathToClaudeCodeExecutable: claudeCodePath,
    mcpServers: {
      'review-output': {  // TypeScript stdio ✅
        type: 'stdio' as const,
        command: 'bun',
        args: ['run', `${__dirname}/../mcp/review-output-server.ts`]
      },
      'duplicate-checker': createDuplicateCheckerMcpServer()  // Python stdio ✅
    }
  }
});
```

**実装ファイル**：
- `tools/pr-review/mcp/review-output-server.ts` - TypeScript stdio（Zod + `$refStrategy: 'none'`）
- `tools/pr-review/mcp/duplicate-checker-server.py` - Python stdio（embedding使用のため）

---

## ベストプラクティス

### 1. 型定義の複雑さによる選択

| 型の種類 | Python Pydantic | TypeScript Zod | 推奨 |
|---------|----------------|---------------|------|
| 単純型（str, int, float） | ✅ 動作 | ✅ 動作 | どちらでも可 |
| 配列（`List[Dict[str, Any]]`） | ✅ 動作 | ✅ 動作 | どちらでも可 |
| ネストしたカスタムオブジェクト | ❌ `$ref`問題 | ✅ インライン展開 | **TypeScript推奨** |

### 2. MCPサーバー選択フローチャート

```
pathToClaudeCodeExecutableを使う？
├─ Yes → stdio MCPサーバーを使用
│         ├─ 複雑な型定義あり？
│         │   ├─ Yes → TypeScript stdio（Zod + $refStrategy: 'none'）
│         │   └─ No → Python/TypeScript どちらでも可
│         └─ Embedding/ML処理が必要？
│             ├─ Yes → Python stdio
│             └─ No → TypeScript stdio
└─ No → SDK MCPサーバー可能
        └─ ただしファイルアクセス権限に注意
```

### 3. 実装チェックリスト

- [ ] pathToClaudeCodeExecutable を使用する場合、stdio MCPサーバーで実装
- [ ] 複雑な型定義がある場合、TypeScript + Zod + `$refStrategy: 'none'`
- [ ] Embedding/ML処理が必要な場合、Python stdio（別言語のライブラリ呼び出し）
- [ ] ツール呼び出しの引数をストリームから取得（`toolUse.input`）
- [ ] MCPサーバーのバリデーションエラーはClaudeに返される（プロンプトで対処方法を指示）

---

## トラブルシューティング

### "Stream closed" エラーが発生する

**原因**: SDK MCPサーバーを pathToClaudeCodeExecutable と併用している

**解決**: stdio MCPサーバーに変更

### stats/オブジェクトがJSON文字列になる

**原因**: Pydanticの `$ref` をClaudeが解決できない

**解決**: TypeScript + Zod + `$refStrategy: 'none'` を使用

### "No such tool available" エラー

**原因**: SDK MCPサーバーがClaude Code CLIに認識されていない

**解決**: stdio MCPサーバーに変更

---

## 参考資料

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Zod to JSON Schema](https://github.com/StefanTerdell/zod-to-json-schema)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)
