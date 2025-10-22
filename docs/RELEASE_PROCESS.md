# cc-pulse リリース手順（開発者用）

このドキュメントは**開発者専用**です。エンドユーザー向けドキュメントはREADME.mdを参照してください。

## 前提条件

- ✅ macOS 13+
- ✅ Bun v1.2.0+
- ✅ Xcode Command Line Tools
- ✅ Developer ID Application証明書
- ✅ Developer ID Installer証明書
- ✅ direnv（推奨）または環境変数設定

## 環境変数設定

リリースビルドには証明書情報の環境変数設定が必要です。

### 方法1: direnv（推奨）

```bash
# 1. direnvをインストール（未インストールの場合）
brew install direnv

# 2. シェル設定に追加（~/.zshrcまたは~/.bashrc）
eval "$(direnv hook zsh)"  # zshの場合
# eval "$(direnv hook bash)"  # bashの場合

# 3. .envrcを作成
cp .envrc.example .envrc

# 4. .envrcを編集（証明書情報を記入）
vim .envrc
```

**.envrc の内容:**
```bash
# Developer ID Application証明書（.app署名用）
export DEVELOPER_ID="Developer ID Application: Your Name (YOUR_TEAM_ID)"

# Developer ID Installer証明書（.pkg署名用）
export DEVELOPER_ID_INSTALLER="Developer ID Installer: Your Name (YOUR_TEAM_ID)"
```

証明書名の確認方法：
```bash
# Developer ID Application証明書
security find-identity -v -p basic | grep "Developer ID Application"

# Developer ID Installer証明書
security find-identity -v -p basic | grep "Developer ID Installer"
```

```bash
# 5. direnvを許可
direnv allow

# 6. 確認（プロジェクトディレクトリに入ると自動で環境変数が読み込まれる）
echo $DEVELOPER_ID
```

### 方法2: 手動で環境変数を設定

```bash
# 毎回手動でexport
export DEVELOPER_ID="Developer ID Application: Your Name (YOUR_TEAM_ID)"
export DEVELOPER_ID_INSTALLER="Developer ID Installer: Your Name (YOUR_TEAM_ID)"

# ビルド実行
bash scripts/build-release.sh
```

## リリースワークフロー

### 1. バージョン更新

以下のファイルのバージョン番号を更新：

- [ ] `package.json` - version
- [ ] `src/templates/MainApp-Info.plist` - CFBundleVersion, CFBundleShortVersionString
- [ ] `scripts/build-release.sh` - VERSION変数

### 2. リリースビルド実行

```bash
# ARM64版をビルド（M1/M2/M3 Mac）
bash scripts/build-release.sh
```

**注意:** `./scripts/build-release.sh` ではなく `bash scripts/build-release.sh` で実行してください。

**実行内容：**
1. TypeScript CLIバイナリをビルド
2. Swift登録ヘルパーをビルド
3. .appバンドル構造を作成
4. Developer ID証明書で署名（パスワード入力あり）
5. 署名検証
6. 公証（Notarization）申請・完了待ち
7. 公証情報をステープル
8. 配布用zipを作成

**成果物：**
```
dist/release/
  cc-pulse-0.1.0-arm64.zip       # 配布用アーカイブ
  cc-pulse-0.1.0-arm64.sha256    # チェックサム
```

### 3. x64版のビルド（Intel Mac向け）

x64 Macまたはクロスコンパイル環境で実行：

```bash
./scripts/build-release.sh
```

成果物：
```
dist/release/
  cc-pulse-0.1.0-x64.zip
  cc-pulse-0.1.0-x64.sha256
```

### 4. テストインストール

```bash
# 既存削除
rm -rf /Applications/cc-pulse.app
rm ~/Library/LaunchAgents/com.cc-pulse.*

# インストール
unzip dist/release/cc-pulse-0.1.0-arm64.zip -d /Applications/

# 検証
codesign --verify --deep --strict /Applications/cc-pulse.app
spctl -a -vvv -t install /Applications/cc-pulse.app

# セットアップ
/Applications/cc-pulse.app/Contents/MacOS/cc-pulse setup

# ログイン項目登録
/Applications/cc-pulse.app/Contents/MacOS/cc-pulse-register register

# スケジュール設定
/Applications/cc-pulse.app/Contents/MacOS/cc-pulse schedule
```

### 5. GitHub Release作成

```bash
# タグ作成
git tag v0.1.0
git push origin v0.1.0

# リリース作成
gh release create v0.1.0 \
  --title "cc-pulse v0.1.0" \
  --notes "初回リリース" \
  dist/release/cc-pulse-0.1.0-arm64.zip \
  dist/release/cc-pulse-0.1.0-arm64.sha256 \
  dist/release/cc-pulse-0.1.0-x64.zip \
  dist/release/cc-pulse-0.1.0-x64.sha256
```

### 6. インストールスクリプト作成（将来）

エンドユーザー向けの簡単インストール：

```bash
# scripts/install.sh
curl -fsSL https://raw.githubusercontent.com/user/cc-pulse/main/scripts/install.sh | bash
```

## トラブルシューティング

### 公証エラー: "Invalid Provisioning Profile"

**原因:** Info.plistの設定不足

**対処:**
```xml
<!-- Info.plistに追加 -->
<key>NSHumanReadableCopyright</key>
<string>Copyright © 2025 cc-pulse</string>
```

### 公証エラー: "The executable does not have the hardened runtime enabled"

**原因:** `--options runtime`が抜けている

**対処:** build-release.sh内のcodesignコマンドに`--options runtime`を追加

### 署名エラー: "errSecInternalComponent"

**原因:** キーチェーンへのアクセス権限

**対処:**
1. キーチェーンアクセスを開く
2. 「Developer ID Application」証明書を右クリック
3. 「情報を見る」→「アクセス制御」
4. 「すべてのアプリケーションにこの項目へのアクセスを許可」にチェック

### sfltoolで「cc-pulse」と表示されない

**確認:**
```bash
# AssociatedBundleIdentifiersが設定されているか
plutil -p ~/Library/LaunchAgents/com.cc-pulse.fetcher.plist | grep Associated

# .appバンドルが正しい場所にあるか
ls -la /Applications/cc-pulse.app

# ログイン項目の状態
/Applications/cc-pulse.app/Contents/MacOS/cc-pulse-register status
```

## リリースチェックリスト

リリース前に以下を確認：

- [ ] バージョン番号を更新（package.json, Info.plist, build-release.sh）
- [ ] TypeScriptの型チェック通過（`bun run lint`）
- [ ] ARM64版ビルド成功
- [ ] x64版ビルド成功（別マシンまたはCI）
- [ ] 両方とも署名・公証完了
- [ ] ローカルでテストインストール成功
- [ ] ログイン項目に「cc-pulse」と表示されることを確認
- [ ] fetch/serve/schedule機能の動作確認
- [ ] CHANGELOG.md更新
- [ ] GitHub Releaseアップロード
- [ ] README.mdのインストール手順確認

## クイックリファレンス

### 署名確認

```bash
codesign -dvvv /Applications/cc-pulse.app
```

期待される出力：
```
Authority=Developer ID Application: Your Name (YOUR_TEAM_ID)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
TeamIdentifier=YOUR_TEAM_ID
Timestamp=...
```

### 公証確認

```bash
spctl -a -vvv -t install /Applications/cc-pulse.app
```

期待される出力：
```
/Applications/cc-pulse.app: accepted
source=Notarized Developer ID
```

### ログイン項目確認

```bash
# 登録状態
/Applications/cc-pulse.app/Contents/MacOS/cc-pulse-register status

# sfltoolで詳細確認
sfltool dumpbtm | grep -A10 "com.cc-pulse"
```

期待される出力：
```
Name: cc-pulse
Developer Name: Your Name
Identifier: com.yourname.cc-pulse
```

## 注意事項

### Developer ID証明書の有効期限

- 証明書は5年間有効
- 有効期限が近づいたら、Apple Developerサイトで更新
- 更新後、既存のリリースも再署名が必要

### キーチェーンパスワード

- ビルドスクリプト実行時、キーチェーンへのアクセスでパスワード入力が必要
- CI/CD環境ではキーチェーンの自動化が必要（`security unlock-keychain`等）

### 公証の制限

- 1日あたりの申請回数に制限あり
- 大量のテストビルドは避ける
- 本番リリース前に十分テストを行う

## 配布後の更新

### パッチリリース（0.1.0 → 0.1.1）

```bash
# バージョン更新
vim package.json
vim src/templates/MainApp-Info.plist
vim scripts/build-release.sh

# ビルド＆リリース
./scripts/build-release.sh
gh release create v0.1.1 dist/release/*
```

### メジャーアップデート（0.1.0 → 1.0.0）

- CHANGELOG.mdに詳細を記載
- 破壊的変更がある場合は、マイグレーションガイドを提供

## CI/CD自動化（将来）

GitHub Actionsでの自動ビルド例：

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1

      - name: Import certificates
        env:
          CERTIFICATE_BASE64: ${{ secrets.DEVELOPER_ID_CERTIFICATE }}
          CERTIFICATE_PASSWORD: ${{ secrets.CERTIFICATE_PASSWORD }}
        run: |
          # 証明書をキーチェーンにインポート

      - name: Build release
        run: ./scripts/build-release.sh

      - name: Upload to release
        uses: softprops/action-gh-release@v1
        with:
          files: dist/release/*
```

---

**最終更新:** 2025-10-12
**対象バージョン:** 0.1.0
**開発者:** 赤嶺大斗
