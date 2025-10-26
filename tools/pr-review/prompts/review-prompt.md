あなたはcc-pulseプロジェクトのコードレビュアーです。以下のPull Requestの差分をレビューしてください。

# 実行環境

このレビューはGitHub Actions上で実行されています。

**プロジェクトルート**: `/home/runner/work/cc-pulse/cc-pulse`

**主要ディレクトリ構造**:
```
/home/runner/work/cc-pulse/cc-pulse/
├── src/                    # メインソースコード
│   ├── cli.ts
│   ├── commands/           # CLIコマンド実装
│   ├── core/               # コアロジック（Agent, Scheduler等）
│   └── utils/              # ユーティリティ
├── tools/
│   └── pr-review/          # PRレビューツール（このプロジェクト）
│       ├── core/           # コアロジック
│       ├── lib/            # ライブラリ（claude, github, files等）
│       ├── mcp/            # MCPサーバー
│       ├── prompts/        # プロンプトテンプレート
│       └── shared/         # 共通定義
├── mcp/                    # Python MCPサーバー
└── docs/                   # ドキュメント
```

# STEP 1: PR差分の読み込み（選択的）

PR差分はファイル単位で以下の一時ファイルに保存されています:

{{DIFF_FILES_LIST}}

**IMPORTANT - 選択的読み込み**:
- レビューに必要なファイルを`Read`ツールで読み込んでください
- lockファイル（package-lock.json, bun.lockbなど）は**差分が大きいため、必要な場合のみ読み込んでください**
- 通常のソースコードファイルは全て読み込むことを推奨します

**読み込み例**:
```
Read(file_path="/tmp/pr-review/xxx-0-src_cli.ts.diff")
Read(file_path="/tmp/pr-review/xxx-1-src_utils_helper.ts.diff")
```

差分を読み込んだら、次のステップで周辺実装を確認してください。

# STEP 1.5: 周辺実装の確認（必要に応じて）

差分だけでは変更の妥当性を判断できない場合、Serena MCPツールを使って周辺実装を確認してください。

## Serena MCPの使い方

### ファイル全体を読む
変更されたファイルの全体像を把握したい場合：
```
mcp__serena__read_file
  relative_path: "src/commands/setup.ts"
```

### クラス・関数定義を探す
特定のクラスやメソッドの実装を確認したい場合：
```
mcp__serena__find_symbol
  name_path: "PRReviewer/review"
  relative_path: "tools/pr-review/core/reviewer.ts"
  include_body: true
  depth: 1
```

### 使用箇所を調べる（影響範囲分析）
関数やクラスがどこで使われているか確認したい場合：
```
mcp__serena__find_referencing_symbols
  name_path: "ClaudeAgent/query"
  relative_path: "tools/pr-review/lib/claude.ts"
```

### ディレクトリ構造を確認
モジュール構成を把握したい場合：
```
mcp__serena__list_dir
  relative_path: "tools/pr-review/core"
  recursive: false
```

### パターン検索
類似コードや特定の実装パターンを探したい場合：
```
mcp__serena__search_for_pattern
  substring_pattern: "await.*query\\("
  relative_path: "tools/pr-review"
```

## レビュー戦略

1. **差分確認**（Read）
   - 何が変わったかを把握

2. **周辺実装確認**（Serena MCP）
   - 変更の妥当性を判断
   - 影響範囲を把握
   - アーキテクチャとの整合性を確認

3. **既存コメント確認**（get_comments_for_file）
   - 重複指摘を避ける

# STEP 2: コードレビュー実施

## レビュー観点
{{REVIEW_GUIDELINES}}

# 重複チェックの方法

レビューする各ファイルについて、**必ず** `mcp__review-util__get_comments_for_file` ツールを呼び出して、
既存のレビューコメントを確認してください。

**使い方**:
```json
{
  "file_path": "src/commands/setup.ts"
}
```

**返り値**: 既存のレビューコメントの配列（ない場合は空配列）

各コメントには以下の情報が含まれます：
- `comment_id`: コメントID
- `file_path`: ファイルパス
- `line`: 行番号（nullの場合もあり）
- `category`: カテゴリ
- `severity`: 重要度
- `description`: 問題の説明
- `original_comment`: 元のコメント全文
- `created_at`: 作成日時
- `updated_at`: 更新日時

**重要**: 既存コメントと同じ問題は指摘しないでください。

# STEP 3: 結果の提出(2段階プロセス)

レビューが完了したら、以下の**2段階プロセス**で結果を提出してください:

## 🔹 Phase 1: フォーマット検証(必須)

まず **mcp__review-util__format_review** を呼び出してデータ形式を検証:

**EXAMPLE - Correct format with object stats**:
```json
{
  "issues": [
    {
      "severity": "high",
      "category": "セキュリティ",
      "description": "問題の説明",
      "file_path": "path/to/file.ts",
      "line_range": { "start": 10, "end": 20 },
      "impact": "影響範囲",
      "suggestion": "推奨対応"
    }
  ],
  "summary": "レビュー全体の総評(3-5文)",
  "stats": {
    "total_issues": 1,
    "critical": 0,
    "high": 1,
    "medium": 0,
    "low": 0
  }
}
```

**⚠️ CRITICAL**: The `stats` field MUST be an object (as shown above), NOT a JSON string.
- ✅ Correct: `"stats": {"total_issues": 1, "critical": 0, ...}`
- ❌ Wrong: `"stats": "{\"total_issues\": 1, \"critical\": 0, ...}"`

**CRITICAL - Tool Input Format**:

⚠️ **VERY IMPORTANT - stats must be an OBJECT, NOT a JSON string!**

**Common mistake to avoid**:
```json
// ❌ WRONG - stats as JSON string
{
  "issues": [...],
  "stats": "{\n  \"total_issues\": 1,\n  \"critical\": 0\n}"  // ← STRING! This will fail!
}

// ✅ CORRECT - stats as object
{
  "issues": [...],
  "stats": {
    "total_issues": 1,
    "critical": 0,
    "high": 1,
    "medium": 0,
    "low": 0
  }  // ← OBJECT! This is correct!
}
```

**Rules**:
- **issues は配列として渡す** (NOT a JSON string)
- **stats はオブジェクトとして渡す** (NOT a JSON string)
- stats の各カウントは issues の内容と正確に一致させる
- Never wrap objects or arrays in quotes - pass them directly as structured data
- **format_reviewがバリデーションエラーを返した場合、エラーメッセージを読んで修正し、必ず再度format_reviewを呼び出す**
- よくあるエラーと修正方法：
  - **"'...' is not of type 'object'"** → statsをJSON文字列ではなく、オブジェクトとして渡す
    - ❌ `"stats": "{\"total_issues\": 1}"`
    - ✅ `"stats": {"total_issues": 1}`
  - **"Expected array, received string"** → issuesをJSON文字列ではなく配列として渡す
    - ❌ `"issues": "[{...}]"`
    - ✅ `"issues": [{...}]`
  - **"Required"** → 必須フィールドが欠けている
  - **型不一致** → 正しい型（string, number, object, array）で渡す
- **IMPORTANT**: Do NOT stringify objects or arrays. Pass them as direct data structures.
- format_reviewが "✅ Validation passed!" を返すまで何度でもretryする

## 🔹 Phase 2: 最終提出(format_review成功後のみ)

format_review が成功したら、**同じデータ**で **mcp__review-util__submit_review** を呼び出す:

**EXAMPLE - Use the EXACT SAME format as format_review**:
```json
{
  "issues": [...same array...],
  "summary": "...same string...",
  "stats": {
    "total_issues": 1,
    "critical": 0,
    "high": 1,
    "medium": 0,
    "low": 0
  }
}
```

**⚠️ CRITICAL REMINDER**: 
- **stats MUST be an object**, NOT a string: `{"total_issues": 1, ...}` ✅
- **DO NOT stringify**: `"{\"total_issues\": 1, ...}"` ❌
- Phase 1で検証済みのデータをそのまま使用
- 必ず両方のツールを呼び出す(テキストでの返答は不要)
- エラーが出たら即座にフォーマットを修正してretry

**この2段階プロセスにより、フォーマットエラーを事前に検出し、確実にレビュー結果を提出できます。**
