# cc-pulse - プロジェクト規約

## プロジェクト概要

macOS向け自動ニュース収集CLIツール。Claude Agent SDKを統合し、AIによる記事収集・要約・分類を行う。

**主な機能**:
- キーワードベースのニュース自動収集
- Claude AIによる記事要約・分類
- WebUIでの記事閲覧・フィードバック
- launchdによる定期実行スケジューラー
- SQLiteによる記事データ管理
- **PR自動レビュー**: GitHub ActionsによるAIコードレビュー
- **Feature Reviewer**: Issue作成時のレビュー観点自動生成

## 技術スタック

- **ランタイム**: Bun v1.2.0+
- **言語**: TypeScript 5+
- **AI**: Claude Agent SDK (@anthropic-ai/claude-agent-sdk)
- **コードベース解析**: Serena MCP (LSPベースのセマンティック解析)
- **WebUI**: React 19 + Tailwind CSS
- **データベース**: SQLite (bun:sqlite)
- **Python環境**: uv (MCPサーバー管理用)
- **プラットフォーム**: macOS (launchd対応)
- **CI/CD**: GitHub Actions

## コーディング規約

### TypeScript

- **型定義は必須**: `any`の使用は最小限に抑える
- **Zodバリデーション**: APIリクエスト・外部データは必ずZodで検証
- **JSDocコメント**: 公開関数には必ずJSDocを記載
- **エラーハンドリング**: try-catch + 適切なエラーメッセージ

### スタイル

- **インデント**: 2スペース
- **セミコロン**: 使用する
- **命名規則**:
  - 変数・関数: `camelCase`
  - ファイル名: `kebab-case.ts`
  - 定数: `UPPER_SNAKE_CASE`
  - 型・インターフェース: `PascalCase`

### ファイル構成

- 1ファイル300行を目安に分割
- 責務ごとにディレクトリを分離
- 共通ロジックは `src/utils/` へ

## PRレビュー基準

### AIによるコードレビュー

このプロジェクトではClaude Agent SDKとSerena MCPを使用した自動コードレビューを実施しています。

**Serena MCPの活用**:
- **セマンティックコード解析**: LSP（Language Server Protocol）ベースでコードを構造的に理解
- **ファイル読み込み**: `mcp__serena__read_file` でプロジェクトファイルを正確に読み込み
- **シンボル検索**: `mcp__serena__find_symbol` で関数・クラス定義を特定
- **参照解析**: `mcp__serena__find_referencing_symbols` で影響範囲を追跡
- **コード編集**: `mcp__serena__replace_symbol_body` などで必要に応じて修正提案
- **パターン検索**: `mcp__serena__search_for_pattern` で類似コードを発見

Serenaのツールを活用することで、単なるテキストベースの差分解析を超えた、深いコードベース理解に基づくレビューが可能です。

### 必須チェック項目

- [ ] TypeScriptの型エラーがない（`bun run lint`）
- [ ] テストが通る（`bun test`）
- [ ] ビルドが成功する（`bun run build:arm64`）
- [ ] コミットメッセージが明確で、変更内容を説明している

### コード品質

- [ ] 変数名・関数名が意図を明確に表している
- [ ] 複雑な処理にはコメントで意図を説明
- [ ] マジックナンバーを避け、定数化している
- [ ] 重複コードがない（DRY原則）
- [ ] エラーハンドリングが適切に実装されている

### セキュリティ

- [ ] API KEYやトークンがハードコードされていない
- [ ] 環境変数（`CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY`）経由で取得
- [ ] ユーザー入力を適切にバリデーション（Zod使用）
- [ ] SQLインジェクション対策（prepared statement使用）
- [ ] ファイルパスの検証（パストラバーサル対策）

### パフォーマンス

- [ ] 不要なファイルI/O・ネットワーク呼び出しがない
- [ ] データベースクエリが最適化されている（N+1問題など）
- [ ] 大きなファイルは適切にストリーム処理

### ドキュメント

- [ ] README.mdの更新（新機能・破壊的変更がある場合）
- [ ] コマンドのヘルプメッセージが正確
- [ ] 設定ファイルのスキーマ変更時はマイグレーション対応

## テスト方針

### テスト範囲

- **ユニットテスト**: `src/utils/` の純粋関数
- **統合テスト**: コマンド実行の動作確認
- **E2Eテスト**: ビルド後のバイナリ動作確認

### テストコマンド

```bash
# ユニットテスト実行
bun test

# 型チェック
bun run lint
```

### モック戦略

- Claude API呼び出しはモック推奨
- ファイルシステム操作は一時ディレクトリ使用
- 時刻依存処理は注入可能に設計

## アーキテクチャ

### ディレクトリ構造

```
cc-pulse/
├── src/
│   ├── cli.ts              # CLIエントリーポイント (Commander.js)
│   ├── commands/           # サブコマンド実装
│   │   ├── config.ts       # 設定管理コマンド
│   │   ├── fetch.ts        # ニュース収集実行
│   │   ├── schedule.ts     # スケジューラー設定
│   │   ├── serve.ts        # WebUIサーバー
│   │   ├── setup.ts        # 初期セットアップ
│   │   ├── status.ts       # ステータス表示
│   │   └── uninstall.ts    # アンインストール
│   ├── constants/          # 定数定義
│   │   └── agent-names.ts  # Agentの名称定義
│   ├── core/               # コアロジック
│   │   ├── agent.ts        # Claude Agent統合（エントリーポイント）
│   │   ├── agent/          # Agent実装詳細
│   │   │   ├── index.ts    # エクスポート
│   │   │   ├── errors.ts   # カスタムエラー定義
│   │   │   ├── types.ts    # 型定義
│   │   │   ├── NewsOrchestrator.ts    # 複数Agent統合管理
│   │   │   ├── NewsAgentWrapper.ts    # Agent共通ラッパー
│   │   │   ├── NewsResultBuilder.ts   # 結果構築
│   │   │   └── ResultCaptor.ts        # 結果キャプチャ
│   │   ├── config.ts       # 設定管理
│   │   ├── embedding-mcp-server.ts    # Embedding MCP連携
│   │   ├── notification.ts # macOS通知
│   │   ├── output-tools-server.ts     # Output Tools MCP
│   │   ├── prompts/        # Agentプロンプト定義
│   │   │   ├── index.ts    # エクスポート
│   │   │   ├── types.ts    # プロンプト型定義
│   │   │   ├── master.ts   # マスターAgent
│   │   │   ├── news-collector.ts      # 収集Agent
│   │   │   ├── aggregator.ts          # 集約Agent
│   │   │   ├── duplicate-checker.ts   # 重複チェックAgent
│   │   │   └── translator.ts          # 翻訳Agent
│   │   └── scheduler.ts    # launchd連携
│   ├── schemas/            # Zodスキーマ
│   │   ├── language-codes.ts # 言語コード定義
│   │   └── news-schemas.ts   # ニュースデータ型
│   ├── templates/          # WebUI
│   │   ├── index.html      # Reactアプリエントリー
│   │   ├── frontend.tsx    # Reactコンポーネント
│   │   ├── styles.css      # Tailwind CSS (入力)
│   │   └── styles.built.css # ビルド済みCSS
│   └── utils/              # ユーティリティ
│       ├── CCPulseDatetime.ts # 日時処理
│       ├── logger.ts       # ロギング
│       └── paths.ts        # パス管理
├── tools/                  # CI/CD・レビューツール
│   ├── pr-review/          # PRレビューシステム
│   │   ├── index.ts        # エントリーポイント
│   │   ├── core/           # コアロジック
│   │   │   ├── orchestrator.ts        # レビューオーケストレータ
│   │   │   ├── reviewer.ts            # コードレビュー実行
│   │   │   ├── comment-resolver.ts    # コメント解決
│   │   │   └── jules-comment-handler.ts # Jules連携
│   │   ├── lib/            # ユーティリティ
│   │   │   ├── files.ts    # ファイル操作
│   │   │   ├── github.ts   # GitHub API
│   │   │   ├── guidelines-parser.ts   # ガイドライン解析
│   │   │   └── parsers.ts  # パーサー
│   │   ├── mcp/            # MCPサーバー
│   │   │   └── review-util-mcp-server.ts
│   │   ├── shared/         # 共通定義
│   │   │   ├── env.ts      # 環境変数
│   │   │   ├── formatter.ts # フォーマッタ
│   │   │   ├── guidelines-types.ts    # ガイドライン型
│   │   │   ├── schemas.ts  # Zodスキーマ
│   │   │   └── types.ts    # 型定義
│   │   └── send-jules-comments.ts     # Jules通知
│   ├── feature-reviewer/   # Feature Reviewerシステム
│   │   ├── index.ts        # エントリーポイント
│   │   ├── core/           # コアロジック
│   │   │   ├── analyzer.ts # Issue分析
│   │   │   ├── jules-client.ts        # Jules APIクライアント
│   │   │   └── orchestrator.ts        # オーケストレータ
│   │   ├── lib/            # ユーティリティ
│   │   │   └── markdown-converter.ts
│   │   ├── mcp/            # MCPサーバー
│   │   │   └── feature-review-mcp-server.ts
│   │   ├── shared/         # 共通定義
│   │   │   ├── schemas.ts  # Zodスキーマ
│   │   │   └── types.ts    # 型定義
│   │   └── test-*.ts       # テストファイル
│   ├── jules/              # Julesツール
│   │   └── pr.ts           # PRコメント操作
│   └── shared/             # tools共通ユーティリティ
│       ├── claude/         # Claude Agent共通
│       │   ├── claude-agent.ts        # Agent生成
│       │   └── sanitize.ts # サニタイズ
│       ├── constants.ts    # 共通定数
│       └── github/         # GitHub共通
│           ├── guidelines-extractor.ts # ガイドライン抽出
│           ├── issue-client.ts        # Issue API
│           ├── pr-client.ts           # PR API
│           └── thread-resolver.ts     # スレッド解決
├── mcp/                    # Python MCPサーバー
│   ├── server.py           # MCPサーバーエントリー
│   ├── db.py               # SQLite操作
│   ├── embedding.py        # EmbeddingGemmaラッパー
│   ├── batch_embed.py      # バッチ埋め込み
│   ├── download_model.py   # モデルダウンロード
│   ├── generate_sample_data.py # サンプルデータ生成
│   └── pyproject.toml      # Python依存関係
├── scripts/                # ビルド・リリーススクリプト
│   ├── build-release.sh    # .appバンドル作成
│   ├── create-installer.sh # .pkg作成
│   ├── install-gh.sh       # gh CLI インストール
│   └── setup-jules.sh      # Jules VM用セットアップ
├── swift/                  # Swift関連（Login Items）
├── docs/                   # ドキュメント
│   ├── AGENTS.md           # AI Agent向けドキュメント
│   ├── DEVELOPMENT.md      # 開発フロー詳細
│   ├── MCP_SERVER_GUIDELINES.md # MCPサーバーガイド
│   ├── NOTARIZATION.md     # 公証について
│   └── RELEASE_PROCESS.md  # リリース手順
├── tests/                  # テストファイル
├── .github/
│   └── workflows/          # GitHub Actions
│       ├── pr-review.yml   # PR自動レビュー
│       ├── feature-reviewer.yml # Feature Reviewer
│       └── close-sub-issues.yml # Issue自動クローズ
├── .claude/                # Claude Code設定
│   └── settings.json
├── .mcp.json               # MCP設定
├── AGENTS.md               # 外部Agent向けドキュメント
├── CLAUDE.md               # Claude Code向けドキュメント（本ファイル）
└── package.json            # Node.js依存関係
```

### 主要コンポーネント

#### 1. News Agent System (`src/core/agent/`)

ニュース収集・処理を担当するマルチAgent構成:

- **NewsOrchestrator**: 複数のAgentを統合管理
- **NewsAgentWrapper**: Agent共通のラッパー
- **NewsResultBuilder**: 収集結果の構築
- **ResultCaptor**: MCP Tool結果のキャプチャ

プロンプト定義（`src/core/prompts/`）:
- **master**: 全体統括
- **news-collector**: 記事収集
- **aggregator**: 結果集約
- **duplicate-checker**: 重複検知
- **translator**: 翻訳

#### 2. Scheduler (`src/core/scheduler.ts`)
- launchdによる定期実行設定
- `~/Library/LaunchAgents/com.cc-pulse.schedule.plist`生成
- WebUI自動起動オプション対応

#### 3. WebUI (`src/commands/serve.ts`)
- `Bun.serve()` + Reactによるシングルページアプリ
- 記事一覧表示・フィードバック機能
- SQLiteからのデータ取得

#### 4. MCP Servers
- **embedding-mcp-server**: Sentence Transformersによるベクトル検索（Python）
- **output-tools-server**: ファイル出力・データベース保存
- **serena-mcp-server**: LSPベースのセマンティックコード解析（CI用）
- **review-util-mcp-server**: PRレビュー用ユーティリティ
- **feature-review-mcp-server**: Feature Review用ユーティリティ

#### 5. PR Review System (`tools/pr-review/`)

GitHub Actions上で動作するAI PRレビューシステム:

- **orchestrator.ts**: レビューフロー全体を管理
- **reviewer.ts**: Claude Agentによるコードレビュー実行
- **comment-resolver.ts**: 修正済みコメントの自動解決
- **jules-comment-handler.ts**: Google Julesとの連携

ワークフロー（`.github/workflows/pr-review.yml`）:
1. PR作成/更新時にトリガー
2. 差分取得 → Claude Agentでレビュー
3. インラインコメント投稿
4. Julesセッションへの通知

#### 6. Feature Reviewer System (`tools/feature-reviewer/`)

Issue作成時にレビュー観点・テスト観点を自動生成:

- **analyzer.ts**: Issue内容の分析
- **jules-client.ts**: Jules API連携
- **orchestrator.ts**: 全体フロー管理

ワークフロー（`.github/workflows/feature-reviewer.yml`）:
1. Issue作成時にトリガー
2. Issue内容を分析
3. レビュー観点・テスト観点を生成
4. Issueにコメントとして投稿

### データフロー

```
1. [fetch] Claude Agent → News APIs
2. [Agent] 記事要約・分類
3. [MCP] JSON出力 (~/.local/share/cc-pulse/news/)
4. [MCP] SQLite保存 (~/.cc-pulse/articles.db)
5. [serve] WebUI → SQLite参照 → ユーザー閲覧
```

## 開発フロー

cc-pulseには3つの開発フローがあります。

### 1. Development Mode（推奨：日常開発用）

TypeScriptソースを直接実行:

```bash
bun run dev --help
bun run dev fetch
bun run dev serve
bun run dev schedule
```

**使用場面**:
- コード変更の即座テスト
- デバッグ
- 日常的な開発作業

### 2. .app検証（本番バンドルテスト用）

.appバンドルをビルド・署名:

```bash
sudo rm -rf /Applications/cc-pulse.app
bash scripts/build-release.sh
/Applications/cc-pulse.app/Contents/MacOS/cc-pulse --version
```

**使用場面**:
- コンパイル後のバイナリ動作確認
- コード署名の検証
- リリース前チェック

### 3. .pkg検証（インストーラーテスト用）

フルリリースビルド + パッケージング + インストール:

```bash
sudo rm -rf /Applications/cc-pulse.app
bash scripts/build-release.sh
bash scripts/create-installer.sh
sudo installer -pkg dist/cc-pulse-0.1.0-arm64.pkg -target /
cc-pulse --version
```

**使用場面**:
- エンドユーザーインストールフローのテスト
- postinstallスクリプト検証（symlink作成）
- Login Items表示名の確認
- GitHub Releaseの最終チェック

**詳細は `docs/DEVELOPMENT.md` を参照してください。**

## CI/CDツール

### PRレビュー (`bun run review:pr`)

PR差分をAIでレビュー:

```bash
# ローカル実行
bun run review:local

# GitHub Actions（自動）
# PR作成・更新時に自動実行
```

### Feature Reviewer (`bun run feature-review:local`)

Issue分析・レビュー観点生成:

```bash
# ローカル実行
bash tools/feature-reviewer/local-feature.sh
```

### Julesツール

Google Jules用のPRコメント操作:

```bash
# @julesコメント取得
bun run pr:get-comments --pr <PR番号>

# コメント返信
bun run pr:reply --pr <PR番号> --comment-id <ID> --body "返信内容"
```

## Bun固有の実装ガイドライン

### 基本ルール

- `bun <file>` を使用（`node` / `ts-node` の代わり）
- `bun test` を使用（`jest` / `vitest` の代わり）
- `bun build` を使用（`webpack` / `esbuild` の代わり）
- `bun install` を使用（`npm` / `yarn` / `pnpm` の代わり）
- `.env` は自動読み込み（`dotenv`不要）

### 推奨API

- **SQLite**: `bun:sqlite` （`better-sqlite3`の代わり）
- **WebServer**: `Bun.serve()` （`express`の代わり）
- **ファイル操作**: `Bun.file()` （`node:fs`のreadFile/writeFileの代わり）
- **WebSocket**: 組み込み（`ws`パッケージ不要）

### WebUI実装パターン

`Bun.serve()` + HTML importsでReactアプリを配信:

```typescript
import indexHTML from './templates/index.html';

Bun.serve({
  port: 5775,
  routes: {
    '/': indexHTML,  // React自動バンドル
    '/api/news': { GET: handleGetNews },
  },
  development: {
    hmr: true,      // Hot Module Replacement
    console: true
  }
});
```

HTML内で直接TSX/CSSをインポート可能:

```html
<script type="module" src="./App.tsx"></script>
<link rel="stylesheet" href="./styles.css">
```

## 重要な制約事項

### Hardened Runtime

cc-pulseは**Hardened Runtimeなし**でビルドします。

- Bunコンパイル済みバイナリとの非互換性のため
- `scripts/build-release.sh`で`--options runtime`を指定しない
- "Ran out of executable memory" エラーが出た場合はHardened Runtime有効化が原因
- Apple Notarizationは不可だが、CLIツールとしては許容範囲
- 詳細: `docs/NOTARIZATION.md`

### ファイル所有権

.pkgインストール後、ファイルはroot所有:

```bash
# 削除時は必ずsudo使用
sudo rm -rf /Applications/cc-pulse.app
```

## 環境変数

| 変数名 | 必須 | 説明 |
|-------|------|------|
| `CLAUDE_CODE_OAUTH_TOKEN` | ◯ | Claude Pro/MAX OAuth token |
| `ANTHROPIC_API_KEY` | △ | Claude API Key（OAuth未使用時） |
| `GITHUB_TOKEN` | CI | GitHub API トークン |
| `JULES_API_KEY` | CI | Google Jules API キー |

**取得方法**:
```bash
# OAuth Token（Pro/MAX推奨）
claude setup-token

# API Key
# https://console.anthropic.com/ から取得
```

## npm scripts 一覧

```bash
# 開発
bun run dev              # TypeScriptソース直接実行
bun run dev:css          # Tailwind CSS ウォッチ

# ビルド
bun run build            # 両アーキテクチャ向けビルド
bun run build:arm64      # arm64向けビルド
bun run build:x64        # x64向けビルド
bun run build:css        # Tailwind CSSビルド

# 品質チェック
bun run lint             # TypeScript型チェック
bun test                 # テスト実行

# レビューツール
bun run review:pr        # PRレビュー実行
bun run review:local     # ローカルPRレビュー
bun run feature-review:local  # ローカルFeature Review

# Julesツール
bun run pr:get-comments  # Julesコメント取得
bun run pr:reply         # コメント返信
```

## トラブルシューティング

### よくあるエラー

1. **"Database file does not exist"**
   - 原因: `fetch`コマンド未実行
   - 解決: `bun run dev fetch` を実行

2. **"Agent execution failed"**
   - 原因: CLAUDE_CODE_OAUTH_TOKEN未設定
   - 解決: 環境変数を設定（`.envrc`推奨）

3. **"Ran out of executable memory"**
   - 原因: Hardened Runtimeが有効
   - 解決: ビルドスクリプトから`--options runtime`を削除

4. **PRレビューがタイムアウト**
   - 原因: 大きな差分、または複雑なコード
   - 解決: PR差分を小さく分割

### デバッグ方法

```bash
# ログ確認
tail -f ~/.local/state/cc-pulse/logs/cc-pulse.log

# SQLiteデータ確認
sqlite3 ~/.cc-pulse/articles.db "SELECT * FROM articles LIMIT 5;"

# launchd状態確認
launchctl list | grep cc-pulse
```

## MCP設定

プロジェクトルートの`.mcp.json`で設定:

```json
{
  "mcpServers": {
    "serena": {
      "type": "stdio",
      "command": "uvx",
      "args": ["--from", "git+https://github.com/oraios/serena", "serena-mcp-server"]
    },
    "sequential-thinking": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

## 参考リンク

- [Bun Documentation](https://bun.sh/docs)
- [Claude Agent SDK](https://github.com/anthropics/anthropic-sdk-typescript/tree/main/packages/claude-agent-sdk)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [Serena MCP Server](https://github.com/oraios/serena)
- [Google Jules](https://jules.google/docs)
