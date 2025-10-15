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
