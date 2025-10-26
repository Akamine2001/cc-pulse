# 親Issueの分析とレビュー・テスト観点の作成

以下のIssueについて、レビュー観点とテスト観点を作成してください。

## 親Issue情報

**Issue番号**: #{{ISSUE_NUMBER}}
**タイトル**: {{ISSUE_TITLE}}

**本文**:
```
{{ISSUE_BODY}}
```

---

## ⚠️ 重要な原則

### 🚫 推測での記載は絶対禁止

**すべての記載は、以下のいずれかに基づいてください**:
1. ✅ 親Issueに明記されている要件
2. ✅ Serena MCPで実際に読み取ったコード
3. ✅ ファイルに記載されている具体的な実装

**❌ 以下は禁止**:
- 「おそらく〜」「〜と思われる」といった推測
- コードを読まずに「〜すべき」と記載
- ファイル・行番号を確認せずに「〜を参考」と記載

---

## 作業手順

### ステップ1: 親Issueの理解

親Issueの内容を分析し、以下を抽出してください：

**抽出項目**:
- 要件: 何を実装/修正するか
- 目的: なぜそれが必要か
- 対象ファイル: どのファイルを変更するか（記載があれば）
- 対象行番号: どの箇所を変更するか（記載があれば）

**例**:
```
親Issue: "frontend.tsx の122行目のヘッダーを日本語化"
↓
要件: ヘッダー表示を「AIニュース収集ツール」に変更
対象ファイル: frontend.tsx
対象行番号: 122
```

---

### ステップ2: Serena MCPでコード分析

#### 2-1. 対象ファイルの読み込み

親Issueに記載されたファイルを`read_file`で読み込んでください。

**例**:
```
親Issueで "frontend.tsx:122" が指定されている場合
↓
read_file("src/templates/frontend.tsx")
↓
122行目の内容を確認: "AI-Powered News Aggregator"
```

#### 2-2. 類似パターンの検索

`search_for_pattern`で類似する実装パターンを探してください。

**検索すべきパターン**:
- 同じ種類の処理（例: 他の文字列定義、他のボタン実装）
- 同じコンポーネント内の実装（例: 同じフォーム内の他のフィールド）

**例**:
```
日本語化Issueの場合:
↓
search_for_pattern で frontend.tsx 内の他の日本語文字列を検索
↓
発見: 237行目に「読み込み中...」という日本語文字列あり
↓
レビュー観点に追加: "237行目のパターンと統一されているか"
```

#### 2-3. 影響範囲の確認

`find_referencing_symbols`で呼び出し元を追跡してください。

**⚠️ 重要な制限: 最大7階層まで**

関連ファイルの追跡は**最大7階層まで**としてください。
それ以上深く追跡すると、分析が複雑になりすぎて時間がかかります。

**階層のカウント方法**:
```
階層0: 親Issueで指定されたファイル（例: frontend.tsx）
階層1: frontend.tsx が直接インポートしているファイル
階層2: 階層1のファイルがインポートしているファイル
...
階層7: 階層6のファイルがインポートしているファイル

→ 階層7で停止
```

**確認すべき内容**:
- 対象関数/変数がどこで使われているか（7階層以内）
- 関連するデータベーススキーマ
- 関連するAPI仕様

**例**:
```
validateUser() 関数を変更する場合:
↓
find_referencing_symbols("validateUser", "src/core/user-validator.ts")
↓
発見: register.ts:89 で呼び出されている（階層1）
↓
register.ts の呼び出し元を確認
↓
発見: api/user-api.ts:45 で呼び出されている（階層2）
↓
（この調査を階層7まで継続）
↓
テスト観点に追加: 各階層の呼び出し元で正常動作するか
```

**7階層を超えた場合**:
- それ以上の追跡は**停止**してください
- レビュー観点に「より深い影響範囲は手動確認が必要」と記載
- 7階層以内の情報のみで観点を作成

#### 2-4. ビジネスルールの抽出

**以下のコードパターンを探してください**:
- ✅ 条件分岐（if, switch, 三項演算子）
- ✅ バリデーション（チェック処理、エラー判定）
- ✅ 状態遷移（フラグ変更、ステータス更新）
- ✅ 計算ロジック（料金計算、集計処理）

**例**:
```typescript
// 発見したコード: user-validator.ts:45
if (user.age < 18) {
  throw new Error("18歳未満は登録不可");
}

↓ ビジネスルールとして抽出:

{
  "title": "年齢制限ルール",
  "description": "18歳未満のユーザーは登録不可",
  "requirement": "Issue #123「保護者同意で登録可能にする」と矛盾",
  "fileReferences": [
    {
      "file": "user-validator.ts",
      "line": 45,
      "description": "年齢チェック処理"
    }
  ]
}
```

---

### ステップ3: レビュー観点の生成

#### 3-1. ビジネスルール観点

**親Issueの要件を軸に記載**:

✅ **良い例（具体的）**:
```json
{
  "description": "年齢による表示条件が正しく実装されているか",
  "requirement": "Issue #123「18歳未満のユーザーには表示」",
  "reference": "user-validator.ts:45 の年齢チェックロジックとの整合性"
}
```

❌ **悪い例（推測・曖昧）**:
```json
{
  "description": "年齢チェックが適切に実装されているか",
  // ← "適切"が曖昧、何を基準に判断？
  "requirement": "Issue #123",
  // ← 要件の具体的な内容がない
  "reference": "既存のバリデーションロジック"
  // ← どのファイルの何行目？
}
```

#### 3-2. 実装方針観点

**類似コードを具体的に参照**:

✅ **良い例（具体的）**:
```json
{
  "description": "ツールチップの実装方法が既存パターンと一致しているか",
  "reference": "frontend.tsx:386-388 の title属性パターン",
  "reason": "UIの一貫性を保つため"
}
```

❌ **悪い例（推測・曖昧）**:
```json
{
  "description": "コードスタイルが統一されているか",
  // ← どのスタイル？何を確認？
  "reference": "既存コード"
  // ← どのファイル？
}
```

#### 3-3. 追加観点（親Issueに書いていない観点）

**間接的な影響を検知した場合のみ記載**:

✅ **良い例（実際に発見した影響）**:
```json
{
  "description": "App.tsx でも同様の英語表示パターンがないか確認",
  "reference": "App.tsx:45 で同じヘッダーコンポーネントを使用",
  "reason": "同じUIパターンで表記が統一されていない可能性"
}
```

❌ **悪い例（推測）**:
```json
{
  "description": "他のコンポーネントにも英語が残っていないか確認",
  // ← "他のコンポーネント"が曖昧、具体的にどこ？
  // ← コードを読んで実際に発見したのか？
}
```

---

### ステップ4: テスト観点の生成

テスト観点は**2つのカテゴリ**に分類されます：

1. **新規/改修機能のテスト**: 親Issueの要件そのもののテスト
2. **デグレチェック**: 既存機能への影響確認

各カテゴリは**正常系・境界値・異常系**のサブカテゴリを持ちます。

#### 4-1. 新規/改修機能のテスト

**親Issueの要件に基づいて作成**:

✅ **良い例（要件ベース）**:
```json
{
  "normal": [
    {
      "description": "18歳未満で年齢確認未実施の場合、チェックボックスが表示される",
      "requirement": "Issue #123「18歳未満のユーザーには年齢確認チェックボックスを表示」",
      "verification": "user-validator.ts:45 のロジックと連動"
    }
  ],
  "edgeCase": [
    {
      "description": "17歳、18歳、19歳でそれぞれ正しく動作する",
      "verification": "user-validator.ts:45 の判定基準（age < 18）",
      "expected": "17歳: 表示、18歳: 非表示、19歳: 非表示"
    }
  ],
  "error": [
    {
      "description": "年齢が不正な値（null, 負数）の場合、エラーが表示される",
      "verification": "user-validator.ts:50 のバリデーション処理"
    }
  ]
}
```

#### 4-2. デグレチェック

**実際に影響を受ける箇所を特定**:

✅ **良い例（影響範囲ベース）**:
```json
{
  "normal": [
    {
      "description": "18歳以上のユーザーは従来通り登録できる（チェックボックス非表示）",
      "verification": "user-validator.ts:45 の年齢チェックロジック",
      "expected": "既存の動作が変わらないこと"
    }
  ],
  "edgeCase": [],
  "edgeCaseAbsentReason": "年齢チェック変更は新規機能のみで既存の境界値条件は変更されないため",
  "error": []
}
```

❌ **悪い例（推測）**:
```json
{
  "normal": [
    {
      "description": "既存機能が壊れていないことを確認"
      // ← "既存機能"が曖昧、具体的に何？
    }
  ]
}
```

---

### ステップ5: 観点がない場合の対応

**観点が不要と判断した場合**:
1. 該当する配列を空にする
2. `AbsentReason`フィールドに**具体的な理由**を記載

✅ **良い例（具体的な理由）**:
```json
{
  "businessRules": [],
  "businessRulesAbsentReason": "単純なタイポ修正（README.md の 'speling' → 'spelling'）のため、ビジネスロジックの変更はありません"
}
```

❌ **悪い例（曖昧な理由）**:
```json
{
  "businessRules": [],
  "businessRulesAbsentReason": "該当なし"
  // ← なぜ該当しないのか理由が不明
}
```

---

## 出力形式

`create_review_guidelines` MCPツールを使用して、以下の構造で出力してください。

```typescript
{
  businessRules: [
    {
      title: "ルール名",
      description: "説明",
      requirement: "Issue #XXX「〇〇」",  // ← Issue番号と具体的な要件
      fileReferences: [
        {
          file: "ファイル名",
          line: 123,                      // ← 具体的な行番号
          description: "説明"
        }
      ]
    }
  ],
  businessRulesAbsentReason: "理由",      // ← 空の場合のみ

  reviewGuidelines: {
    businessRules: [
      {
        description: "チェック項目",
        requirement: "Issue #XXX「〇〇」",
        reference: "file.ts:123 の〇〇",  // ← 具体的なファイル:行番号
        reason: "理由"
      }
    ],
    businessRulesAbsentReason: "理由",

    implementation: [...],
    implementationAbsentReason: "理由",

    additional: [...],
    additionalAbsentReason: "理由"
  },

  testGuidelines: {
    newFeature: {
      normal: [...],           // 正常系
      normalAbsentReason: "理由",
      edgeCase: [...],         // 境界値
      edgeCaseAbsentReason: "理由",
      error: [...],            // 異常系
      errorAbsentReason: "理由"
    },
    newFeatureAbsentReason: "理由",  // カテゴリ全体が空の場合

    regression: {
      normal: [...],           // 正常系
      normalAbsentReason: "理由",
      edgeCase: [...],         // 境界値
      edgeCaseAbsentReason: "理由",
      error: [...],            // 異常系
      errorAbsentReason: "理由"
    },
    regressionAbsentReason: "理由"   // カテゴリ全体が空の場合
  }
}
```

---

## チェックリスト

出力前に以下を確認してください：

- [ ] すべての記載が親Issue・コード・ファイルに基づいているか
- [ ] 推測・憶測での記載がないか
- [ ] ファイル名・行番号が具体的に記載されているか
- [ ] 「〜すべき」「適切に」などの曖昧な表現がないか
- [ ] AbsentReasonに具体的な理由が記載されているか（空配列の場合）

**推測での記載は絶対に避けてください。不明な場合は、Serena MCPで必ずコードを確認してください。**
