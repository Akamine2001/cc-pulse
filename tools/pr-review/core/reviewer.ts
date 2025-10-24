/**
 * PRレビュアークラス
 * Claude Agent SDKを使用してコードレビューを実施
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ReviewResult } from '../shared/schemas';
import { ClaudeAgent } from '../lib/claude';
import { loadReviewPrompt } from '../lib/files';
import { saveDiffByFiles, deleteTempDiffFiles, type FileDiff } from '../lib/files';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class PRReviewer {
  private agent: ClaudeAgent;

  constructor(
    existingCommentsPath: string,
    headSha: string,
    owner: string,
    repo: string,
    prNumber: number
  ) {
    this.agent = new ClaudeAgent({
      mcpServers: {
        'review-util': {
          command: 'bun',
          args: ['run', `${__dirname}/../mcp/review-util-mcp-server.ts`],
          env: {
            EXISTING_COMMENTS_PATH: existingCommentsPath,
            HEAD_SHA: headSha,
            GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
            GITHUB_OWNER: owner,
            GITHUB_REPO: repo,
            PR_NUMBER: String(prNumber)
          }
        }
      },
      allowedTools: [
        'Read',  // 差分ファイル読み込み用
        'mcp__review-util__format_review',
        'mcp__review-util__submit_review',
        'mcp__review-util__get_comments_for_file'
      ],
      maxTurns: 70
    });
  }

  /**
   * PRの差分をレビューしてGitHubにコメント投稿
   *
   * @param diff PR差分
   * @param projectContext プロジェクトコンテキスト
   * @param reviewGuidelines レビュー観点
   */
  async review(
    diff: string,
    projectContext: string,
    reviewGuidelines: string
  ): Promise<void> {
    // 差分をファイル単位で分割して一時ファイルに保存
    const fileDiffs = saveDiffByFiles(diff);

    try {
      // プロンプトを生成（ファイル単位の差分リストを渡す）
      const promptText = this.buildPrompt(fileDiffs, projectContext, reviewGuidelines);

      console.log('🤖 Starting Claude code review with Agent SDK...');

      // ClaudeAgentでレビューを実行（submit_review内でGitHub投稿）
      await this.agent.query({
        prompt: promptText
      });

      console.log('✅ Review completed (posted to GitHub via submit_review tool)');

    } finally {
      // 一時ファイルをクリーンアップ
      deleteTempDiffFiles(fileDiffs);
    }
  }

  /**
   * レビュー用のプロンプトを構築
   */
  private buildPrompt(
    fileDiffs: FileDiff[],
    projectContext: string,
    reviewGuidelines: string
  ): string {
    // 外部プロンプトMDファイルから読み込み（差分はファイルリストで指定）
    return loadReviewPrompt(fileDiffs, projectContext, reviewGuidelines);
  }
}
