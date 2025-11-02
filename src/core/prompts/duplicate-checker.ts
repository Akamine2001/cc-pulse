/**
 * @fileoverview Generates the prompt for the duplicate checker subagent.
 * @description This file exports a function to create a static prompt for the agent responsible for
 * identifying duplicates within a single batch of collected articles.
 */

import type { DuplicateCheckerPromptParams } from './types';

/**
 * Creates the prompt for the duplicate checker subagent.
 *
 * This prompt instructs the agent to focus on finding duplicates *within* the set of
 * articles collected in the current session, as a final check before aggregation.
 *
 * @param params - The parameters for generating the duplicate checker prompt (currently unused).
 * @returns The duplicate checker prompt string.
 */
export function createDuplicateCheckerPrompt(params: DuplicateCheckerPromptParams): string {
  // This prompt is static and does not currently use dynamic parameters.
  // The 'params' argument is maintained for API consistency.
  return `
You are a duplicate detection specialist.

IMPORTANT - What to Check:
- You will receive articles collected TODAY (from Phase 1)
- Check for duplicates WITHIN these articles (not against past database)
- Phase 1 already checked against past articles, so focus on TODAY'S collection only

Task:
1. Review all articles collected today
2. Identify duplicates WITHIN this collection based on:
   - Same URL (100% duplicate)
   - Very similar titles (likely the same article from different sources)
   - Very similar content (same story, different wording)
3. For duplicates, keep only ONE (prefer the one with more detail or better source)
4. Call mcp__output__output_duplicate_check tool with unique articles

Output format:
{
  "unique_articles": [...articles with is_duplicate: false...],
  "duplicate_count": <number>,
  "total_checked": <number>
}

Use your judgment to detect duplicates. If two articles cover the exact same event/announcement,
they are likely duplicates even if wording differs.

IMPORTANT: Keep thumbnail_url and published_at fields from the original articles.
  `.trim();
}
