# cc-pulse - プロジェクト規約

## プロジェクト概要

macOS向け自動ニュース収集CLIツール。Claude Agent SDKを統合し、AIによる記事収集・要約・分類を行う。

**主な機能**:
- キーワードベースのニュース自動収集
- Claude AIによる記事要約・分類
- WebUIでの記事閲覧・フィードバック
- launchdによる定期実行スケジューラー
- SQLiteによる記事データ管理

## 技術スタック

- **ランタイム**: Bun v1.2.0+
- **言語**: TypeScript 5+
- **AI**: Claude Agent SDK (@anthropic-ai/claude-agent-sdk)
- **コードベース解析**: Serena MCP (LSPベースのセマンティック解析)
- **WebUI**: React 19 + Tailwind CSS
- **データベース**: SQLite (bun:sqlite)
- **Python環境**: uv (MCPサーバー管理用)
- **プラットフォーム**: macOS (launchd対応)

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
│   │   ├── setup.ts        # 初期セットアップ
│   │   ├── schedule.ts     # スケジューラー設定
│   │   ├── fetch.ts        # ニュース収集実行
│   │   ├── serve.ts        # WebUIサーバー
│   │   ├── status.ts       # ステータス表示
│   │   └── uninstall.ts    # アンインストール
│   ├── core/               # コアロジック
│   │   ├── agent.ts        # Claude Agent統合
│   │   ├── config.ts       # 設定管理
│   │   ├── scheduler.ts    # launchd連携
│   │   ├── notification.ts # macOS通知
│   │   └── *-mcp-server.ts # MCPサーバー管理
│   ├── templates/          # WebUI
│   │   ├── index.html      # Reactアプリエントリー
│   │   ├── App.tsx         # メインコンポーネント
│   │   └── styles.css      # Tailwind CSS
│   ├── utils/              # ユーティリティ
│   │   ├── paths.ts        # パス管理
│   │   ├── logger.ts       # ロギング
│   │   └── CCPulseDatetime.ts # 日時処理
│   └── schemas/            # Zodスキーマ
│       ├── news-schemas.ts # ニュースデータ型
│       └── language-codes.ts # 言語コード定義
├── mcp/                    # Python MCPサーバー
│   └── embedding_server.py # Embedding機能
├── scripts/                # ビルド・リリーススクリプト
│   ├── build-release.sh    # .appバンドル作成
│   └── create-installer.sh # .pkg作成
└── tests/                  # テストファイル
```

### 主要コンポーネント

#### 1. Agent (`src/core/agent.ts`)
- Claude Agent SDKによるニュース収集・要約
- MCPサーバー（embedding, output-tools）との連携
- 記事データのJSON出力 + SQLite保存

#### 2. Scheduler (`src/core/scheduler.ts`)
- launchdによる定期実行設定
- `~/Library/LaunchAgents/com.cc-pulse.schedule.plist`生成
- WebUI自動起動オプション対応

#### 3. WebUI (`src/commands/serve.ts`)
- `Bun.serve()` + Reactによるシングルページアプリ
- 記事一覧表示・フィードバック機能
- SQLiteからのデータ取得

#### 4. MCP Servers
- **embedding-mcp-server**: Sentence Transformersによるベクトル検索
- **output-tools-server**: ファイル出力・データベース保存
- **serena-mcp-server**: LSPベースのセマンティックコード解析（GitHub Actions PRレビュー用）

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

**取得方法**:
```bash
# OAuth Token（Pro/MAX推奨）
claude setup-token

# API Key
# https://console.anthropic.com/ から取得
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

### デバッグ方法

```bash
# ログ確認
tail -f ~/.local/state/cc-pulse/logs/cc-pulse.log

# SQLiteデータ確認
sqlite3 ~/.cc-pulse/articles.db "SELECT * FROM articles LIMIT 5;"

# launchd状態確認
launchctl list | grep cc-pulse
```

## 参考リンク

- [Bun Documentation](https://bun.sh/docs)
- [Claude Agent SDK](https://github.com/anthropics/anthropic-sdk-typescript/tree/main/packages/claude-agent-sdk)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [Serena MCP Server](https://github.com/oraios/serena)
