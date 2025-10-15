import { z } from 'zod';

/**
 * レビュー問題の重要度
 */
export const ReviewSeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type ReviewSeverity = z.infer<typeof ReviewSeveritySchema>;

/**
 * 個別のレビュー問題
 */
export const ReviewIssueSchema = z.object({
  severity: ReviewSeveritySchema,
  category: z.string().describe('問題のカテゴリ（デグレーション、パフォーマンス、セキュリティ、規約、型安全性など）'),
  description: z.string().describe('問題の説明'),
  file_path: z.string().optional().describe('該当ファイルのパス'),
  line_range: z.object({
    start: z.number(),
    end: z.number()
  }).optional().describe('該当行の範囲'),
  impact: z.string().describe('影響範囲'),
  suggestion: z.string().describe('推奨対応')
});

export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;

/**
 * レビュー統計情報
 */
export const ReviewStatsSchema = z.object({
  total_issues: z.number().describe('問題の総数'),
  critical: z.number().describe('重大な問題の数'),
  high: z.number().describe('重要な問題の数'),
  medium: z.number().describe('中程度の問題の数'),
  low: z.number().describe('軽微な問題の数')
});

export type ReviewStats = z.infer<typeof ReviewStatsSchema>;

/**
 * PRレビュー結果全体
 */
export const ReviewResultSchema = z.object({
  issues: z.array(ReviewIssueSchema).describe('検出された問題のリスト'),
  summary: z.string().describe('レビューの総評'),
  stats: ReviewStatsSchema.describe('統計情報')
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

/**
 * 修正判定のステータス
 */
export const ResolutionStatusSchema = z.enum([
  'fixed',                    // 修正済み
  'todo_added',               // TODO記載
  'needs_decision',           // 方針質問
  'implementation_changed',   // 実装が大幅に変更され、前回の指摘が無効
  'not_fixed'                 // 未修正
]);;

export type ResolutionStatus = z.infer<typeof ResolutionStatusSchema>;

/**
 * 問題の修正判定結果
 */
export const IssueResolutionSchema = z.object({
  status: ResolutionStatusSchema,
  reasoning: z.string().describe('判定理由'),
  code_snippet: z.string().optional().describe('該当コード（証拠）'),
  owner_mention_needed: z.boolean().describe('オーナーメンションが必要か')
});

export type IssueResolution = z.infer<typeof IssueResolutionSchema>;
