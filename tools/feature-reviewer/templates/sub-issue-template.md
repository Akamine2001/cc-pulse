<!-- parent-issue: #{{PARENT_ISSUE_NUMBER}} -->
> このIssueは #{{PARENT_ISSUE_NUMBER}} の実装時に参照するレビュー・テスト観点です

---

## 📋 ビジネスルール

{{BUSINESS_RULES}}

---

<!-- REVIEW_GUIDELINES_START -->
## 🔍 レビュー観点

**用途**: PR自動レビューで使用

### ビジネスルール

{{REVIEW_BUSINESS_RULES}}

### 実装方針

{{REVIEW_IMPLEMENTATION}}

### 親Issueに書いていない確認観点

{{REVIEW_ADDITIONAL}}

<!-- REVIEW_GUIDELINES_END -->

---

<!-- TEST_GUIDELINES_START -->
## ✅ テスト観点

**用途**: PR Approve後の開発環境/検証環境でのテスト

### 新規/改修機能のテスト
**目的**: 親Issue #{{PARENT_ISSUE_NUMBER}} の要件が正しく実装されているか確認

#### 正常系

{{TEST_NEW_FEATURE_NORMAL}}

#### 境界値

{{TEST_NEW_FEATURE_EDGE_CASE}}

#### 異常系

{{TEST_NEW_FEATURE_ERROR}}

### デグレチェック
**目的**: 既存機能が影響を受けずに動作するか確認

#### 正常系

{{TEST_REGRESSION_NORMAL}}

#### 境界値

{{TEST_REGRESSION_EDGE_CASE}}

#### 異常系

{{TEST_REGRESSION_ERROR}}

<!-- TEST_GUIDELINES_END -->
