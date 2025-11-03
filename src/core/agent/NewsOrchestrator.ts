import { CCPulseDatetime } from '../../utils/CCPulseDatetime';
import { AgentExecutionError, NewsCollectionError } from './errors';
import { NewsAgentWrapper } from './NewsAgentWrapper';
import { ResultCaptor } from './ResultCaptor';
import { NewsResultBuilder } from './NewsResultBuilder';
import { createOutputToolsServer } from '../output-tools-server';
import { createEmbeddingMcpServer } from '../embedding-mcp-server';
import {
  createMasterPrompt,
  createNewsCollectorPrompt,
  createTranslatorPrompt,
  createDuplicateCheckerPrompt,
  createAggregatorPrompt,
} from '../prompts';
import { AGENT_NAMES } from '../../constants/agent-names';
import type { DailyNewsData } from '../../schemas/news-schemas';
import type { NewsAgentConfig } from './types';

/**
 * ニュース収集プロセス全体を統括するオーケストレーター
 *
 * NewsAgentWrapper, ResultCaptor, NewsResultBuilderを組み合わせて、
 * ニュースの収集、結果のキャプチャ、最終的なデータ構築までの一連の流れを管理する。
 *
 * 既存の NewsAgent クラスの責務を分割し、置き換えることを目的とする。
 */
export class NewsOrchestrator {
  private wrapper: NewsAgentWrapper;
  private captor: ResultCaptor;
  private builder: NewsResultBuilder;

  /**
   * NewsOrchestratorを初期化
   */
  constructor() {
    const agentConfig: NewsAgentConfig = {
      mcpServers: {
        output: createOutputToolsServer(),
        embedding: createEmbeddingMcpServer(),
      },
      allowedTools: [
        'Task',
        'WebSearch',
        'WebFetch',
        'mcp__embedding__search_similar',
        'mcp__output__output_collected_news',
        'mcp__output__output_translation',
        'mcp__output__output_duplicate_check',
        'mcp__output__output_aggregated_news',
      ],
    };

    this.wrapper = new NewsAgentWrapper(agentConfig);
    this.captor = new ResultCaptor();
    this.builder = new NewsResultBuilder();
  }

  /**
   * キーワードと目標件数に基づいてニュース記事を収集・整形する
   * @param keywords 検索キーワード
   * @param targetCount 目標記事数
   * @returns 収集・整形されたDailyNewsData
   */
  async fetchNews(keywords: string[], targetCount: number): Promise<DailyNewsData> {
    const startTime = CCPulseDatetime.now();
    const oneWeekAgo = startTime.subDays(7);
    const todayDate = startTime.toDateString();
    const oneWeekAgoDate = oneWeekAgo.toDateString();

    const masterPrompt = createMasterPrompt({
      keywords,
      targetCount,
      todayDate,
      oneWeekAgoDate,
    });

    const agents = {
      [AGENT_NAMES.NEWS_COLLECTOR]: {
        description: 'News collection specialist. Uses WebSearch/WebFetch to collect articles.',
        prompt: createNewsCollectorPrompt({ todayDate, oneWeekAgoDate, targetCount }),
        tools: ['WebSearch', 'WebFetch', 'mcp__embedding__search_similar', 'mcp__output__output_collected_news'],
      },
      [AGENT_NAMES.TRANSLATOR]: {
        description: 'Translation specialist. Translates articles to Japanese.',
        prompt: createTranslatorPrompt({}),
        tools: ['mcp__output__output_translation'],
      },
      [AGENT_NAMES.DUPLICATE_CHECKER]: {
        description: 'Duplicate detection specialist. Checks for duplicates within today\'s collected articles.',
        prompt: createDuplicateCheckerPrompt({}),
        tools: ['mcp__output__output_duplicate_check'],
      },
      [AGENT_NAMES.AGGREGATOR]: {
        description: 'Final aggregation specialist. Generates summaries and organizes articles in Japanese.',
        prompt: createAggregatorPrompt({ keywords, todayDate }),
        tools: ['mcp__output__output_aggregated_news'],
      },
    };

    try {
      await this.wrapper.execute({
        prompt: masterPrompt,
        agents,
        onToolUse: this.captor.handleToolCall.bind(this.captor),
        onText: (text: string) => {
          if (text && text.trim()) {
            console.log(`\n💭 [Agent Thinking]`);
            const displayText = text.length > 500 ? text.substring(0, 500) + '...' : text;
            console.log(`   ${displayText}`);
          }
        },
      });
    } catch (error) {
      if (error instanceof AgentExecutionError) {
        throw new NewsCollectionError('Failed during agent execution', {
          originalError: error,
          stderr: error.stderr,
        });
      }
      throw new NewsCollectionError('An unexpected error occurred while fetching news', {
        originalError: error,
      });
    }

    const capturedData = this.captor.getCapturedData();

    return this.builder.build({
      capturedData,
      startTime,
      keywords,
      targetCount,
    });
  }
}
