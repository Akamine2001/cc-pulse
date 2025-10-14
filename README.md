# cc-pulse

macOS向け自動ニュース収集CLIツール - Claude Agent SDK統合

## 前提条件

- [Bun](https://bun.sh/) v1.2.0以降
- [uv](https://docs.astral.sh/uv/) (Python環境管理)
- macOS (launchdスケジューラーを使用)
- CLAUDE_CODE_OAUTH_TOKEN環境変数（または ANTHROPIC_API_KEY）

## セットアップ

```bash
# 1. リポジトリクローン
git clone https://github.com/yourusername/cc-pulse.git
cd cc-pulse

# 2. 依存関係インストール + 初期セットアップ
bun run setup
```

セットアップでは以下が自動実行されます:
- 依存関係インストール (bun install)
- ディレクトリ作成
- 設定ファイル作成 (~/.config/cc-pulse/config.yml)
- Python MCP環境セットアップ
- Embeddingモデルダウンロード

## 基本的な使い方

```bash
# スケジューラー起動（WebUI + 定期ニュース収集）
bun run dev schedule

# 即座にニュース収集実行
bun run dev fetch

# Web UIで閲覧（既に起動している場合は不要）
bun run dev serve

# ステータス確認
bun run dev status

# アンインストール
bun run dev uninstall
```

## コマンドリファレンス

| コマンド | 説明 |
|---------|------|
| `setup` | 初期セットアップ（依存関係インストール含む） |
| `schedule` | スケジューラー設定（対話的） |
| `schedule --no-ui` | WebUIなしでスケジュールのみ起動 |
| `fetch` | 即座にニュース収集実行 |
| `serve` | Web UIサーバー起動 |
| `status` | システムステータス表示 |
| `uninstall` | 完全アンインストール |

## 設定ファイル

`~/.config/cc-pulse/config.yml`

```yaml
keywords:
  - AI
  - Machine Learning
  - Claude
count: 5
language: ja
port: 5775

scheduler:
  enabled: false
  time: "09:00"
  pattern: daily  # daily | weekday | weekend | custom
  custom_days: []
  auto_start_webui: true
```

## ビルド

```bash
# macOS ARM64向け
bun run build:arm64

# macOS x64向け
bun run build:x64

# 両方
bun run build
```

ビルド成果物は `dist/` に出力されます。

## PR自動レビューシステム

cc-pulseは、GitHub ActionsとClaude APIを使用した自動コードレビューシステムを搭載しています。PRが作成されると、自動的にコードをレビューしてコメントを投稿します。

### 🔧 セットアップ

#### 1. GitHub Secrets 設定

リポジトリの Settings > Secrets and variables > Actions で以下を追加：

| Secret名 | 説明 | 取得方法 |
|---------|------|---------|
| `ANTHROPIC_API_KEY` | Claude API Key | [Anthropic Console](https://console.anthropic.com/) |
| `PERSONAL_ACCESS_TOKEN` | GitHub PAT | [GitHub Settings](https://github.com/settings/tokens) (権限: `repo`, `write:discussion`) |

#### 2. ClaudeCode Hooks 設定（オプション - 推奨）

開発者の `.serena` コンテキストを自動的にGitHub Releasesに同期します。

```bash
# 1. 設定ファイルをコピー
cp scripts/claude-settings.sample.json ~/.claude/settings.json

# 2. 同期スクリプトを配置
mkdir -p ~/scripts
cp scripts/serena-sync.sh ~/scripts/
chmod +x ~/scripts/serena-sync.sh

# 3. GitHub CLIが認証済みであることを確認
gh auth status
```

これで、ClaudeCodeを起動するたびに自動的に`.serena`ディレクトリがGitHub Releasesに同期されます。

#### 3. 動作確認

PRを作成すると、GitHub Actionsが自動的に起動してレビューを実行します：

1. PR作成者の `.serena` コンテキストを取得（存在する場合）
2. Claude APIでコードレビュー実施
3. PRにレビュー結果をコメント投稿

### 📊 実装フェーズ

- **Phase 1（完了）**: 基本的なPRレビュー + ClaudeCode Hooks同期
- **Phase 2（予定）**: Serena MCP統合 + デグレーションチェック
- **Phase 3（予定）**: @jules連携 + パフォーマンス最適化

詳細は `docs/PR_REVIEW_SETUP.md` を参照してください。
