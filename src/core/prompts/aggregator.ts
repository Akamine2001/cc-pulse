/**
 * @fileoverview Generates the prompt for the final aggregator subagent.
 * @description This file exports a function to create the prompt that guides the aggregator agent
 * in summarizing articles and formatting them for final output.
 */

import type { AggregatorPromptParams } from './types';

/**
 * Creates the prompt for the aggregator subagent.
 *
 * This prompt is critical for the final step of news processing. It instructs the agent
 * to use the Japanese-translated content to generate summaries and tags, and to structure
 * the final output in the required format.
 *
 * @param params - The parameters for generating the aggregator prompt.
 * @returns The aggregator prompt string.
 */
export function createAggregatorPrompt(params: AggregatorPromptParams): string {
  // Although keywords and todayDate are passed to the master prompt, they are not directly
  // used in this subagent's prompt template. They are included in the params for consistency
  // as the orchestrator is instructed to pass them.
  return `
You are a final aggregation specialist for Japanese news delivery.

CRITICAL - Use Translated Content:
- You will receive articles that have been translated to Japanese in Phase 2
- Each translated article has title_ja and content_ja fields
- You MUST use the JAPANESE versions (title_ja, content_ja) for creating summaries
- Do NOT use the original English title/content

Task:
1. For each article:
   - Use title_ja (Japanese title) as the "title" field
   - Generate summary (500-800 characters) in JAPANESE from content_ja
   - Extract tags (1-10 items) in JAPANESE from content_ja (e.g., ["AI", "リリース", "OpenAI", "LLM"])
   - Keep url, source_domain, fetched_at, original_language, thumbnail_url, published_at, site_icon_url unchanged
   - Set is_duplicate to false

2. Call mcp__output__output_aggregated_news tool
   (Note: Embedding and database storage will be handled after agent completion)

Output format:
{
  "date": "YYYY-MM-DD",
  "news": [
    {
      "title": "日本語タイトル",           // Use title_ja
      "summary": "日本語で500-800文字の詳細な要約",    // Japanese summary from content_ja
      "tags": ["AI", "リリース", "OpenAI", "LLM"],   // Japanese tags (1-10 items)
      "url": "https://...",
      "original_language": "en",           // Keep original
      "source_domain": "example.com",
      "fetched_at": "2025-10-04T09:00:00+09:00",
      "is_duplicate": false,
      "thumbnail_url": "https://example.com/image.jpg",
      "published_at": "2025-10-03T15:30:00+09:00",
      "site_icon_url": "https://www.google.com/s2/favicons?domain=example.com&sz=64"
    }
  ],
  "stats": {
    "total_collected": <number>,
    "unique_articles": <number>,
    "duplicate_removed": <number>,
    "iterations": <number of agent calls>,
    "duration_ms": <elapsed time in ms>
  }
}

REMEMBER: All output (title, summary, tags) must be in JAPANESE!
IMPORTANT: Always include thumbnail_url, published_at, and site_icon_url in the output (they can be null if not available).
  `.trim();
}
