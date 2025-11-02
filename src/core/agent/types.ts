import type { StdioMcpServer as ClaudeStdioMcpServer } from '../../../tools/shared/claude/agent';
import type { DailyNewsData } from '../../schemas/news-schemas';

/**
 * MCPサーバー設定 (tools/shared/claude/agent.ts を参考)
 */
export type StdioMcpServer = ClaudeStdioMcpServer;

/**
 * エージェント設定
 */
export interface NewsAgentConfig {
  model?: string;
  mcpServers?: Record<string, StdioMcpServer>;
  allowedTools?: string[];
  maxTurns?: number;
}

/**
 * サブエージェント生成パラメータ
 */
export interface SubAgentParams {
  description: string;
  prompt: string;
  tools: string[];
}

/**
 * ツールコールバック（toolId付き）
 */
export type ToolCallbackHandler = (
  toolName: string,
  input: any,
  toolId: string
) => void | Promise<void>;

/**
 * キャプチャされた記事データ
 */
export interface CapturedNewsData {
  aggregatedOutput: AggregatedNewsOutput | null;
  iterations: number;
  similarityChecks: Map<string, string>;
}

/**
 * 集約結果の型
 */
export interface AggregatedNewsOutput {
  date: string;
  news: Array<{
    title: string;
    summary: string;
    tags: string[];
    url: string;
    original_language: string;
    source_domain: string;
    fetched_at: string;
    is_duplicate: boolean;
    thumbnail_url: string | null;
    published_at: string | null;
    site_icon_url: string | null;
  }>;
  stats: {
    total_collected: number;
    unique_articles: number;
    duplicate_removed: number;
    iterations: number;
    duration_ms: number;
  };
}
