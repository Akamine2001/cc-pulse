import type {
  McpSdkServerConfigWithInstance,
  McpStdioServerConfig,
  SDKMessage,
} from '@anthropic-ai/claude-agent-sdk/sdkTypes';
import type { ExecutionStats, FinalNewsItem } from '../../schemas/news-schemas';

// --- SDK Type Re-exports ---

/**
 * Re-export of the main message type from the Claude Agent SDK.
 * This can be either an assistant message or a user message.
 */
export type { SDKMessage };

/**
 * Re-export of the Stdio MCP server configuration from the SDK.
 * Used for servers that communicate over standard I/O (e.g., Python scripts).
 */
export type { McpStdioServerConfig };

/**
 * A union type representing any possible MCP server configuration.
 * It can be a stdio-based server or an in-process SDK-based server.
 */
export type McpServerConfig = McpStdioServerConfig | McpSdkServerConfigWithInstance;

// --- cc-pulse Specific Types ---

/**
 * Configuration for the NewsAgent.
 * Defines the model, MCP servers, allowed tools, and execution parameters.
 */
export interface NewsAgentConfig {
  model?: string;
  mcpServers?: Record<string, McpServerConfig>; // Use the new union type
  allowedTools?: string[];
  maxTurns?: number;
}

/**
 * Parameters for generating sub-agents.
 */
export interface SubAgentParams {
  description: string;
  prompt: string;
  tools: string[];
}

/**
 * Callback handler for tool calls, including the unique toolId.
 */
export type ToolCallbackHandler = (
  toolName: string,
  input: unknown,
  toolId: string,
) => void | Promise<void>;

/**
 * Data captured during the agent's execution.
 */
export interface CapturedNewsData {
  aggregatedOutput: AggregatedNewsOutput | null;
  iterations: number;
  similarityChecks: Map<string, string>;
}

/**
 * The final aggregated news output.
 * This is the expected output from the `mcp__output__output_aggregated_news` tool.
 */
export interface AggregatedNewsOutput {
  date: string; // YYYY-MM-DD
  news: Omit<FinalNewsItem, 'id'>[]; // UUID is not yet assigned
  stats: ExecutionStats;
}

// --- Tool Input Types ---

/**
 * Input type for the `mcp__embedding__search_similar` tool.
 */
export interface SearchSimilarInput {
  query_text: string;
}

/**
 * Input type for the `mcp__output__output_collected_news` tool.
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
 * Input type for the `mcp__output__output_aggregated_news` tool.
 * It extends the base AggregatedNewsOutput type.
 */
export interface OutputAggregatedNewsInput extends AggregatedNewsOutput {}
