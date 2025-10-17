/**
 * MCP Server Factory
 *
 * MCPサーバーの生成ロジックを集約し、createPromptStream()を共通化
 *
 * 重要な制約:
 * - Claude Agent SDKの`query()`を2回使うとエラーになるため、
 *   AsyncIterableでプロンプトを渡す必要がある
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
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

/**
 * 出力用MCPサーバーを作成
 *
 * レビュー結果や修正判定結果を受け取るためのMCPサーバーを生成する。
 *
 * @param name MCPサーバー名
 * @param toolName ツール名
 * @param schema Zodスキーマ
 * @param onSubmit データ送信時のコールバック
 * @returns MCPサーバーインスタンス
 */
export function createOutputMcpServer<T extends z.ZodRawShape>(
  name: string,
  toolName: string,
  schema: z.ZodObject<T>,
  onSubmit: (data: z.infer<z.ZodObject<T>>) => void
) {
  const submitTool = tool(
    toolName,
    `Submit the ${name} result in structured format with schema validation`,
    schema.shape,
    async (args) => {
      onSubmit(args as z.infer<z.ZodObject<T>>);
      return {
        content: [{
          type: 'text' as const,
          text: `${name} result submitted successfully.`
        }]
      };
    }
  );

  return createSdkMcpServer({
    name,
    version: '1.0.0',
    tools: [submitTool]
  });
}
