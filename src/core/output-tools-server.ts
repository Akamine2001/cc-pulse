import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import {
  RawArticleSchema,
  TranslationResultSchema,
  DuplicateCheckResultSchema,
  FinalNewsItemSchema,
  NewsCollectionResultSchema,
  ExecutionStatsSchema
} from '../schemas/news-schemas';

/**
 * Create MCP server with structured output tools for subagents
 * Each tool enforces schema validation for agent outputs
 */
export function createOutputToolsServer() {
  // 1. news-collector output tool
  const outputCollectedNews = tool(
    'output_collected_news',
    'Output collected news articles with validation. Input must be an array of article objects with proper structure.',
    {
      articles: z.array(RawArticleSchema),
      total_found: z.number().nonnegative(),
      keywords_used: z.array(z.string().min(1))
    },
    async (args) => {
      // Validation is automatic - if we reach here, schema is valid
      console.log(`[output_collected_news] ✅ Validated ${args.articles.length} articles`);
      return {
        content: [{
          type: 'text' as const,
          text: `Successfully validated and stored ${args.articles.length} articles using RawArticleSchema.`
        }]
      };
    }
  );

  // 2. translator output tool
  const outputTranslation = tool(
    'output_translation',
    'Output translation result with validation. Input: title_ja, content_ja, original_language',
    TranslationResultSchema.shape,
    async (args) => {
      console.log(`[output_translation] ✅ Validated translation from ${args.original_language}`);
      return {
        content: [{
          type: 'text' as const,
          text: `Successfully validated translation from ${args.original_language} using TranslationResultSchema.`
        }]
      };
    }
  );

  // 3. duplicate-checker output tool
  const outputDuplicateCheck = tool(
    'output_duplicate_check',
    'Output duplicate check result with validation. Input: unique_articles (array), duplicate_count, total_checked',
    {
      unique_articles: z.array(FinalNewsItemSchema.omit({ id: true })),
      duplicate_count: z.number().nonnegative(),
      total_checked: z.number().nonnegative()
    },
    async (args) => {
      console.log(`[output_duplicate_check] ✅ ${args.unique_articles.length} unique, ${args.duplicate_count} duplicates`);
      return {
        content: [{
          type: 'text' as const,
          text: `Found ${args.unique_articles.length} unique articles (${args.duplicate_count} duplicates removed) using FinalNewsItemSchema.`
        }]
      };
    }
  );

  // 4. aggregator output tool (final output)
  const outputAggregatedNews = tool(
    'output_aggregated_news',
    'Output final aggregated news with validation. Input: date, news (array), stats (object)',
    {
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      news: z.array(FinalNewsItemSchema.omit({ id: true })),
      stats: ExecutionStatsSchema
    },
    async (args) => {
      const newsCount = args.news?.length || 0;
      console.log(`[output_aggregated_news] ✅ Final output: ${newsCount} articles`);
      return {
        content: [{
          type: 'text' as const,
          text: `Successfully validated ${newsCount} final news items using FinalNewsItemSchema and ExecutionStatsSchema.\n\n${JSON.stringify(args, null, 2)}`
        }]
      };
    }
  );

  // Create MCP server with all output tools
  return createSdkMcpServer({
    name: 'output',
    version: '1.0.0',
    tools: [
      outputCollectedNews,
      outputTranslation,
      outputDuplicateCheck,
      outputAggregatedNews
    ]
  });
}
