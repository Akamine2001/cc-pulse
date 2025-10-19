/**
 * Duplicate Checker Initializer
 *
 * 既存ConversationをDuplicate Checker DBに登録
 */

import type { Octokit } from 'octokit';
import { DiffParser } from '../shared/diff-parser';
import { BOT_SIGNATURE } from '../shared/constants';

export interface CommentForDb {
  comment_id: number;
  file_path: string;
  line: number | null;
  category: string;
  severity: string;
  description: string;
  original_comment: string;
  created_at: string;
  updated_at: string;
}

/**
 * 既存ConversationをDuplicate Checker用に収集
 *
 * @param octokit Octokitインスタンス
 * @param owner リポジトリオーナー
 * @param repo リポジトリ名
 * @param prNumber PR番号
 * @returns DB登録用のコメントリスト
 */
export async function collectCommentsForDuplicateChecker(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<CommentForDb[]> {
  console.log('📋 Collecting existing comments for duplicate checker...');

  const previousComments = await octokit.rest.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber
  });

  // 自動レビューのコメント（元のレビューのみ）を抽出
  const autoReviewComments = previousComments.data.filter(
    c => c.body.includes(BOT_SIGNATURE) && !c.in_reply_to_id
  );

  if (autoReviewComments.length === 0) {
    console.log('✅ No existing comments to register');
    return [];
  }

  console.log(`📋 Found ${autoReviewComments.length} existing review comments`);

  const parser = new DiffParser();
  const commentsForDb: CommentForDb[] = [];

  for (const comment of autoReviewComments) {
    const issueData = parser.extractIssueFromComment(comment.body);
    if (issueData) {
      commentsForDb.push({
        comment_id: comment.id,
        file_path: comment.path,
        line: comment.line ?? null,
        category: issueData.category,
        severity: issueData.severity,
        description: issueData.description,
        original_comment: comment.body,
        created_at: comment.created_at,
        updated_at: comment.updated_at
      });
    }
  }

  console.log(`✅ Parsed ${commentsForDb.length} comments for DB`);

  return commentsForDb;
}
