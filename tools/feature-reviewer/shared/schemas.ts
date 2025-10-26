import { z } from 'zod';

/**
 * ファイル参照
 */
export const FileReferenceSchema = z.object({
  file: z.string(), // ファイルパス（例: "frontend.tsx"）
  line: z.number().optional(), // 行番号（例: 122）
  description: z.string(), // 説明（例: "ヘッダー表示部分"）
});

/**
 * レビュー観点のチェックリスト項目
 */
export const ReviewChecklistItemSchema = z.object({
  description: z.string(), // チェック項目（例: "ヘッダー表示の日本語化が完了しているか"）
  requirement: z.string().optional(), // 要件（例: "Issue #2「'AI-Powered...'」"）
  reference: z.string().optional(), // 参考（例: "frontend.tsx:386-388 のパターン"）
  reason: z.string().optional(), // 理由（例: "将来的に多言語対応..."）
});

/**
 * テスト観点のテストケース
 */
export const TestCaseSchema = z.object({
  description: z.string(), // テストケース（例: "18歳以上のユーザーは..."）
  requirement: z.string().optional(), // 要件参照
  verification: z.string().optional(), // 検証方法（例: "user-validator.ts:45 のロジック"）
  expected: z.string().optional(), // 期待結果
});

/**
 * ビジネスルール
 */
export const BusinessRuleSchema = z.object({
  title: z.string(), // ルール名（例: "年齢確認の表示条件"）
  description: z.string(), // 説明
  requirement: z.string().optional(), // 要件参照
  fileReferences: z.array(FileReferenceSchema), // 関連ファイル（空配列OK）
});

/**
 * MCPツールの出力スキーマ
 */
export const GuidelinesOutputSchema = z.object({
  // ビジネスルール（空配列OK）
  businessRules: z.array(BusinessRuleSchema),
  businessRulesAbsentReason: z.string().optional(), // 空の場合の理由

  // レビュー観点（各項目は空配列OK）
  reviewGuidelines: z.object({
    businessRules: z.array(ReviewChecklistItemSchema), // ビジネスルール観点
    businessRulesAbsentReason: z.string().optional(), // 空の場合の理由

    implementation: z.array(ReviewChecklistItemSchema), // 実装方針観点
    implementationAbsentReason: z.string().optional(), // 空の場合の理由

    additional: z.array(ReviewChecklistItemSchema), // 追加観点
    additionalAbsentReason: z.string().optional(), // 空の場合の理由
  }),

  // テスト観点（2カテゴリ + サブ分類）
  testGuidelines: z.object({
    // 新規/改修機能のテスト観点
    newFeature: z.object({
      normal: z.array(TestCaseSchema), // 正常系
      normalAbsentReason: z.string().optional(),
      edgeCase: z.array(TestCaseSchema), // 境界値
      edgeCaseAbsentReason: z.string().optional(),
      error: z.array(TestCaseSchema), // 異常系
      errorAbsentReason: z.string().optional(),
    }),
    newFeatureAbsentReason: z.string().optional(), // カテゴリ全体が空の場合の理由

    // デグレチェックのテスト観点
    regression: z.object({
      normal: z.array(TestCaseSchema), // 正常系
      normalAbsentReason: z.string().optional(),
      edgeCase: z.array(TestCaseSchema), // 境界値
      edgeCaseAbsentReason: z.string().optional(),
      error: z.array(TestCaseSchema), // 異常系
      errorAbsentReason: z.string().optional(),
    }),
    regressionAbsentReason: z.string().optional(), // カテゴリ全体が空の場合の理由
  }),
});

export type FileReference = z.infer<typeof FileReferenceSchema>;
export type ReviewChecklistItem = z.infer<typeof ReviewChecklistItemSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type BusinessRule = z.infer<typeof BusinessRuleSchema>;
export type GuidelinesOutput = z.infer<typeof GuidelinesOutputSchema>;
