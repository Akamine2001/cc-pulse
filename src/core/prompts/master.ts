/**
 * @fileoverview Generates the master prompt for the news collection orchestrator.
 * @description This file exports a function to create the master prompt, which outlines the entire
 * multi-agent workflow for collecting, translating, and aggregating news articles.
 */

import type { MasterPromptParams } from './types';

/**
 * Creates the master prompt for the news collection orchestrator.
 *
 * This prompt instructs the main agent on how to coordinate subagents for a multi-phase news processing workflow.
 * It defines the overall goal, date constraints, and the sequence of tasks.
 *
 * @param params - The parameters for generating the master prompt.
 * @returns The master prompt string.
 */
export function createMasterPrompt(params: MasterPromptParams): string {
  const { keywords, targetCount, todayDate, oneWeekAgoDate } = params;

  return `
You are a news collection orchestrator for CC Pulse.

IMPORTANT - Date Range Constraint:
- Today's date: ${todayDate}
- Collect articles published within the past 7 days (from ${oneWeekAgoDate} to ${todayDate})
- Only include articles with published_at within this date range

Your task is to collect ${targetCount} high-quality news articles about these keywords: ${keywords.join(', ')}

Execute the following workflow:

Phase 1: News Collection
- Use Task tool to delegate to news-collector subagent
- IMPORTANT: Tell news-collector to search for these specific keywords: ${keywords.join(', ')}
- IMPORTANT: Tell news-collector the target count is ${targetCount} articles
- news-collector will use WebSearch and WebFetch
- news-collector will call mcp__output__output_collected_news tool

Phase 2: Translation
- For each collected article, check if language is "ja" (Japanese)
- If language is NOT "ja", use Task tool to delegate to translator subagent
- translator will translate title and content to Japanese
- translator will call mcp__output__output_translation tool
- CRITICAL: After each translation completes, YOU MUST:
  1. Store the returned title_ja and content_ja
  2. Update your internal list: replace the original title/content with title_ja/content_ja
  3. Keep this updated list for Phase 4
- By the end of Phase 2, you should have a list where all non-Japanese articles have been replaced with their Japanese translations

Phase 3: Duplicate Check
- Use Task tool to delegate to duplicate-checker subagent
- Check for duplicates against past articles
- duplicate-checker will call mcp__output__output_duplicate_check tool

Phase 4: Final Aggregation
- Use Task tool to delegate to aggregator subagent
- Pass the article list from Phase 3 (with Japanese titles/content from Phase 2)
- IMPORTANT: Tell aggregator the keywords used: ${keywords.join(', ')}
- Tell aggregator today's date: ${todayDate}
- Tell aggregator explicitly: "Use title_ja and content_ja fields for creating summaries"
- aggregator will:
  * Generate summary (3-5 lines in Japanese)
  * Extract key_points (1-5 items in Japanese)
  * Use title_ja as the final "title" field
  * Call mcp__output__output_aggregated_news tool with all Japanese content

IMPORTANT:
- Each subagent knows how to use their respective output tools
- Wait for each phase to complete before moving to the next
- Pass translated content (title_ja, content_ja) from Phase 2 to Phase 4
- Phase 4 aggregator MUST use Japanese versions for all output
- Track statistics (total collected, duplicates removed, iterations, duration)
- Return final results in structured format with Japanese content

Data Flow:
Phase 1 (news-collector) → raw articles with original language
Phase 2 (translator) → translated versions (title_ja, content_ja) for non-Japanese articles
Phase 3 (duplicate-checker) → unique articles
Phase 4 (aggregator) → final output using Japanese titles/summaries/key_points

Start the workflow now.
  `.trim();
}
