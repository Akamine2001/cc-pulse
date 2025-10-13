import { query } from '@anthropic-ai/claude-agent-sdk';
import { AGENT_NAMES } from '../constants/agent-names';
import { createOutputToolsServer } from './output-tools-server';
import { createEmbeddingMcpServer } from './embedding-mcp-server';
import { CCPulseDatetime } from '../utils/CCPulseDatetime';
import { getClaudeCodeExecutablePath } from '../utils/paths';
import type { DailyNewsData, FinalNewsItem } from '../schemas/news-schemas';

/**
 * News Agent - Master orchestrator for news collection
 * Based on Design 02: Master prompt with subagents
 */
export class NewsAgent {
  /**
   * Fetch news articles using multi-agent orchestration
   */
  async fetchNews(keywords: string[], targetCount: number): Promise<DailyNewsData> {
    const startTime = CCPulseDatetime.now();
    const oneWeekAgo = startTime.subDays(7);
    const todayDate = startTime.toDateString(); // YYYY-MM-DD
    const oneWeekAgoDate = oneWeekAgo.toDateString(); // YYYY-MM-DD

    const masterPrompt = `
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
`;

    // Get Claude Code executable path
    const claudeCodePath = getClaudeCodeExecutablePath();
    if (!claudeCodePath) {
      throw new Error(
        'Claude Code CLI not found. Please install it or set CLAUDE_PATH environment variable.\n' +
        'Install: https://docs.claude.com/en/docs/claude-code'
      );
    }

    const stream = query({
      prompt: masterPrompt,
      options: {
        pathToClaudeCodeExecutable: claudeCodePath,
        agents: {
          // 1. News Collector
          [AGENT_NAMES.NEWS_COLLECTOR]: {
            description: 'News collection specialist. Uses WebSearch/WebFetch to collect articles.',
            prompt: `You are a news collection specialist.

The orchestrator will provide you with specific keywords and target count for article collection.

IMPORTANT - Date Range Constraint:
- Today's date: ${todayDate}
- Only collect articles published between ${oneWeekAgoDate} and ${todayDate} (past 7 days)
- When using WebSearch, focus on recent news (use date filters if available)
- Verify that published_at falls within this date range

Task:
1. Use WebSearch to find recent news articles about the keywords (published within the past 7 days)
2. Use WebFetch to get full article content
3. For EACH article you find, BEFORE collecting it:
   a. Extract metadata (thumbnail_url, published_at)
   b. Extract site icon URL:
      - Use Google Favicon API: https://www.google.com/s2/favicons?domain={source_domain}&sz=64
      - If unavailable, set site_icon_url to null
   c. Generate summary (if not available)
   d. IMMEDIATELY call mcp__embedding__search_similar with the article summary
   d. CAREFULLY review the top 5 similar articles returned with their similarity scores
   e. Make a careful judgment: Is this article a duplicate or unique?

      Decision Guidelines:
      - If similarity >= 0.80 (80%): STRONGLY consider this a duplicate
      - If similarity 0.65-0.80: Carefully examine - could be same story or different angle
      - If similarity < 0.65: Likely unique

      BUT ALSO consider context:
      - Are the titles about the same specific event/announcement?
      - Do they reference the same companies, products, or research?
      - Are the publication dates within 1-2 days (same news cycle)?
      - Read the summary snippets - is it the same story?

      Make the final judgment based on BOTH similarity scores AND content analysis.

   f. If you judge it's a DUPLICATE:
      - IMMEDIATELY SKIP this article (do NOT collect it)
      - GO BACK to step 1 and search for a COMPLETELY DIFFERENT article
      - Try different search queries, sources, or angles
      - Document your reasoning (e.g., "Skipping: 0.89 similarity to existing Claude Sonnet 4.5 article")

   g. If you judge it's UNIQUE:
      - Keep this article for collection
      - Document your reasoning (e.g., "Collecting: Different angle despite 0.75 similarity")

4. Repeat steps 1-3 until you have collected exactly ${targetCount} UNIQUE articles
5. Call mcp__output__output_collected_news with the ${targetCount} unique articles

CRITICAL - Duplicate Detection Process:
- ALWAYS call mcp__embedding__search_similar BEFORE deciding to collect an article
- The tool returns results like: "1. [0.85] Claude 4 announcement, 2. [0.62] AI economics..."
- Similarity >= 0.80 is a STRONG indicator of duplicate - take it seriously
- But also read the titles/summaries in the results to confirm
- When in doubt about 0.75-0.85 similarity, lean toward SKIPPING (better safe than sorry)
- Only collect if you're confident it's a different story/angle

IMPORTANT - Keep Searching:
- If you skip a duplicate, IMMEDIATELY try a different search query
- Be persistent - you may need to check 10-20 articles to find ${targetCount} unique ones
- Vary your search terms, try different news sources
- Document your duplicate-skip decisions in your thinking

CRITICAL - Tool Input Format:
When calling mcp__output__output_collected_news, pass data as actual objects/arrays, NOT JSON strings:

{
  "articles": [
    {
      "title": "Article title",
      "content": "Full article content",
      "url": "https://example.com",
      "language": "en",
      "source_domain": "example.com",
      "fetched_at": "2025-10-04T09:00:00+09:00",
      "thumbnail_url": "https://example.com/image.jpg",
      "published_at": "2025-10-03T15:30:00+09:00",
      "site_icon_url": "https://www.google.com/s2/favicons?domain=example.com&sz=64"
    }
  ],
  "total_found": <number>,
  "keywords_used": ["keyword1", "keyword2"]
}

If thumbnail_url, published_at, or site_icon_url cannot be extracted, set them to null.
If you get an error, fix the format and retry immediately.`,
            tools: [
              'WebSearch',
              'WebFetch',
              'mcp__embedding__search_similar',
              'mcp__output__output_collected_news'
            ]
          },

          // 2. Translator
          [AGENT_NAMES.TRANSLATOR]: {
            description: 'Translation specialist. Translates articles to Japanese.',
            prompt: `You are a translation specialist.

Task:
1. Translate the given article to Japanese
2. Call mcp__output__output_translation tool with:
   {
     "title_ja": "Translated title",
     "content_ja": "Translated content",
     "original_language": "en"
   }

Keep the translation natural and accurate.`,
            tools: ['mcp__output__output_translation']
          },

          // 3. Duplicate Checker
          [AGENT_NAMES.DUPLICATE_CHECKER]: {
            description: 'Duplicate detection specialist. Checks for duplicates within today\'s collected articles.',
            prompt: `You are a duplicate detection specialist.

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

IMPORTANT: Keep thumbnail_url and published_at fields from the original articles.`,
            tools: ['mcp__output__output_duplicate_check']
          },

          // 4. Aggregator
          [AGENT_NAMES.AGGREGATOR]: {
            description: 'Final aggregation specialist. Generates summaries and organizes articles in Japanese.',
            prompt: `You are a final aggregation specialist for Japanese news delivery.

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
IMPORTANT: Always include thumbnail_url, published_at, and site_icon_url in the output (they can be null if not available).`,
            tools: ['mcp__output__output_aggregated_news']
          }
        },

        mcpServers: {
          'output': createOutputToolsServer(),
          'embedding': createEmbeddingMcpServer()
        },

        allowedTools: [
          'Task',
          'WebSearch',
          'WebFetch',
          'mcp__embedding__search_similar',
          'mcp__output__output_collected_news',
          'mcp__output__output_translation',
          'mcp__output__output_duplicate_check',
          'mcp__output__output_aggregated_news'
        ]
      }
    });

    // Process stream and extract results
    let aggregatedOutput: any = null;
    let iterations = 0;
    const pendingSimilarityChecks = new Map<string, string>(); // tool_use_id -> query_text

    for await (const message of stream) {
      // Log assistant thinking (text content)
      if (message?.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          // Log all thinking text
          if (block.type === 'text') {
            const text = (block as any).text;
            if (text && text.trim()) {
              console.log(`\n💭 [Agent Thinking]`);
              // Log full text (max 500 chars for readability)
              const displayText = text.length > 500 ? text.substring(0, 500) + '...' : text;
              console.log(`   ${displayText}`);
            }
          }

          // Log tool usage
          if (block.type === 'tool_use') {
            iterations++;
            const toolUse = block as any;

            // Log similarity search calls
            if (toolUse.name === 'mcp__embedding__search_similar') {
              console.log(`\n🔍 [Similarity Check ${iterations}]`);
              const queryText = toolUse.input?.query_text || '';
              console.log(`   Query: ${queryText.substring(0, 80)}...`);
              // Store for matching with result later
              pendingSimilarityChecks.set(toolUse.id, queryText);
            }

            // Capture final aggregated output
            if (toolUse.name === 'mcp__output__output_aggregated_news') {
              aggregatedOutput = toolUse.input;
            }
          }

          // Log tool results
          if (block.type === 'tool_result') {
            const toolResult = block as any;
            const toolUseId = toolResult.tool_use_id;

            // Check if this is a similarity search result
            if (pendingSimilarityChecks.has(toolUseId)) {
              const resultText = toolResult.content?.[0]?.text || '';
              console.log(`   Result:`);
              // Show first 10 lines
              const lines = resultText.split('\n').slice(0, 10);
              lines.forEach((line: string) => {
                if (line.trim()) console.log(`     ${line}`);
              });
              pendingSimilarityChecks.delete(toolUseId);
            }
          }
        }
      }

      // ALSO check user messages for tool results (SDK might send them separately)
      if (message?.type === 'user' && (message as any).message?.content) {
        for (const block of (message as any).message.content) {
          if (block.type === 'tool_result') {
            const toolResult = block as any;
            const toolUseId = toolResult.tool_use_id;

            if (pendingSimilarityChecks.has(toolUseId)) {
              const resultText = toolResult.content?.[0]?.text || '';
              console.log(`   Result:`);
              const lines = resultText.split('\n').slice(0, 10);
              lines.forEach((line: string) => {
                if (line.trim()) console.log(`     ${line}`);
              });
              pendingSimilarityChecks.delete(toolUseId);
            }
          }
        }
      }
    }

    // Build DailyNewsData
    const endTime = CCPulseDatetime.now();
    const duration = endTime.diff(startTime);

    // Add UUID to each article
    const newsWithIds = (aggregatedOutput?.news || []).map((article: any) => ({
      id: crypto.randomUUID(),
      ...article
    }));

    const dailyNews: DailyNewsData = {
      date: startTime.toDateString(),
      fetched_at: startTime.toISOString(),
      keywords,
      count: targetCount,
      news: newsWithIds,
      stats: {
        total_collected: aggregatedOutput?.stats?.total_collected || 0,
        unique_articles: aggregatedOutput?.stats?.unique_articles || 0,
        duplicate_removed: aggregatedOutput?.stats?.duplicate_removed || 0,
        iterations,
        duration_ms: duration
      },
      errors: []
    };

    return dailyNews;
  }
}
