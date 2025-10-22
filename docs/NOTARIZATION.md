# cc-pulse 公証（Notarization）TODO

**最終更新:** 2025-10-13
**ステータス:** 保留（hardened runtime非対応のため）

---

## 現在の状態

### 署名状態
- ✅ **Developer ID Application署名**: 完了（cc-pulse.app）
- ✅ **Developer ID Installer署名**: 完了（.pkg）
- ✅ **タイムスタンプ**: 有効
- ❌ **hardened runtime**: 無効（Bunバイナリとの非互換性）
- ❌ **Apple公証**: 未実施

### 配布可能性
- ✅ 署名付き.pkgは配布可能
- ⚠️ インストール時に「開発元を確認できません」警告が表示
- ✅ 回避方法: 右クリック→「開く」、または`sudo installer`コマンド

---

## 公証とは

Appleが提供する「このソフトウェアは安全です」という公式保証。

### 公証の流れ
1. 開発者が署名済みソフトウェアをAppleに送信
2. Appleが自動スキャン（マルウェア、セキュリティチェック）
3. 問題なければAppleが「公証チケット」を発行
4. ソフトウェアに公証チケットを添付（ステープル）

### 公証のメリット
- macOS Gatekeeperが「Appleで検証済み」と認識
- ユーザーが警告なしでインストール可能
- 信頼性向上

---

## 現在の課題

### 問題: hardened runtimeとBunの非互換性

**公証の要件:**
```
✅ Developer ID署名
❌ hardened runtime有効化  ← ここが問題
✅ タイムスタンプ
```

**発生するエラー:**
```bash
# hardened runtime有効でビルド
codesign --options runtime --sign "Developer ID" cc-pulse.app

# バイナリ実行時
cc-pulse --help
→ "Ran out of executable memory while allocating 128 bytes."
```

**原因:**
- hardened runtimeはメモリ実行を厳格に制限
- Bunコンパイル済みバイナリは動的にメモリを使用
- 両者が互換性なし

**現在の対応:**
- `scripts/build-release.sh`から`--options runtime`を削除（103-108行目）
- CLIは正常動作するが、公証申請不可

---

## 解決策の選択肢

### オプション1: 公証なしで配布（現在の方針）

**メリット:**
- ✅ すぐに配布可能
- ✅ CLIツールとして完全動作
- ✅ 開発速度維持

**デメリット:**
- ⚠️ ユーザーが「右クリック→開く」で回避必要
- ⚠️ 一部のユーザーに不安感

**推奨対象:**
- 技術者向けCLIツール
- GitHub Releases配布
- README/ドキュメントでインストール手順を明記

**実装状況:**
- ✅ 署名付き.pkg作成済み（`dist/cc-pulse-0.1.0-arm64.pkg`）
- ✅ インストール動作確認済み
- ⏳ README/ドキュメント整備（TODO）

---

### オプション2: hardened runtime + entitlements試行（実験的）

**アプローチ:**
Bunバイナリに必要なentitlementsを付与して動作可能か試す。

**調査手順:**
```bash
# 1. Bunバイナリの必要なentitlementsを特定
codesign -d --entitlements - ~/.bun/bin/bun

# 2. entitlements.plist作成
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- 必要なentitlementsを列挙 -->
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-executable-page-protection</key>
    <true/>
</dict>
</plist>

# 3. entitlementsを付与して再署名
codesign --force --sign "Developer ID Application" \
  --options runtime \
  --entitlements entitlements.plist \
  /Applications/cc-pulse.app

# 4. 動作確認
cc-pulse --help
```

**リスク:**
- ❌ 試行錯誤が必要
- ❌ 成功保証なし
- ❌ セキュリティ緩和が必要（公証で拒否される可能性）

**ステータス:** 未実施

---

### オプション3: Bunを使わずネイティブビルド（大規模変更）

**アプローチ:**
TypeScriptを別のツールでネイティブバイナリ化。

**候補ツール:**
- Deno compile
- pkg
- nexe
- ncc + Node.js single executable

**メリット:**
- ✅ hardened runtime対応可能
- ✅ 公証可能

**デメリット:**
- ❌ 大幅な変更が必要
- ❌ Bunの高速性・機能を失う
- ❌ 開発体験の劣化

**ステータス:** 保留（最終手段）

---

### オプション4: 将来的なBun対応を待つ

**状況:**
- Bunは活発に開発中
- hardened runtime対応が将来追加される可能性

**対応:**
- Bunのリリースノートを監視
- hardened runtime対応版がリリースされたら即座に対応

**ステータス:** 監視中

---

## 公証手順（参考：将来対応時）

### 前提条件
1. ✅ Apple Developer Program加入（$99/年）
2. ✅ Developer ID証明書取得済み
3. ❌ hardened runtime有効化（現在の課題）
4. ⏳ App-Specific Password生成

### 手順

**1. App-Specific Passwordを生成**
```
https://appleid.apple.com
→ サインイン
→ セキュリティ
→ App用パスワード
→ パスワードを生成
→ 「cc-pulse-notarization」などの名前で生成
→ パスワードをコピー（一度しか表示されない）
```

**2. 公証申請**
```bash
xcrun notarytool submit dist/cc-pulse-0.1.0-arm64.pkg \
  --apple-id "your-apple-id@example.com" \
  --team-id "YOUR_TEAM_ID" \
  --password "<app-specific-password>" \
  --wait
```

**3. 公証状況確認**
```bash
# 成功の場合
✅ Successfully received submission info
  id: xxxxx-xxxx-xxxx-xxxx-xxxxx
  status: Accepted

# 失敗の場合
❌ status: Invalid
→ ログを確認
xcrun notarytool log <submission-id> \
  --apple-id "your-apple-id@example.com" \
  --team-id "YOUR_TEAM_ID" \
  --password "<app-specific-password>"
```

**4. 公証チケットをステープル**
```bash
xcrun stapler staple dist/cc-pulse-0.1.0-arm64.pkg
```

**5. 確認**
```bash
xcrun stapler validate dist/cc-pulse-0.1.0-arm64.pkg
# → "The validate action worked!"

spctl -a -vv -t install dist/cc-pulse-0.1.0-arm64.pkg
# → "accepted"と表示されればOK
```

---

## 配布時の注意事項（現在）

### README/ドキュメントに記載すべき内容

**セキュリティセクション:**
```markdown
## セキュリティについて

cc-pulseは以下のセキュリティ対策を実施しています：
- ✅ Apple Developer ID署名済み
- ✅ タイムスタンプ付き署名
- ✅ 署名により改ざんされていないことを保証
- ⚠️ Apple公証: 未実施（理由: Bunランタイムとhardened runtimeの互換性問題）

### インストール方法

インストール時に「開発元を確認できません」という警告が表示される場合があります。
これは公証が未実施のためですが、Developer ID署名により安全性は保証されています。

**推奨インストール方法:**

```bash
# ターミナルでインストール（推奨）
sudo installer -pkg cc-pulse-0.1.0-arm64.pkg -target /
```

**またはFinderから:**
1. .pkgファイルを右クリック
2. 「開く」を選択
3. 警告が表示されたら「開く」をクリック
4. インストーラーの指示に従う
```

---

## アクションアイテム

### 短期（Phase 6完了後）
- [ ] README.mdにセキュリティ・インストール手順セクションを追加
- [ ] 配布用ドキュメント整備

### 中期（オプション2実験）
- [ ] Bunバイナリのentitlements調査
- [ ] hardened runtime + entitlementsでのテストビルド
- [ ] 動作確認

### 長期（将来的対応）
- [ ] Bunのhardened runtime対応リリースを監視
- [ ] 対応版リリース後、公証実施
- [ ] App-Specific Password生成
- [ ] 公証申請・ステープル

---

## 参考リソース

### Apple公式ドキュメント
- [Notarizing macOS Software Before Distribution](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Hardened Runtime](https://developer.apple.com/documentation/security/hardened_runtime)
- [Entitlements](https://developer.apple.com/documentation/bundleresources/entitlements)

### Bunドキュメント
- [Bun Compile](https://bun.sh/docs/bundler/executables)
- [Bun GitHub Issues](https://github.com/oven-sh/bun/issues)（hardened runtime関連）

---

## 履歴

- **2025-10-13**: ドキュメント作成
  - Phase 6完了（署名付き.pkg作成）
  - hardened runtime非対応により公証保留を決定
  - 配布方針：署名付き・公証なしで配布
