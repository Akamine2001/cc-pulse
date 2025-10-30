# GitHub CLI インストールスクリプト開発 - セッションコンテキスト

## 目的

`scripts/install-gh.sh` を Claude Code のサンドボックス環境で動作するように修正する。
このスクリプトは Claude Code 自身が gh コマンドをインストールするために使用される。

## 重要な制約事項

### 1. ブランチとセッションIDの一致

**Claude Code は、ブランチ名がセッションIDと一致しない場合、pushが403エラーで失敗します。**

- ブランチ名は `claude/` で始まり、セッションIDで終わる必要がある
- セッションIDは環境変数 `https_proxy` のJWTペイロード内の `session_id` で確認可能
- 例: セッションID `011CUcf5EunaodLsh2WfBDP5` の場合、ブランチ名は `claude/xxx-011CUcf5EunaodLsh2WfBDP5` のようになる必要がある

**確認コマンド**:
```bash
# 現在のセッションIDを確認
env | grep https_proxy | grep -o 'session_id":"[^"]*' | cut -d'"' -f3

# 現在のブランチを確認
git branch --show-current
```

### 2. Claude Code サンドボックスのプロキシ制約

Claude Code はプロキシ経由でインターネットにアクセスします。
プロキシのJWTトークンには `allowed_hosts` リストがあり、許可されたドメインのみアクセス可能です。

**最近追加されたドメイン**:
- `release-assets.githubusercontent.com` ← GitHub Releases のバイナリダウンロードに必須

**アクセス可能なドメイン**:
- `api.github.com`
- `github.com`
- `objects.githubusercontent.com`
- `raw.githubusercontent.com`
- `release-assets.githubusercontent.com` (最近追加)

## 現在の状況

### 完了した作業

1. ✅ `scripts/install-gh.sh` を apt ベースから直接バイナリダウンロード方式に修正
2. ✅ ブランチ `claude/test-gh-install-script-011CUcf5EunaodLsh2WfBDP5` にプッシュ完了
3. ✅ プロキシ許可リストに `release-assets.githubusercontent.com` を追加（サーバー側）

### スクリプトの現在の実装

**ファイル**: `scripts/install-gh.sh`
**ブランチ**: `claude/test-gh-install-script-011CUcf5EunaodLsh2WfBDP5`

**ダウンロード方法**:
```bash
# 最新バージョン取得
GH_VERSION=$(curl -s https://api.github.com/repos/cli/cli/releases/latest | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')

# ダウンロードURL
GH_URL="https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${GH_ARCH}.tar.gz"

# ダウンロード & インストール
curl -L -o "$TMP_FILE" "$GH_URL"
tar -xzf "$TMP_FILE" -C "$TMP_DIR"
sudo cp "$TMP_DIR/gh_${GH_VERSION}_linux_${GH_ARCH}/bin/gh" /usr/local/bin/gh
```

## 試して失敗した方法

### 1. apt パッケージマネージャー (最初のアプローチ)

```bash
# GitHub CLI リポジトリ追加
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list
sudo apt-get update
sudo apt-get install gh -y
```

**失敗理由**:
- DNS解決に失敗 (Temporary failure resolving)
- apt は標準的なDNS解決を使用するが、サンドボックス環境ではプロキシ経由のみアクセス可能
- `/etc/resolv.conf` が空で、標準的なDNS解決が機能しない

### 2. curl 直接ダウンロード (プロキシ更新前)

```bash
curl -L -o gh.tar.gz https://github.com/cli/cli/releases/download/v2.82.1/gh_2.82.1_linux_amd64.tar.gz
```

**失敗理由**:
- GitHub Releases のダウンロードは `release-assets.githubusercontent.com` にリダイレクトされる
- プロキシの `allowed_hosts` に含まれていなかった → **CONNECT tunnel failed, response 403**

**リダイレクトチェーン**:
```
https://github.com/cli/cli/releases/download/v2.82.1/gh_2.82.1_linux_amd64.tar.gz
↓ (302 redirect)
https://release-assets.githubusercontent.com/github-production-release-asset/...
↓ (403 Forbidden - プロキシで拒否)
```

### 3. GitHub API + Accept ヘッダー

```bash
curl -L -H 'Accept: application/octet-stream' \
  "https://api.github.com/repos/cli/cli/releases/assets/307127947"
```

**失敗理由**:
- APIは正常にアクセスできるが、最終的に `release-assets.githubusercontent.com` にリダイレクト
- 同じく403で失敗

### 4. WebFetch ツール

```
WebFetch(url="https://github.com/cli/cli/releases/download/v2.82.1/gh_2.82.1_linux_amd64.tar.gz")
```

**失敗理由**:
- リダイレクト先 `release-assets.githubusercontent.com` がブロックされている
- "Unable to verify if domain release-assets.githubusercontent.com is safe to fetch"

## 次に試すこと

### 前提確認

まず、新しいセッションで `release-assets.githubusercontent.com` へのアクセスが可能か確認：

```bash
# プロキシトークンに release-assets が含まれているか確認
env | grep https_proxy | grep -o 'release-assets' && echo "✅ Found" || echo "❌ Not found"

# 実際にアクセステスト
curl -v https://release-assets.githubusercontent.com 2>&1 | grep -E '(CONNECT|< HTTP|403)'
```

**期待する結果**:
```
> CONNECT release-assets.githubusercontent.com:443 HTTP/1.1
< HTTP/1.1 200 OK
```

### テスト実行

1. **正しいブランチにチェックアウト**:
```bash
git checkout claude/test-gh-install-script-011CUcf5EunaodLsh2WfBDP5
```

2. **スクリプト実行**:
```bash
bash scripts/install-gh.sh
```

3. **インストール確認**:
```bash
which gh
gh --version
```

### 失敗した場合のデバッグ

**ダウンロードURLのリダイレクト先確認**:
```bash
curl -sI https://github.com/cli/cli/releases/download/v2.82.1/gh_2.82.1_linux_amd64.tar.gz | grep -i location
```

**詳細なcurlログ**:
```bash
curl -vL https://github.com/cli/cli/releases/download/v2.82.1/gh_2.82.1_linux_amd64.tar.gz \
  -o /tmp/gh_test.tar.gz 2>&1 | tee /tmp/curl_debug.log
```

**失敗ポイント特定**:
```bash
cat /tmp/curl_debug.log | grep -E '(CONNECT|< HTTP|403|Forbidden|Location)'
```

## 代替案 (プロキシアクセスが失敗し続ける場合)

### Option A: objects.githubusercontent.com 経由

一部のGitHubコンテンツは `objects.githubusercontent.com` 経由でもアクセス可能（このドメインは以前から許可リストに含まれている）。

```bash
# 試してみる価値あり
curl -I https://objects.githubusercontent.com/github-production-release-asset/...
```

### Option B: ミラーサイト

GitHub CLI の公式ミラーやパッケージマネージャーのミラーがあるか調査。

### Option C: 静的バイナリを別経路で取得

- raw.githubusercontent.com 経由でビルド済みバイナリを配置
- 別のホスティングサービスにミラー

## 参考情報

### 診断に使用したコマンド

```bash
# DNS設定確認
cat /etc/resolv.conf

# DNS解決テスト
getent hosts archive.ubuntu.com

# プロキシ環境変数確認
env | grep -i proxy

# curl詳細ログ
curl -v https://cli.github.com 2>&1 | head -30
```

### プロキシJWTの構造

環境変数 `https_proxy` の形式:
```
http://container_<ID>:jwt_<JWT_TOKEN>@<IP>:<PORT>
```

JWTペイロード（Base64デコード後）に含まれる情報:
- `allowed_hosts`: 許可されたドメインのカンマ区切りリスト
- `session_id`: このセッションの一意なID
- `exp`: トークンの有効期限（Unixタイムスタンプ）
- `iat`: トークンの発行日時

## 期待される結果

新しいセッション（新しいJWTトークン）で：

```bash
$ bash scripts/install-gh.sh

=====================================
GitHub CLI Installation for Linux
=====================================

=====================================
Checking Operating System
=====================================
[SUCCESS] Running on Ubuntu 24.04.3 LTS (Noble Numbat)

=====================================
Step 1: Checking Prerequisites
=====================================
[SUCCESS] curl is installed
[SUCCESS] sudo privileges confirmed
[SUCCESS] All prerequisites are met

=====================================
Step 2: Installing GitHub CLI (gh)
=====================================
[INFO] Detected architecture: x86_64 (amd64)
[INFO] Fetching latest GitHub CLI version...
[INFO] Latest version: v2.82.1
[INFO] Downloading GitHub CLI from https://github.com/cli/cli/releases/download/v2.82.1/gh_2.82.1_linux_amd64.tar.gz...
[SUCCESS] Download complete
[INFO] Extracting archive...
[INFO] Installing to /usr/local/bin/gh...
[SUCCESS] Temporary files cleaned up
[SUCCESS] GitHub CLI installed successfully: gh version 2.82.1 (2025-01-28)

=====================================
Step 3: Checking GitHub Authentication
=====================================
[WARN] GitHub CLI is not authenticated

To authenticate with GitHub, run:
  gh auth login

=====================================
Installation Complete!
=====================================
```

## 関連ファイル

- `scripts/install-gh.sh` - インストールスクリプト本体
- `.github/workflows/` - (将来) CI/CDでのテストワークフロー
- `CLAUDE.md` - プロジェクト規約（セキュリティ、コーディング規約など）

## タスク完了の定義

- [ ] `bash scripts/install-gh.sh` がエラーなく完了
- [ ] `gh --version` がバージョン情報を表示
- [ ] スクリプトがmainブランチにマージ可能な状態
