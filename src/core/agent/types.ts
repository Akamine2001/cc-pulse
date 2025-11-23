import type { StdioMcpServer as ClaudeStdioMcpServer } from '../../../tools/shared/claude/claude-agent';
import type { ExecutionStats, FinalNewsItem } from '../../schemas/news-schemas';

/**
 * MCPサーバー設定 (tools/shared/claude/claude-agent.ts を参考)
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
 * 集約されたニュース出力
 * mcp__output__output_aggregated_news ツールの出力型
 */
export interface AggregatedNewsOutput {
  date: string;  // YYYY-MM-DD
  news: Omit<FinalNewsItem, 'id'>[];  // UUIDはまだ付与されていない
  stats: ExecutionStats;
}

/**
 * Claude Agent SDKのストリームメッセージ型
 */
export interface StreamMessage {
  type: 'assistant' | 'user';
  message?: {
    role: 'assistant' | 'user';
    content: ContentBlock[];
  };
}

/**
 * コンテンツブロックの型
 */
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;  // ツールごとに異なるため、使用時に型アサーション
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content?: Array<{ type: 'text'; text: string }>;
}

/**
 * mcp__embedding__search_similar の入力型
 */
export interface SearchSimilarInput {
  query_text: string;
}

/**
 * mcp__output__output_collected_news の入力型
 */
export interface OutputCollectedNewsInput {
  articles: Array<{
    title: string;
    content: string;
    url: string;
    language: string;
    source_domain: string;
    fetched_at: string;
    thumbnail_url: string | null;
    published_at: string | null;
    site_icon_url: string | null;
  }>;
  total_found: number;
  keywords_used: string[];
}

/**
 * mcp__output__output_aggregated_news の入力型
 */
export interface OutputAggregatedNewsInput extends AggregatedNewsOutput {}
