# PR Auto-Review Tool - Refactoring Plan

**Status**: 設計フェーズ（実装前）
**Target Branch**: `pr-auto-review-p1`
**Date**: 2025-10-23

---

## 目的

現在のPR Auto-Review Toolは3層アーキテクチャ（application/domain/infrastructure）で実装されているが、以下の問題がある：

1. **過剰設計**: 小規模ツールにDDDは不要
2. **層の形骸化**: domainに外部依存が多く、本来のDDD原則に反している
3. **重複コード**: Claude Agent SDKの呼び出しパターンが複数箇所で重複
4. **ナビゲーションコスト**: ディレクトリ階層が深く、関連コードの把握が困難

本リファクタリングでは、**機能ベースのシンプルな構造**に再編成し、保守性と可読性を向上させる。

---

## 現状の構造と問題点

### 現在のディレクトリ構造

```
tools/pr-review/
├── application/
│   └── review-orchestrator.ts        # メインフロー制御
├── domain/
│   ├── reviewer.ts                   # レビュー実行（Claude SDK呼び出し）
│   ├── comment-resolver.ts           # コメント解決（Claude SDK呼び出し）
│   └── conversation-collector.ts     # GitHub API呼び出し
├── infrastructure/
│   ├── github/
│   │   ├── github-client.ts
│   │   ├── comment-poster.ts
│   │   └── thread-resolver.ts
│   ├── mcp/
│   │   └── mcp-server-factory.ts
│   └── file/
│       ├── diff-reader.ts
│       ├── context-reader.ts
│       ├── guidelines-reader.ts
│       ├── prompt-loader.ts
│       └── diff-file-manager.ts
└── ...
```

### 問題点

#### 1. DDDの誤用

- **domain層に外部依存**: `reviewer.ts`や`comment-resolver.ts`がClaude SDKやMCPサーバーを直接呼んでいる
- **application層が薄い**: `review-orchestrator.ts`のみで、単なる「手順書」的なコード
- **本来の役割との乖離**:
  - domain: ビジネスロジック（純粋関数、外部依存なし）← **違反**
  - infrastructure: 外部システム連携 ← **実際はdomainがやっている**

#### 2. 規模とのミスマッチ

- 全体で25ファイル程度の小規模ツール
- 複雑なビジネスロジックがない（判定はClaude任せ）
- DDDの層を分けるメリット < ディレクトリ移動のコスト

#### 3. 重複コード

`reviewer.ts`と`comment-resolver.ts`で以下が重複：
- `getClaudeCodeExecutablePath()`の呼び出し
- MCPサーバー設定（stdio形式）
- `query()`の呼び出しパターン
- ストリーム処理（デバッグログ含む）
- stderrの収集とエラーハンドリング

→ **100行以上の共通コード**が重複

---

## リファクタリング方針

### 原則

1. **DDDを廃止** → 機能ベースのシンプル構成
2. **関連ファイルを統合** → GitHub APIの3クラス → 1ファイル
3. **Claude Agent SDK共通処理を抽出** → `ClaudeAgent`クラス
4. **stdio形式に統一** → SDK MCPサーバーを廃止（既に完了）

---

## 新しいディレクトリ構造（案1：機能ベース）

```
tools/pr-review/
├── index.ts                          # エントリーポイント
├── README.md
├── review-guidelines.md
│
├── core/                             # コア処理
│   ├── orchestrator.ts               # メインフロー（旧: review-orchestrator.ts）
│   ├── reviewer.ts                   # レビュー実行
│   └── comment-resolver.ts           # コメント解決
│
├── lib/                              # 補助機能
│   ├── claude.ts                     # Claude Agent SDK wrapper（新規）
│   ├── github.ts                     # GitHub API統合（client, poster, thread-resolver）
│   ├── files.ts                      # ファイルI/O統合（diff, context, guidelines, prompt）
│   └── parsers.ts                    # パース処理（diff-parser, conversation-collector）
│
├── mcp/                              # MCPサーバー
│   └── review-util-mcp-server.ts
│
├── prompts/                          # プロンプトテンプレート
│   ├── review-prompt.md
│   └── resolve-comment-prompt.md
│
├── shared/                           # 共通定義
│   ├── types.ts                      # 型定義統合
│   ├── schemas.ts                    # Zodスキーマ
│   ├── constants.ts
│   └── env.ts
│
└── docs/                             # ドキュメント
    ├── REFACTORING_PLAN.md           # 本ドキュメント
    └── CLAUDE_AGENT_DESIGN.md        # ClaudeAgentクラス設計（後述）
```

### メリット

- **core/**: 「何をするか」が一目瞭然
- **lib/**: 「どう実現するか」の実装詳細
- **DDD用語を使わない** → 誤解がない
- **ファイル統合** → 関連コードが近くに配置

---

## ClaudeAgentクラスの設計

### コンセプト

Claude Agent SDKの共通処理を抽出し、再利用可能なラッパークラスとして実装する。

### 設計原則

1. **インスタンス化時に設定を固定**
   - モデル、MCPサーバー、allowedTools、maxTurnsなど
   - 以降、`query()`呼び出し時はプロンプトのみ渡す

2. **実行ロック機構（キューイング）**
   - Claude Agent SDKの制約により、並列実行を防ぐ
   - 同じインスタンスで並列`query()`を呼ぶと、自動的にキューイング

3. **柔軟な上書き**
   - 必要に応じて、`query()`実行時に設定を上書き可能

4. **stdio形式のみサポート**
   - SDK MCPサーバーは廃止（`docs/MCP_SERVER_GUIDELINES.md`の推奨に従う）

### クラス構造

```typescript
// lib/claude.ts

export interface StdioMcpServer {
  command: string;        // 'bun', 'python', etc.
  args: string[];         // ['run', 'path/to/server.ts']
  env?: Record<string, string>;
}

export interface ClaudeAgentConfig {
  model?: string;                              // モデル名（オプション）
  mcpServers?: Record<string, StdioMcpServer>; // MCPサーバー
  allowedTools?: string[];                     // 許可ツール
  maxTurns?: number;                           // 最大ターン数（デフォルト: 70）
  onToolUse?: (toolName: string, input: any) => void;
  onText?: (text: string) => void;
}

export interface ClaudeAgentQueryOptions<T> {
  prompt: string;                              // プロンプト（必須）
  extractResult: (message: any) => T | null;   // 結果抽出関数（必須）

  // 実行時上書き可能（オプション）
  mcpServers?: Record<string, StdioMcpServer>;
  allowedTools?: string[];
  maxTurns?: number;
  onToolUse?: (toolName: string, input: any) => void;
  onText?: (text: string) => void;
}

export class ClaudeAgent {
  constructor(config: ClaudeAgentConfig = {});
  async query<T>(options: ClaudeAgentQueryOptions<T>): Promise<ClaudeAgentResult<T>>;
}
```

### 利用例

#### パターン1: コンストラクタで全設定

```typescript
export class PRReviewer {
  private agent: ClaudeAgent;

  constructor(existingCommentsPath: string) {
    this.agent = new ClaudeAgent({
      mcpServers: {
        'review-util': {
          command: 'bun',
          args: ['run', `${__dirname}/../mcp/review-util-mcp-server.ts`],
          env: { EXISTING_COMMENTS_PATH: existingCommentsPath }
        }
      },
      allowedTools: [
        'Read',
        'mcp__review-util__format_review',
        'mcp__review-util__submit_review'
      ],
      maxTurns: 70
    });
  }

  async review(diff: string, context: string, guidelines: string): Promise<ReviewResult> {
    const prompt = this.buildPrompt(diff, context, guidelines);
    let reviewResult: ReviewResult | null = null;

    const { result } = await this.agent.query({
      prompt,
      extractResult: () => reviewResult,
      onToolUse: (name, input) => {
        if (name === 'mcp__review-util__submit_review') {
          reviewResult = input;
        }
      }
    });

    if (!result) throw new Error('Review failed');
    return result;
  }
}
```

#### パターン2: 実行時に上書き

```typescript
export class CommentResolver {
  private agent = new ClaudeAgent({ maxTurns: 50 });

  async resolve(comments: ReviewComment[], env: GitHubEnv): Promise<void> {
    await this.agent.query({
      prompt: this.buildPrompt(comments),
      extractResult: () => null,
      mcpServers: {
        'review-util': {
          command: 'bun',
          args: ['run', 'path/to/server.ts'],
          env: { GITHUB_TOKEN: env.token, ... }
        }
      }
    });
  }
}
```

### 実行ロック機構

```typescript
const agent = new ClaudeAgent({ ... });

// 並列呼び出し → 自動キューイング
const [result1, result2] = await Promise.all([
  agent.query({ prompt: 'Task 1', ... }),  // 先に実行
  agent.query({ prompt: 'Task 2', ... })   // キュー待ち → 1完了後に実行
]);
```

ログ出力：
```
[ClaudeAgent] Another query is running. Waiting in queue...
```

---

## 統合対象ファイル

### `lib/github.ts`（統合）

以下を統合：
- `infrastructure/github/github-client.ts`
- `infrastructure/github/comment-poster.ts`
- `infrastructure/github/thread-resolver.ts`

**理由**: 全てGitHub API操作で、密接に関連している

### `lib/files.ts`（統合）

以下を統合：
- `infrastructure/file/diff-reader.ts`
- `infrastructure/file/context-reader.ts`
- `infrastructure/file/guidelines-reader.ts`
- `infrastructure/file/prompt-loader.ts`
- `infrastructure/file/diff-file-manager.ts`

**理由**: 全てファイルI/O操作で、役割が似ている

### `lib/parsers.ts`（統合）

以下を統合：
- `shared/diff-parser.ts`
- `domain/conversation-collector.ts`

**理由**: パース・変換処理として共通の役割

### `shared/types.ts`（統合）

以下を統合：
- `types/index.ts`
- その他散在する型定義

**理由**: 型定義を一箇所に集約

---

## 移行計画

### Phase 1: 準備

- [ ] `lib/claude.ts`を作成（新規）
- [ ] `lib/claude.ts`の単体テスト作成（モック使用）
- [ ] 既存コードを壊さないことを確認

### Phase 2: 統合

- [ ] `lib/github.ts`を作成（3ファイル統合）
- [ ] `lib/files.ts`を作成（5ファイル統合）
- [ ] `lib/parsers.ts`を作成（2ファイル統合）
- [ ] `shared/types.ts`を作成（型定義統合）

### Phase 3: コア処理移行

- [ ] `core/orchestrator.ts`を作成（`review-orchestrator.ts`移行）
- [ ] `core/reviewer.ts`を`ClaudeAgent`使用に変更
- [ ] `core/comment-resolver.ts`を`ClaudeAgent`使用に変更

### Phase 4: クリーンアップ

- [ ] 旧ディレクトリ削除（`application/`, `domain/`, `infrastructure/`）
- [ ] README.md更新（新構造を反映）
- [ ] ドキュメント更新

### Phase 5: 検証

- [ ] ローカル実行テスト（`local-review.sh`）
- [ ] GitHub Actions動作確認
- [ ] 全機能の動作確認（Phase 1, Phase 2レビュー）

---

## 期待される効果

### 定量的効果

- **ファイル数削減**: 25ファイル → 約15ファイル（40%削減）
- **重複コード削減**: 100行以上の重複を削除
- **ディレクトリ階層**: 4階層 → 2階層

### 定性的効果

- **保守性向上**: 関連コードが近くに配置され、変更が容易
- **可読性向上**: 機能ベースの命名で、役割が明確
- **再利用性向上**: `ClaudeAgent`クラスが他プロジェクトでも使用可能
- **学習コスト削減**: DDD用語を使わないため、新規参加者が理解しやすい

---

## 参考資料

- `docs/MCP_SERVER_GUIDELINES.md` - MCP実装ガイドライン
- `tools/pr-review/README.md` - 現在の仕様
- `CLAUDE.md` - プロジェクト規約

---

## 次のステップ

1. **レビュー**: 本ドキュメントをチームでレビュー
2. **承認**: リファクタリング方針の承認
3. **実装**: Phase 1から順次実施
4. **検証**: 各Phaseごとに動作確認

---

**Note**: 本ドキュメントは設計フェーズであり、実装は未着手です。
