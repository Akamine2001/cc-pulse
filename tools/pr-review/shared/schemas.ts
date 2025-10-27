import { z } from 'zod';

/**
 * レビュー問題の重要度
 */
export const ReviewSeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type ReviewSeverity = z.infer<typeof ReviewSeveritySchema>;

/**
 * レビュー根拠
 */
export const EvidenceItemSchema = z.object({
  file: z.string(),                    // ファイルパス（例: "serve.ts"）
  line: z.number(),                    // 行番号（例: 96）
  description: z.string(),             // この根拠が示すこと
  code_snippet: z.string().optional()  // コードスニペット（オプション）
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

/**
 * 個別のレビュー問題
 */
export const ReviewIssueSchema = z.object({
  severity: ReviewSeveritySchema,
  category: z.string(),
  description: z.string(),
  file_path: z.string().optional(),
  line_range: z.object({
    start: z.number(),
    end: z.number()
  }).optional(),
  impact: z.string(),
  suggestion: z.string(),
  evidence: z.array(EvidenceItemSchema).optional()  // 根拠（オプショナル）
});;

export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;

/**
 * レビュー統計情報
 */
export const ReviewStatsSchema = z.object({
  total_issues: z.number(),
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number()
});;

export type ReviewStats = z.infer<typeof ReviewStatsSchema>;

/**
 * PRレビュー結果全体
 */
export const ReviewResultSchema = z.object({
  issues: z.array(ReviewIssueSchema),
  summary: z.string(),
  stats: ReviewStatsSchema
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
  reasoning: z.string(),
  code_snippet: z.string().optional(),
  owner_mention_needed: z.boolean()
});;

export type IssueResolution = z.infer<typeof IssueResolutionSchema>;

/**
 * 既存のレビューコメント
 * GitHub APIから取得した過去のレビューコメント情報
 */
export interface ReviewComment {
  comment_id: number;
  file_path: string;
  line: number | null;
  category: string;
  severity: string;
  description: string;
  original_comment: string;
  created_at: string;
  updated_at: string;
  thread_id: string | null;
  is_resolved: boolean;
}
