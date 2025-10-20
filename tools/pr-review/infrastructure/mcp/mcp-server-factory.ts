/**
 * MCP Server Factory
 *
 * MCPサーバーの生成ロジックを集約し、createPromptStream()を共通化
 *
 * 重要な制約:
 * - Claude Agent SDKの`query()`を2回使うとエラーになるため、
 *   AsyncIterableでプロンプトを渡す必要がある
 */

import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * プロンプトストリームを生成
 *
 * Claude Agent SDKの制約により、query()を2回呼ぶとエラーになる。
 * そのため、AsyncIterableでプロンプトを渡す必要がある。
 *
 * @param promptText プロンプト文字列
 * @returns AsyncIterable<SDKUserMessage>
 */
export async function* createPromptStream(promptText: string): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user' as const,
    session_id: '',
    message: {
      role: 'user' as const,
      content: promptText
    },
    parent_tool_use_id: null
  };
}

// SDK MCP server functions removed - now using stdio MCP servers only
