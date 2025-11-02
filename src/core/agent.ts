import { query } from '@anthropic-ai/claude-agent-sdk';
import { AGENT_NAMES } from '../constants/agent-names';
import { createOutputToolsServer } from './output-tools-server';
import { createEmbeddingMcpServer } from './embedding-mcp-server';
import { CCPulseDatetime } from '../utils/CCPulseDatetime';
import { getClaudeCodeExecutablePath } from '../utils/paths';
import type { DailyNewsData } from '../schemas/news-schemas';
import {
  createMasterPrompt,
  createNewsCollectorPrompt,
  createTranslatorPrompt,
  createDuplicateCheckerPrompt,
  createAggregatorPrompt
} from './prompts';

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

    const masterPrompt = createMasterPrompt({
      keywords,
      targetCount,
      todayDate,
      oneWeekAgoDate
    });

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
            prompt: createNewsCollectorPrompt({
              todayDate,
              oneWeekAgoDate,
              targetCount
            }),
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
            prompt: createTranslatorPrompt({}),
            tools: ['mcp__output__output_translation']
          },

          // 3. Duplicate Checker
          [AGENT_NAMES.DUPLICATE_CHECKER]: {
            description: 'Duplicate detection specialist. Checks for duplicates within today\'s collected articles.',
            prompt: createDuplicateCheckerPrompt({}),
            tools: ['mcp__output__output_duplicate_check']
          },

          // 4. Aggregator
          [AGENT_NAMES.AGGREGATOR]: {
            description: 'Final aggregation specialist. Generates summaries and organizes articles in Japanese.',
            prompt: createAggregatorPrompt({
              keywords,
              todayDate
            }),
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
