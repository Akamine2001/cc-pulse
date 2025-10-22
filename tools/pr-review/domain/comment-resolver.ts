/**
 * Comment Resolver
 *
 * 前回のレビューコメントの修正状況をClaudeで判定し、適切に処理する
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeCodeExecutablePath } from '../../../src/utils/paths';
import { createPromptStream } from '../infrastructure/mcp/mcp-server-factory';
import { loadResolveCommentPrompt } from '../infrastructure/file/prompt-loader';
import type { ReviewComment } from '../shared/schemas';
import type { FileDiff } from '../infrastructure/file/diff-file-manager';

export class CommentResolver {
  /**
   * 前回のレビューコメントを解決
   *
   * @param existingComments 既存コメント（threadId含む）
   * @param context プロジェクトコンテキスト
   * @param existingCommentsPath 既存コメントのJSONファイルパス
   * @param fileDiffs ファイル単位の差分情報の配列
   * @param owner リポジトリオーナー
   * @param repo リポジトリ名
   * @param prNumber PR番号
   * @param prAuthor PR作成者
   */
  async resolvePreviousComments(
    existingComments: ReviewComment[],
    context: string,
    existingCommentsPath: string,
    fileDiffs: FileDiff[],
    owner: string,
    repo: string,
    prNumber: number,
    prAuthor: string
  ): Promise<void> {
    if (existingComments.length === 0) {
      console.log('✅ No previous comments to resolve');
      return;
    }

    console.log(`📋 Resolving ${existingComments.length} previous comments...`);

    const claudeCodePath = getClaudeCodeExecutablePath();
    if (!claudeCodePath) {
      throw new Error('Claude Code CLI not found. Please install it or set CLAUDE_PATH environment variable.');
    }

    // プロンプトを構築
    const promptText = loadResolveCommentPrompt(fileDiffs, context);

    // stderrを収集
    let stderrOutput = '';

    // Review util MCP server (stdio - TypeScript)
    const reviewMcpServer = {
      type: 'stdio' as const,
      command: 'bun',
      args: [
        'run',
        `${__dirname}/../mcp/review-util-mcp-server.ts`
      ],
      env: {
        EXISTING_COMMENTS_PATH: existingCommentsPath,
        GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
        GITHUB_OWNER: owner,
        GITHUB_REPO: repo,
        PR_NUMBER: String(prNumber),
        PR_AUTHOR: prAuthor
      }
    };

    try {
      console.log('🤖 Starting comment resolution with Agent SDK...');

      const stream = query({
        prompt: createPromptStream(promptText),
        options: {
          pathToClaudeCodeExecutable: claudeCodePath,
          maxTurns: 70,
          mcpServers: {
            'review-util': reviewMcpServer
          },
          allowedTools: [
            'Read',  // 差分ファイル読み込み用
            'mcp__review-util__get_comments_for_file',
            'mcp__review-util__update_conversation'
          ],
          stderr: (data: string) => {
            stderrOutput += data;
            console.error(`[STDERR] ${data}`);
          }
        }
      });

      // ストリームを処理
      for await (const message of stream) {
        // デバッグログ
        console.log(`[DEBUG] ========== Stream Message ==========`);
        console.log(`[DEBUG] Message type: ${message?.type}`);

        if (message?.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            // ツール呼び出しログ
            if (block.type === 'tool_use') {
              const toolUse = block as any;
              console.log(`[DEBUG] Tool called: ${toolUse.name}`);
              console.log(`[DEBUG] Tool input:`, JSON.stringify(toolUse.input, null, 2));
            }

            // テキストログ
            if (block.type === 'text') {
              const text = (block as any).text;
              if (text && text.trim()) {
                console.log(`[DEBUG] Text: ${text.substring(0, 200)}`);
              }
            }
          }
        }
      }

      console.log('✅ Comment resolution completed');

    } catch (error: any) {
      console.error('❌ Error during comment resolution');
      console.error('   Error:', error.message);
      console.error('   Stack:', error.stack);
      console.error('   Claude Code STDERR:');
      console.error(stderrOutput);
      throw error;
    }
  }
}
