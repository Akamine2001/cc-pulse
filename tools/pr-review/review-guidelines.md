# PRレビュー観点（フォールバック）

このファイルは、関連Issueからレビュー観点を取得できない場合に使用されます。

**目的**: 既存のコードベースと一貫性のある実装になっているかを確認する

---

## 🔍 レビュー観点

### 1. 既存の類似実装との一貫性

**重要**: 新しいコードは、既存の類似実装のパターンに従ってください。

#### チェック項目

##### 類似機能の調査
- [ ] 同じような機能がすでに実装されていないか確認
  - **方法**: Serena MCPの `search_for_pattern` で類似コードを検索
  - **例**: 新しいコマンド追加時 → 既存のコマンド実装を参照

##### 実装パターンの統一
- [ ] 既存の実装パターンと一致しているか
  - **ファイル構成**: 類似機能と同じディレクトリ構造
  - **命名規則**: 既存のファイル・クラス・関数の命名に従う
  - **エラーハンドリング**: 既存のtry-catchパターンを踏襲
  - **ログ出力**: 既存のログフォーマット（絵文字、メッセージ形式）に統一

**例**:
```typescript
// 既存実装（setup.ts）がこのパターンなら
console.log('✅ Setup completed');

// 新しいコード（configure.ts）も同じパターンに
console.log('✅ Configuration saved');  // Good
console.log('[OK] Configuration saved');  // Bad（既存と異なる）
```

##### アーキテクチャの一貫性
- [ ] プロジェクトのアーキテクチャに従っているか
  - **依存関係**: `tools/shared/` の共通クライアントを使用
  - **MCP統合**: 既存のMCPサーバー管理パターンに従う
  - **エージェント使用**: `ClaudeAgent` ラッパーを使用

**参照すべき既存実装**:
- コマンド追加: `src/commands/` の既存コマンド
- GitHub連携: `tools/shared/github/` の共通クライアント
- Claude Agent: `tools/shared/claude/agent.ts` のラッパー
- MCPサーバー: `tools/feature-reviewer/core/analyzer.ts` の設定パターン

---

### 2. プロジェクト固有の制約・規約

#### Bun固有の実装
- [ ] Bun APIを優先使用しているか
  - `Bun.file()` でファイル読み書き
  - `bun:sqlite` でデータベース操作
  - `Bun.serve()` でWebサーバー
  - **NG**: `fs.readFileSync()`, `better-sqlite3`, `express`

#### TypeScript型安全性
- [ ] `any` を使わず適切な型定義をしているか
- [ ] Zodスキーマでバリデーションしているか（外部データ）
- [ ] `bun run lint` が通るか

#### セキュリティ
- [ ] API KEY・トークンがハードコードされていないか
  - `process.env.CLAUDE_CODE_OAUTH_TOKEN`
  - `process.env.ANTHROPIC_API_KEY`
  - `process.env.GITHUB_TOKEN`

#### コーディングスタイル
- [ ] CLAUDE.mdの規約に準拠しているか
  - インデント: 2スペース
  - セミコロン: 使用する
  - 命名: camelCase（変数・関数）、PascalCase（型・クラス）、kebab-case（ファイル名）

---

### 3. デグレーションチェック

- [ ] 既存機能への悪影響がないか
  - **方法**: Serena MCPの `find_referencing_symbols` で影響範囲を調査
  - **確認**: 変更した関数・クラスの呼び出し元をすべて確認

- [ ] 既存テストが通るか
  - `bun test`
  - `bun run build:arm64`

---

## 📖 レビュー手順

### Step 1: 類似実装の特定
Serena MCPで既存の類似コードを探す：
```
mcp__serena__search_for_pattern
  substring_pattern: "関連するキーワード"
  relative_path: "対象ディレクトリ"
```

### Step 2: パターンの比較
- 既存実装のファイル構成を確認
- 命名規則、エラーハンドリング、ログ出力のパターンを抽出
- 新しいコードが同じパターンに従っているか確認

### Step 3: 影響範囲の調査
変更した関数・クラスの参照箇所を確認：
```
mcp__serena__find_referencing_symbols
  name_path: "関数名/クラス名"
  relative_path: "ファイルパス"
```

---

## 🎯 重要度の基準

| 重要度 | 説明 | 例 |
|-------|------|-----|
| `critical` | セキュリティリスク・システム障害 | API KEY漏洩、SQLインジェクション |
| `high` | 既存パターンとの不一致・デグレ | 既存のエラーハンドリングパターンと異なる |
| `medium` | コード品質・保守性 | ログフォーマットの不統一 |
| `low` | 軽微な改善提案 | コメントの追加 |

---

## 💡 指摘例

### Good（具体的）
```markdown
🟠 **[high] 実装パターンの不一致**: エラーハンドリングが既存パターンと異なります

**該当箇所**: src/commands/new-command.ts:45

**問題**: try-catchでエラーをキャッチしていますが、既存のコマンド実装ではエラーメッセージを
ユーザーに表示してからthrowしています。

**既存パターン**:
- setup.ts:78-82
- fetch.ts:123-127

**推奨対応**:
\`\`\`typescript
catch (error) {
  console.error('❌ Command failed:', error);
  throw error;
}
\`\`\`
```

### Bad（曖昧）
```markdown
エラー処理が良くないです。
```

---

**Note**: より詳細なレビュー観点が必要な場合は、親IssueとサブIssueを作成してfeature-reviewerで自動生成してください。
