import { z } from 'zod';
import { CCPulseDatetime } from '../utils/CCPulseDatetime';
import { SupportedLanguageSchema } from './language-codes';

// ===========================
// Custom Zod Schemas
// ===========================

/**
 * ISO 8601 datetime string schema
 * Validates and can be converted to CCPulseDatetime
 */
export const DatetimeSchema = z.string().refine(
  (val) => {
    try {
      new CCPulseDatetime(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Invalid ISO 8601 datetime string' }
);

/**
 * Domain name schema (e.g., "example.com", "news.example.co.jp")
 */
export const DomainSchema = z.string().regex(
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
  { message: 'Invalid domain name format' }
);

/**
 * Semantic version schema (e.g., "1.0.0", "2.1.3")
 */
export const SemanticVersionSchema = z.string().regex(
  /^\d+\.\d+\.\d+$/,
  { message: 'Invalid semantic version format (expected: X.Y.Z)' }
);


// ===========================
// News Article Schemas
// ===========================

/**
 * Raw collected article (before translation and summarization)
 */
export const RawArticleSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  url: z.string().url(),
  language: SupportedLanguageSchema,
  source_domain: DomainSchema,
  fetched_at: DatetimeSchema,
  thumbnail_url: z.string().url().nullable(),
  published_at: DatetimeSchema.nullable(),
  site_icon_url: z.string().url().nullable()
});

export type RawArticle = z.infer<typeof RawArticleSchema>;

/**
 * Translation result
 */
export const TranslationResultSchema = z.object({
  title_ja: z.string().min(1),
  content_ja: z.string().min(1),
  original_language: SupportedLanguageSchema
});

export type TranslationResult = z.infer<typeof TranslationResultSchema>;

/**
 * Summary result
 */
export const SummaryResultSchema = z.object({
  summary: z.string().min(500).max(800),
  tags: z.array(z.string().min(1)).min(1).max(10)
});

export type SummaryResult = z.infer<typeof SummaryResultSchema>;

/**
 * Duplicate check result
 */
export const DuplicateCheckResultSchema = z.object({
  is_duplicate: z.boolean(),
  similarity_score: z.number().min(0).max(1).optional(),
  matched_article_id: z.string().optional()
});

export type DuplicateCheckResult = z.infer<typeof DuplicateCheckResultSchema>;

/**
 * Final news item (for storage)
 * Note: is_good is managed in SQLite, not in JSON files
 */
export const FinalNewsItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string().min(500).max(800),
  tags: z.array(z.string().min(1)).min(1).max(10),
  url: z.string().url(),
  original_language: SupportedLanguageSchema,
  source_domain: DomainSchema,
  fetched_at: DatetimeSchema,
  is_duplicate: z.boolean(),
  thumbnail_url: z.string().url().nullable(),
  published_at: DatetimeSchema.nullable(),
  site_icon_url: z.string().url().nullable()
});

export type FinalNewsItem = z.infer<typeof FinalNewsItemSchema>;

/**
 * フィードバック情報を含むニュース記事
 * WebUI表示用
 */
export interface FinalNewsItemWithFeedback extends FinalNewsItem {
  is_good: number | null;  // 1: good, 0: bad, null: 未評価
}

/**
 * Execution statistics
 */
export const ExecutionStatsSchema = z.object({
  total_collected: z.number().nonnegative(),
  unique_articles: z.number().nonnegative(),
  duplicate_removed: z.number().nonnegative(),
  iterations: z.number().nonnegative(),
  duration_ms: z.number().nonnegative()
});

export type ExecutionStats = z.infer<typeof ExecutionStatsSchema>;

/**
 * Daily news data (for JSON storage)
 */
export const DailyNewsDataSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  fetched_at: DatetimeSchema,
  keywords: z.array(z.string().min(1)).min(1).max(10),
  count: z.number().positive(),
  news: z.array(FinalNewsItemSchema),
  stats: ExecutionStatsSchema,
  errors: z.array(z.object({
    message: z.string().min(1),
    timestamp: DatetimeSchema
  }))
});

export type DailyNewsData = z.infer<typeof DailyNewsDataSchema>;

/**
 * News collection result (for Agent return)
 */
export const NewsCollectionResultSchema = z.object({
  articles: z.array(RawArticleSchema),
  total_found: z.number().nonnegative(),
  keywords_used: z.array(z.string().min(1)).min(1).max(10)
});

export type NewsCollectionResult = z.infer<typeof NewsCollectionResultSchema>;
