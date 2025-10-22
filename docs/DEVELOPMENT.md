# cc-pulse 開発フロー（開発者用）

**最終更新:** 2025-10-13

このドキュメントは開発時のビルド・動作確認フローを説明します。

---

## 開発フロー概要

cc-pulseの開発では、確認したい内容に応じて3つのフローがあります。

| フロー | 用途 | 所要時間 | コマンド |
|--------|------|----------|----------|
| **開発モード** | コード修正後の即座確認 | 即座 | `bun run dev <command>` |
| **.app確認** | .appバンドル経由での動作確認 | 2-3分 | `build-release.sh` |
| **.pkg確認** | インストーラーの動作確認 | 5分程度 | `build-release.sh` + `create-installer.sh` + 再インストール |

**推奨:** 通常は開発モードで開発し、配布前に.pkg確認を実施。

---

## フロー1: 開発モード（推奨）

### 概要
TypeScriptソースを直接実行。再ビルド不要で即座に確認可能。

### 使い方

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

### メリット
- ✅ ビルド不要
- ✅ 署名不要
- ✅ コード変更後すぐに確認可能
- ✅ 開発速度が最速

### 使用例

```bash
# 1. コード修正
vim src/commands/fetch.ts

# 2. 即座に確認
bun run dev fetch

# 3. 問題なければコミット
git commit -m "Fix: fetch command bug"
```

---

## フロー2: .app確認

### 概要
.appバンドルを作成し、配布形式での動作を確認。開発モードとの差異を検証する場合に使用。

### 手順

```bash
# 1. 既存の.appを削除（rootが所有しているため）
sudo rm -rf /Applications/cc-pulse.app

# 2. 再ビルド＋再署名
bash scripts/build-release.sh

# 3. CLIで確認
/Applications/cc-pulse.app/Contents/MacOS/cc-pulse --version
/Applications/cc-pulse.app/Contents/MacOS/cc-pulse --help
```

または、既存のsymlinkがあればそのまま実行可能：

```bash
cc-pulse --version  # /usr/local/bin/cc-pulseが有効な場合
```

### 実行内容

`build-release.sh`は以下を実行します：

1. TypeScript CLIバイナリをビルド（Bun compile）
2. Swift登録ヘルパーをビルド（swiftc）
3. .appバンドル構造を作成（`/Applications/cc-pulse.app`）
4. Info.plistをコピー
5. Developer ID Application証明書で署名
6. 署名検証

### メリット
- ✅ 配布形式での動作確認
- ✅ 署名付きバイナリのテスト
- ✅ .pkgインストールより高速

### 所要時間
約2-3分（ビルド＋署名）

---

## フロー3: .pkg確認（配布前の最終確認）

### 概要
.pkgインストーラーを作成し、エンドユーザーと同じインストールフローをテスト。

### 手順

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
cc-pulse --help
cc-pulse schedule  # ログイン項目の表示名確認
```

### 実行内容

#### `build-release.sh`
- TypeScript CLIバイナリをビルド
- Swift登録ヘルパーをビルド
- .appバンドル構造を作成
- Developer ID Application証明書で署名

#### `create-installer.sh`
- postinstallスクリプトを準備
- pkgbuildで.pkgファイルを作成
- Developer ID Installer証明書で署名

#### `installer`コマンド
- .pkgを/Applicationsにインストール
- postinstallスクリプトを実行（symlink作成）

### 確認項目

```bash
# 1. CLIコマンドが動作するか
cc-pulse --version
cc-pulse --help

# 2. symlinkが正しく作成されたか
ls -la /usr/local/bin/cc-pulse
# → lrwxr-xr-x  1 root  wheel  ... /usr/local/bin/cc-pulse -> /Applications/cc-pulse.app/Contents/MacOS/cc-pulse

# 3. ログイン項目に「cc-pulse」と表示されるか
cc-pulse schedule
# システム設定 → 一般 → ログイン項目 で「cc-pulse」と表示されることを確認
```

### メリット
- ✅ エンドユーザーと同じインストールフロー
- ✅ postinstallスクリプトの動作確認
- ✅ ログイン項目の表示名確認
- ✅ 配布前の最終検証

### 所要時間
約5分（ビルド＋署名＋パッケージング＋インストール）

---

## フロー選択のガイドライン

### 開発中（日常的な確認）
→ **開発モード** (`bun run dev <command>`)

- コマンド動作の確認
- ロジックのデバッグ
- 新機能の実装とテスト

### 配布前の中間確認
→ **.app確認** (`bash scripts/build-release.sh`)

- Bunコンパイル済みバイナリの動作確認
- 署名後の動作確認
- パフォーマンステスト

### 配布前の最終確認
→ **.pkg確認** (フルフロー)

- エンドユーザー体験の確認
- インストーラーの動作確認
- ログイン項目表示名の確認
- GitHub Releaseアップロード前

---

## トラブルシューティング

### 問題: "Ran out of executable memory"

**原因:** hardened runtimeが有効になっている

**対処:**
```bash
# scripts/build-release.shを確認
# codesignコマンドに--options runtimeが含まれていないことを確認
grep "options runtime" scripts/build-release.sh
# → 何も出力されなければOK
```

### 問題: Permission denied (削除時)

**原因:** .pkgインストール後のファイルはrootが所有

**対処:**
```bash
sudo rm -rf /Applications/cc-pulse.app
```

### 問題: 署名エラー "Developer ID not found"

**原因:** Developer ID Application証明書が見つからない

**対処:**
```bash
# 証明書を確認
security find-identity -v -p basic | grep "Developer ID"

# 証明書がない場合、キーチェーンアクセスで再インポート
```

### 問題: pkgbuildがタイムアウト

**原因:** --root /Applications を使用している（修正済み）

**対処:** `scripts/create-installer.sh`が一時ディレクトリを使用していることを確認

---

## 補足: hardened runtimeについて

### 現在の方針
cc-pulseは**hardened runtimeなし**でビルドしています。

### 理由
- Bunコンパイル済みバイナリはhardened runtimeと互換性なし
- hardened runtime有効時: "Ran out of executable memory"エラー発生

### 影響
- ✅ Developer ID署名: 有効
- ✅ タイムスタンプ: 有効
- ❌ hardened runtime: 無効
- ❌ Apple公証: 不可（hardened runtimeが必須）

### 配布への影響
- インストール時に「開発元を確認できません」警告が表示される場合あり
- 回避方法: 右クリック→「開く」、または`sudo installer`コマンド
- CLIツールとしては一般的な配布方法

詳細は `docs/NOTARIZATION.md` を参照。

---

## 関連ドキュメント

- **README.md** - エンドユーザー向けドキュメント
- **docs/RELEASE_PROCESS.md** - リリース手順
- **docs/NOTARIZATION.md** - 公証についての詳細
- **docs/IMPLEMENTATION_STATUS.md** - Phase 1-6実装履歴

---

**最終更新:** 2025-10-13
**対象バージョン:** 0.1.0
**開発者:** 赤嶺大斗
