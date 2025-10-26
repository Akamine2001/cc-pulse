# Feature Reviewer - 自動レビュー・テスト観点生成

## 概要

GitHub Issueが作成された際に自動的に起動し、**レビュー観点**と**テスト観点**を含むサブIssueを生成するシステムです。

## クイックスタート

### GitHub Actionsでの自動実行

Issue作成時に自動的に実行されます。特別な操作は不要です。

1. 新しいIssueを作成
2. GitHub Actionsが自動起動（`.github/workflows/feature-reviewer.yml`）
3. 数分後、サブIssue「[レビュー・テスト観点] 〇〇」が作成されます
4. 親Issueにコメントが投稿されます

### ローカルでの実行（推奨）

Issue番号を指定してローカルで実行できます。

```bash
# 環境変数を設定（.envrcなどで事前設定推奨）
export CLAUDE_CODE_OAUTH_TOKEN="your-token"
export GITHUB_TOKEN="your-github-token"

# Issue番号を指定して実行（mdファイルに保存）
bun run feature-review:local 8
```

**動作（ローカルモード）**:
1. `gh issue view` でIssue情報を取得
2. リポジトリ情報を自動検出（git remote）
3. Feature Reviewerを実行
4. **レビュー・テスト観点をmdファイルに保存** (`tools/feature-reviewer/output/issue-8-guidelines.md`)
5. ログを `tools/feature-reviewer/mcp/log.md` に保存

**要件**:
- GitHub CLI (`gh`) がインストールされていること
- `CLAUDE_CODE_OAUTH_TOKEN` と `GITHUB_TOKEN` が設定されていること

**メリット**:
- ✅ GitHubに余計なIssueを作成しない（テスト時に便利）
- ✅ 生成内容をすぐに確認できる
- ✅ mdファイルとして保存されるので再利用可能

**GitHubに作成したい場合**:
1. コードをPRでマージ
2. Issueを作成（自動実行される）

### 手動実行（環境変数を明示的に設定）

```bash
# 環境変数を手動設定
export CLAUDE_CODE_OAUTH_TOKEN="your-token"
export GITHUB_TOKEN="your-github-token"
export ISSUE_NUMBER="123"
export GITHUB_REPOSITORY="owner/repo"

# 直接実行
bun run tools/feature-reviewer/index.ts
```

## 生成される観点の例

### 親Issue
```markdown
タイトル: WebUIの英語表示を日本語化する

## 日本語化が必要な箇所
### frontend.tsx
**ヘッダー (122行目)**
[ ] "AI-Powered News Aggregator" → "AIニュース収集ツール"
```

### 生成されるサブIssue
```markdown
タイトル: [レビュー・テスト観点] WebUIの英語表示を日本語化する

## 📋 ビジネスルール
該当なし（UI文字列変更のみ）

## 🔍 レビュー観点
### ビジネスルール
特になし

### 実装方針
- [ ] ツールチップの実装方法が既存パターンと一致しているか
  - 参考: frontend.tsx:386-388 の title属性パターン

### 親Issueに書いていない確認観点
- [ ] App.tsx でも同様の英語表示パターンがないか確認
  - 影響範囲: App.tsx:45 で同じヘッダーコンポーネントを使用
  - 理由: 同じUIパターンで表記が統一されていない可能性

## ✅ テスト観点
### 正常系（新規/改修機能）
- [ ] WebUI起動時にヘッダーが「AIニュース収集ツール」と表示される
  - 要件: Issue #2 の122行目

### 正常系（デグレチェック）
- [ ] ニュース取得機能が正常に動作する
  - 影響範囲: frontend.tsx:200-250 のニュース取得ロジック
```

## ファイル構成

```
tools/
├── shared/                         # 共通処理（PR Review & Feature Reviewer）
│   ├── claude/
│   │   └── agent.ts                # Claude Agent SDK wrapper
│   └── github/
│       ├── issue-client.ts         # Issue操作専門
│       ├── pr-client.ts            # PR操作専門
│       └── thread-resolver.ts      # Thread操作専門
│
└── feature-reviewer/
    ├── index.ts                    # エントリーポイント
    ├── README.md                   # このファイル
    ├── local-feature.sh            # ローカル実行スクリプト
    │
    ├── core/                       # コア処理
    │   ├── orchestrator.ts         # メインフロー制御
    │   └── analyzer.ts             # Issue・コード分析
    │
    ├── mcp/                        # MCPサーバー
    │   └── feature-review-mcp-server.ts  # レビュー観点出力MCP
    │
    ├── lib/                        # ユーティリティ
    │   └── markdown-converter.ts   # MCPツール出力 → Markdown変換
    │
    ├── output/                     # ローカルモード出力（gitignore）
    │   ├── .gitignore              # *.mdを除外
    │   └── issue-N-guidelines.md   # 生成されたガイドライン
    │
    ├── templates/                  # テンプレート
    │   ├── sub-issue-template.md   # サブIssueテンプレート
    │   ├── success-comment.md      # 成功時コメント
    │   └── error-comment.md        # エラー時コメント
    │
    ├── prompts/                    # Claude用プロンプト
    │   └── analysis-prompt.md      # 分析プロンプト
    │
    └── shared/                     # Feature Reviewer固有の定義
        ├── types.ts                # 型定義
        └── schemas.ts              # Zodスキーマ
```

## 技術スタック

- **Claude Agent SDK**: Issue分析・観点生成
- **Serena MCP**: コードベース探索（最大7階層まで）
- **Zod**: スキーマバリデーション
- **共通クライアント**: `tools/shared/` のIssueClient, ClaudeAgentを使用
- **Bun**: TypeScript実行環境

### 共通クライアントの使用

Feature Reviewerは `tools/shared/` の共通クライアントを使用しています。

**IssueClient**:
```typescript
import { IssueClient } from '../../shared/github/issue-client';

const issueClient = new IssueClient(octokit, owner, repo);
const issue = await issueClient.getIssue(issueNumber);
const subIssue = await issueClient.createIssue(title, body);
await issueClient.postComment(issueNumber, comment);
```

**ClaudeAgent**:
```typescript
import { ClaudeAgent } from '../../shared/claude/agent';

const agent = new ClaudeAgent({
  mcpServers: {
    'feature-review': { ... },
    'serena': { ... }
  },
  allowedTools: [ ... ],
  maxTurns: 150
});

await agent.query({
  prompt: analysisPrompt,
  onToolUse: (toolName, input) => {
    // MCPツール出力をキャプチャ
  }
});
```

## 動作フロー

```
1. 親Issueを取得（GitHub API）
   ↓
2. Issue内容を解析（Claude AI）
   - 要件を抽出
   - 対象ファイル・行番号を特定
   ↓
3. コード分析（Serena MCP、最大7階層）
   - 対象ファイルを読み込み
   - 間接的な関連ファイルも確認
   - ビジネスルール抽出
   - 類似パターン検索
   ↓
4. レビュー・テスト観点を生成（Claude AI）
   - ビジネスルール
   - レビュー観点（ビジネスルール・実装方針・追加観点）
   - テスト観点（新規機能・デグレ・境界値・異常系）
   ↓
5. サブIssue作成（GitHub API）
   - HTMLコメントブロックで分離
   ↓
6. 親Issueにコメント投稿
   成功: "✅ レビュー・テスト観点を作成しました #XXX"
   失敗: "⚠️ 作成に失敗しました" + エラー内容
```

## 重要な制約

### 階層制限

関連ファイルの追跡は**最大7階層まで**です。

```
階層0: 親Issueで指定されたファイル
階層1: 階層0が直接インポートしているファイル
階層2: 階層1がインポートしているファイル
...
階層7: 階層6がインポートしているファイル（ここで停止）
```

### 推測禁止

すべての記載は以下のいずれかに基づきます：
- ✅ 親Issueに明記されている要件
- ✅ Serena MCPで実際に読み取ったコード
- ✅ ファイルに記載されている具体的な実装

推測での記載は絶対に行いません。

### 観点がない場合

観点が不要な場合でも、サブIssueは作成されます。
該当セクションに「該当なし（理由）」が表示されます。

## 環境変数

| 変数名 | 必須 | 説明 |
|-------|------|------|
| `CLAUDE_CODE_OAUTH_TOKEN` | ◯ | Claude Pro/MAX OAuth token |
| `GITHUB_TOKEN` | ◯ | GitHub Personal Access Token（Issues: write権限） |
| `ISSUE_NUMBER` | ◯ | Issue番号（GitHub Actionsが自動設定） |
| `GITHUB_REPOSITORY` | ◯ | リポジトリ（owner/repo形式、GitHub Actionsが自動設定） |

## 今後の拡張予定

### Phase 2: PR自動レビューとの統合

- サブIssueの`<!-- REVIEW_GUIDELINES_START/END -->`ブロックを自動抽出
- PR自動レビュー時にレビュー観点としてインポート

### Phase 3: テスト自動化

- `<!-- TEST_GUIDELINES_START/END -->`ブロックからテストコード生成

## 関連ドキュメント

- [PR Auto-Review](../pr-review/README.md) - PR自動レビューツール
- [CLAUDE.md](../../CLAUDE.md) - プロジェクトのコーディング規約
