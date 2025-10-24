/**
 * Comment Resolver
 *
 * 前回のレビューコメントの修正状況をClaudeで判定し、適切に処理する
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { ClaudeAgent } from '../lib/claude';
import { loadResolveCommentPrompt } from '../lib/files';
import type { ReviewComment } from '../shared/schemas';
import type { FileDiff } from '../lib/files';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

    // プロンプトを構築
    const promptText = loadResolveCommentPrompt(fileDiffs, context);

    console.log('🤖 Starting comment resolution with Agent SDK...');

    // ClaudeAgentを初期化
    const agent = new ClaudeAgent({
      mcpServers: {
        'review-util': {
          command: 'bun',
          args: ['run', `${__dirname}/../mcp/review-util-mcp-server.ts`],
          env: {
            EXISTING_COMMENTS_PATH: existingCommentsPath,
            GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
            GITHUB_OWNER: owner,
            GITHUB_REPO: repo,
            PR_NUMBER: String(prNumber),
            PR_AUTHOR: prAuthor
          }
        }
      },
      allowedTools: [
        'Read',  // 差分ファイル読み込み用
        'mcp__review-util__get_comments_for_file',
        'mcp__review-util__update_conversation'
      ],
      maxTurns: 70
    });

    // ClaudeAgentでコメント解決を実行（最後まで実行）
    await agent.query({
      prompt: promptText
    });

    console.log('✅ Comment resolution completed');
  }
}
