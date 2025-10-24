# PR Auto-Review Tool

cc-pulse用のGitHub Actions自動PRレビューツール（Phase 2.0）

## 概要

このツールは、GitHub ActionsからClaude Agent SDKを使用してPull Requestを自動レビューします。

### 主な機能

- **AI駆動のコードレビュー**: Claude Agent SDKによる高品質なレビュー
- **前回Conversationの自動追跡**: 差分チェック → 修正状況を自動判定
- **重複指摘の防止**: 既存Conversationを把握して新しい問題のみ指摘
- **レビュー観点のカスタマイズ**: `review-guidelines.md`で編集可能
- **全問題のコメント**: 優先度に関わらず全ての問題をコメント

## アーキテクチャ

機能ベースのシンプルな構造で構成:

```
tools/pr-review/
├── index.ts                          # エントリーポイント
├── review-guidelines.md              # レビュー観点（編集可能）
│
├── core/                             # コア処理
│   ├── orchestrator.ts               # メインフロー制御
│   ├── reviewer.ts                   # レビュー実行（ClaudeAgent使用）
│   └── comment-resolver.ts           # コメント解決（ClaudeAgent使用）
│
├── lib/                              # 補助機能
│   ├── claude.ts                     # Claude Agent SDK wrapper
│   ├── github.ts                     # GitHub API統合
│   ├── files.ts                      # ファイルI/O統合
│   └── parsers.ts                    # パース処理
│
├── mcp/                              # MCPサーバー
│   └── review-util-mcp-server.ts
│
├── prompts/                          # プロンプトテンプレート
│   ├── review-prompt.md
│   └── resolve-comment-prompt.md
│
└── shared/                           # 共通定義
    ├── types.ts                      # 型定義
    ├── schemas.ts                    # Zodスキーマ
    ├── constants.ts
    ├── env.ts
    └── formatter.ts
```

## 使用方法

### GitHub Actionsから実行

`.github/workflows/pr-review.yml`で自動実行されます。

### ローカルでの実行

```bash
# 環境変数を設定
export CLAUDE_CODE_OAUTH_TOKEN="your-token"
export GITHUB_TOKEN="your-github-token"
export PR_NUMBER="123"
export GITHUB_REPOSITORY="owner/repo"
export PR_AUTHOR="username"

# 実行
bun run tools/pr-review/index.ts
# または
bun run review:pr
```

## 環境変数

| 変数名 | 必須 | 説明 |
|-------|------|------|
| `CLAUDE_CODE_OAUTH_TOKEN` | ◯ | Claude Pro/MAX OAuth token |
| `GITHUB_TOKEN` | ◯ | GitHub Personal Access Token |
| `PR_NUMBER` | ◯ | PR番号 |
| `GITHUB_REPOSITORY` | ◯ | リポジトリ（owner/repo形式） |
| `PR_AUTHOR` | △ | PR作成者（メンション用） |

## レビュープロセス（Phase 2.0）

### Phase 1: 前回のConversation処理

前回のレビューコメント（Conversation）を確認し、修正状況を判定します。

#### 処理フロー

```
1. 前回のConversation取得（🤖 Auto-Review マーク付き）
   ↓
2. 各Conversationについて:
   a. ファイル差分チェック（コメント投稿時のコミット 〜 最新）
      ↓
      差分なし？
        Yes → 「修正されていません」とコメント
        No  → 次へ
      ↓
   b. Conversation内の返信チェック（D判定）
      ↓
      返信あり？
        Yes → PRオーナーにメンション、クローズしない
        No  → 次へ
      ↓
   c. Claude AIで差分を分析（A/B/C判定）
      - A: major_change → クローズ
      - B: todo_added → クローズ
      - C: not_resolved → 再コメント（クローズしない）
```

#### 判定基準

| 判定 | 説明 | アクション |
|------|------|-----------|
| **差分なし** | ファイルが変更されていない | ⚠️ 催促コメント |
| **A: major_change** | 実装が大幅に変わっている | ✅ クローズ |
| **B: todo_added** | TODO/コメントで対応計画記載 | ✅ クローズ |
| **C: not_resolved** | 根本的解決でない | ⚠️ 再コメント |
| **D: has_replies** | Conversationへ返信あり（議論継続中） | 💬 オーナーメンション |

### Phase 2: 新規レビュー実施

全ての差分ファイルをレビューします（重複指摘を避ける）。

```
1. PR差分を読み込み
2. レビュー観点を読み込み（review-guidelines.md）
3. 既存Conversationを収集
   ↓
4. Claude AIでレビュー実行
   - 既存Conversationの内容をプロンプトに含める
   - 「以下は既に指摘済みなので、重複を避けてください」
   ↓
5. 新しい問題のみコメント投稿（全ての優先度）
6. サマリーコメント投稿
```

## レビュー観点のカスタマイズ

`review-guidelines.md`を編集することで、レビュー観点を変更できます。

```markdown
# PRレビュー観点

## 1. デグレーション
- 既存機能への悪影響がないか

## 2. パフォーマンス
- 実行速度やメモリ使用量への影響

...（カスタマイズ可能）
```

## 重要な制約

### Claude Agent SDK

- **query()は1回のみ**: 2回呼ぶとエラーになる
- **解決策**: `createPromptStream()`でAsyncIterable化
- **実装場所**: `infrastructure/mcp/mcp-server-factory.ts`

### GitHub API

- **original_commit_id**: コメント投稿時のコミットSHA（不変）
- **commit_id**: 現在のコミットSHA（変わる可能性）
- **差分取得**: `original_commit_id` 〜 最新コミット

### コメント投稿

- **Phase 1.5**: critical/high のみ（最大20件）
- **Phase 2.0**: 全ての優先度をコメント（制限なし）

## 開発

### 新機能追加時の注意

1. **依存関係**: 上位層 → 下位層の一方向のみ
2. **副作用の分離**: ドメイン層は純粋関数を優先
3. **エラーハンドリング**: try-catchは最上位層で
4. **テスタビリティ**: 依存性注入を活用

### ファイルサイズ制約

CLAUDE.mdの規約に従い、各ファイル300行以内を目標とする。

## トラブルシューティング

### "Ran out of executable memory"

- 原因: Claude Agent SDKの`query()`を2回呼んでいる
- 解決: `createPromptStream()`を使用する

### "Failed to get review result from Claude"

- 原因: MCPツールが呼ばれていない
- 解決: プロンプト内のツール名を確認

### "Database file does not exist"

- 原因: `pr-diff.txt`がない
- 解決: GitHub Actionsで`gh pr diff`を実行

## 変更履歴

### Phase 2.0（新仕様）

- ✅ 前回Conversation処理を先に実施（効率化）
- ✅ 重複指摘の防止（既存Conversationを把握）
- ✅ 全問題のコメント（優先度制限を削除）
- ✅ レビュー観点の外部ファイル化
- ✅ 差分ベースの判定（A/B/C/D）

### Phase 1.5（初期版）

- フィルタリングベースの実装
- critical/high のみコメント

## ライセンス

MIT
