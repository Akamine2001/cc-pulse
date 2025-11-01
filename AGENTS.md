# AGENTS.md

Project instructions for AI coding agents (Google Jules, Cursor, etc.)

## Project Overview

CC Pulse is an AI-powered news aggregator that collects, summarizes, and displays news articles via a web UI. It uses Claude Agent SDK for news collection, EmbeddingGemma for article similarity search, and SQLite for storage.

**Stack:**
- Runtime: Bun (TypeScript)
- Frontend: React + Tailwind CSS
- Backend: Bun.serve() + SQLite
- Python: uv + EmbeddingGemma (ONNX)
- AI: Claude Agent SDK

## Setup for Google Jules VM

Jules uses **short-lived VMs** - setup is required every time.

### Automated Setup (Recommended)

```bash
bash scripts/setup-jules.sh
```

This script:
1. Installs Bun and uv
2. Installs dependencies (Node.js + Python)
3. Creates config and directories
4. Downloads EmbeddingGemma model (188MB, ~5 min)
5. Generates sample data (15 Japanese articles)
6. Starts web UI at http://localhost:5775

**Environment Variables:**
- `CLAUDE_CODE_OAUTH_TOKEN` (optional, for fetching real news)
- `ANTHROPIC_API_KEY` (alternative to CLAUDE_CODE_OAUTH_TOKEN)
- **Note:** Claude Agent SDK supports both environment variables. Use either one.

### Manual Setup

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# Install dependencies
bun install
cd mcp && uv sync && cd ..

# Create directories
mkdir -p ~/.config/cc-pulse
mkdir -p ~/.local/share/cc-pulse/news
mkdir -p ~/.cc-pulse/models

# Download model
cd mcp && uv run python download_model.py && cd ..

# Generate sample data
cd mcp && uv run python generate_sample_data.py && cd ..

# Start server
bun run dev serve
```

## Commands

### Development

```bash
# Start web UI (port 5775)
bun run dev serve

# Fetch news articles (requires CLAUDE_CODE_OAUTH_TOKEN)
bun run dev fetch

# Generate sample data
cd mcp && uv run python generate_sample_data.py
```

### Server Control

```bash
# Check server status
ps aux | grep "bun run dev serve"

# Stop server
pkill -f 'bun run dev serve'

# View logs
tail -f ~/.local/state/cc-pulse/logs/server.log
```

## Development Workflow

cc-pulseの開発では、確認したい内容に応じて3つのフローがあります。

| フロー | 用途 | 所要時間 | コマンド |
|--------|------|----------|----------|
| **開発モード** | コード修正後の即座確認 | 即座 | `bun run dev <command>` |
| **.app確認** | .appバンドル経由での動作確認 | 2-3分 | `bash scripts/build-release.sh` |
| **.pkg確認** | インストーラーの動作確認 | 5分程度 | フルビルド + インストール |

**推奨:** 通常は開発モードで開発し、配布前に.pkg確認を実施。

### フロー1: 開発モード（推奨）

TypeScriptソースを直接実行。再ビルド不要で即座に確認可能。

```bash
# コマンドのヘルプ確認
bun run dev --help

# バージョン確認
bun run dev --version

# ニュース収集実行
bun run dev fetch

# Web UIサーバー起動
bun run dev serve

# スケジューラー設定
bun run dev schedule

# ステータス確認
bun run dev status
```

**メリット:**
- ✅ ビルド不要
- ✅ 署名不要
- ✅ コード変更後すぐに確認可能
- ✅ 開発速度が最速

### フロー2: .app確認

.appバンドルを作成し、配布形式での動作を確認。

```bash
# 1. 既存の.appを削除（rootが所有しているため）
sudo rm -rf /Applications/cc-pulse.app

# 2. 再ビルド＋再署名
bash scripts/build-release.sh

# 3. CLIで確認
/Applications/cc-pulse.app/Contents/MacOS/cc-pulse --version
cc-pulse --help  # symlinkが有効な場合
```

**メリット:**
- ✅ 配布形式での動作確認
- ✅ 署名付きバイナリのテスト
- ✅ .pkgインストールより高速

### フロー3: .pkg確認（配布前の最終確認）

.pkgインストーラーを作成し、エンドユーザーと同じインストールフローをテスト。

```bash
# 1. 既存を削除
sudo rm -rf /Applications/cc-pulse.app

# 2. 再ビルド
bash scripts/build-release.sh

# 3. 再パッケージ
bash scripts/create-installer.sh

# 4. 再インストール
sudo installer -pkg dist/cc-pulse-0.1.0-arm64.pkg -target /

# 5. 確認
cc-pulse --version
cc-pulse schedule  # ログイン項目の表示名確認
```

**確認項目:**
- CLIコマンドが動作するか
- symlinkが正しく作成されたか
- ログイン項目に「cc-pulse」と表示されるか

### フロー選択のガイドライン

**開発中（日常的な確認）:**
→ **開発モード** (`bun run dev <command>`)

**配布前の中間確認:**
→ **.app確認** (`bash scripts/build-release.sh`)

**配布前の最終確認:**
→ **.pkg確認** (フルフロー)

詳細は `docs/DEVELOPMENT.md` を参照。

## Directory Structure

```
src/
  commands/        # CLI commands (fetch, serve, setup, schedule)
  core/           # Core logic (agent, config, notification)
  schemas/        # Zod validation schemas
  templates/      # Frontend (React) and HTML templates
  utils/          # Utilities (datetime, logger, paths)

mcp/
  db.py                      # SQLite operations
  embedding.py               # EmbeddingGemma wrapper
  batch_embed.py             # Batch embedding processor
  generate_sample_data.py    # Sample data generator
  download_model.py          # Model downloader
  pyproject.toml            # Python dependencies

scripts/
  setup-jules.sh   # Automated setup for Jules VM

~/.config/cc-pulse/
  config.yml       # User configuration

~/.local/share/cc-pulse/news/
  YYYY-MM-DD_HHMMSS.json  # Collected news data

~/.cc-pulse/
  articles.db      # SQLite database (articles + embeddings + feedback)
  models/          # EmbeddingGemma model (188MB)

~/.local/state/cc-pulse/
  logs/            # Server logs
```

## Configuration

**Location:** `~/.config/cc-pulse/config.yml`

```yaml
keywords:
  - AI
  - Machine Learning
  - Claude

count: 5           # Target article count
language: ja       # Article language
port: 5775         # Web server port

scheduler:
  enabled: false   # Not used in Jules
```

## Code Style

### TypeScript
- Use Bun APIs over Node.js when possible
- Prefer `Bun.serve()` for HTTP server
- Use `bun:sqlite` for database (not better-sqlite3)
- Use `Bun.file()` for file operations
- Zod for runtime validation

### Python
- Python 3.10+
- Type hints required
- Use uv for dependency management
- Follow PEP 8 style guide

### File Operations
- **Read**: Use Read tool (not cat/head/tail)
- **Edit**: Use Edit tool (not sed/awk)
- **Write**: Use Write tool (not echo/heredoc)

## Database Schema

**Table: articles**

```sql
CREATE TABLE articles (
    id TEXT PRIMARY KEY,              -- UUID from JSON
    title TEXT NOT NULL,
    summary TEXT,
    url TEXT NOT NULL,                -- Not unique (same URL can appear multiple times)
    source_domain TEXT,
    tags TEXT,                        -- JSON array of key points
    vector BLOB,                      -- Embedding vector (768 dimensions)
    created_at TEXT NOT NULL,         -- ISO 8601 format
    updated_at TEXT NOT NULL,
    is_good INTEGER                   -- 0=Bad, 1=Good, NULL=Unrated
);
```

## Data Flow

### News Collection (fetch command)

```
1. CLI: bun run dev fetch
2. NewsAgent (src/core/agent.ts)
   └─> Claude Agent SDK: Collect articles
3. Save to JSON: ~/.local/share/cc-pulse/news/YYYY-MM-DD_HHMMSS.json
4. batch_embed.py: Generate embeddings
   └─> Insert to SQLite with UUIDs from JSON
```

### Web UI (serve command)

```
1. CLI: bun run dev serve
2. Bun.serve() starts on port 5775
3. Routes:
   GET  /                    -> HTML (React app)
   GET  /api/dates           -> List of available collections
   GET  /api/news/:datetime  -> News data + merge is_good from SQLite
   POST /api/feedback        -> Update is_good in SQLite
```

### Feedback Flow

```
1. User clicks Good/Bad button
2. POST /api/feedback with {id: UUID, feedback: "good"|"bad"}
3. Update articles.is_good in SQLite (1 or 0)
4. Frontend updates button state
```

## Testing

### Manual Testing with Sample Data

```bash
# Generate sample data (15 articles)
cd mcp && uv run python generate_sample_data.py

# Start server
bun run dev serve

# Open browser: http://localhost:5775
```

### Verify Database

```bash
sqlite3 ~/.cc-pulse/articles.db "SELECT COUNT(*) FROM articles;"
sqlite3 ~/.cc-pulse/articles.db "SELECT id, title, is_good FROM articles LIMIT 5;"
```

## Troubleshooting

### Database not found
```bash
# Recreate database
cd mcp && uv run python -c "from db import get_article_db; get_article_db()"
```

### Model not found
```bash
# Re-download model
cd mcp && uv run python download_model.py
```

### Port already in use
```bash
# Kill existing server
pkill -f 'bun run dev serve'

# Or change port in config.yml
```

### "Article not found in database"
```bash
# JSON and DB are out of sync, regenerate sample data
cd mcp && uv run python generate_sample_data.py
```

## Important Notes for Jules

1. **VM is short-lived**: Always run `bash scripts/setup-jules.sh` first
2. **Model download**: EmbeddingGemma (188MB) downloads every time (~5 min)
3. **Sample data**: 15 Japanese AI/ML articles are pre-generated
4. **Web UI**: Auto-starts at http://localhost:5775 after setup
5. **No external access**: Web UI is localhost-only
6. **Data persistence**: None - VM is recreated each time

## Security

- API keys via environment variables only
- No hardcoded credentials
- SQLite database is local only
- Web UI binds to localhost only (not 0.0.0.0)

## Dependencies

### Node.js (Bun)
- React, Tailwind CSS (frontend)
- chalk, ora (CLI output)
- zod (validation)
- date-fns, date-fns-tz (datetime)

### Python (uv)
- huggingface-hub (model download)
- optimum[onnxruntime] (ONNX inference)
- transformers (tokenizer)
- numpy (vectors)

## Additional Resources

- **README.md**: Human-readable project documentation
- **scripts/setup-jules.sh**: Full setup automation
- **mcp/generate_sample_data.py**: Sample data generator
- **Jules docs**: https://jules.google/docs

## Jules Tools

Google JulesがPRのレビューコメントに対応するためのツール群です。

### 環境変数設定

Julesの環境変数に以下を設定してください：

```bash
export JULES_GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
```

### コマンド

#### 1. インラインコメント取得

PRの`@jules`メンションを含むunresolvedインラインコメントを取得します。

```bash
bun run pr:get-comments --pr <PR番号>
```

**出力例**:
```json
[
  {
    "comment_id": 123456,
    "file_path": "src/commands/setup.ts",
    "line_range": {"start": 42, "end": 42},
    "body": "@jules\n\nこの部分のエラーハンドリングが不足しています..."
  }
]
```

#### 2. コメント返信

特定のインラインコメントに返信を投稿します。

```bash
bun run pr:reply --pr <PR番号> --comment-id <コメントID> --body "修正内容"
```

**複数行の返信**:
```bash
bun run pr:reply --pr 123 --comment-id 456 --body "修正しました。

詳細：
- エラーハンドリングを追加
- テストケースを追加"
```

### 使用例：PRレビューコメントへの対応

ユーザーから「@julesとメンションされているPRコメントを確認して、修正や返信を行ってください」と指示された場合：

1. **コメント取得**
   ```bash
   bun run pr:get-comments --pr 123
   ```

2. **各コメントを確認**し、以下のいずれかを実施：
   - **修正が必要な場合**: コードを修正 → コミット → push
   - **質問・確認が必要な場合**: `bun run pr:reply`で返信

3. **修正後の返信例**:
   ```bash
   bun run pr:reply --pr 123 --comment-id 456 --body "Fixed in commit
abc123def"
   ```
4. **質問への返信例**:
   ```bash
   bun run pr:reply --pr 123 --comment-id 789 --body
"この実装は既存のパターンに従っています。詳細は src/core/agent.ts
を参照してください。"
   ```
### ワークフロー

```
1. PRが作成される
2. cc-pulse Auto-
Reviewがレビュー実施（`@jules`メンション付きでコメント投稿）
3. ユーザーがJulesに「`@jules`コメントを処理して」と指示
4. Jules: bun run pr:get-comments --pr <番号>
5. Jules: コメント内容を確認し、修正またはpr:replyで返信
6. Jules: 修正をコミット&push（または返信で完了）
```
