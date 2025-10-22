/**
 * Conversation Collector
 *
 * 既存のConversation（レビューコメント）を収集
 */

import type { Octokit } from 'octokit';
import { DiffParser } from '../shared/diff-parser';
import { BOT_SIGNATURE } from '../shared/constants';
import type { ReviewComment } from '../shared/schemas';

/**
 * 既存のレビューコメントを収集
 *
 * @param octokit Octokitインスタンス
 * @param owner リポジトリオーナー
 * @param repo リポジトリ名
 * @param prNumber PR番号
 * @returns 既存レビューコメントのリスト
 */
export async function collectExistingConversations(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<ReviewComment[]> {
  const previousComments = await octokit.rest.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber
  });

  // 自動レビューのコメントのみ抽出
  const autoReviewComments = previousComments.data.filter(
    c => c.body.includes(BOT_SIGNATURE)
  );

  if (autoReviewComments.length === 0) {
    return [];
  }

  console.log(`📋 Found ${autoReviewComments.length} existing review comments`);

  const parser = new DiffParser();
  const reviewComments: ReviewComment[] = [];

  for (const comment of autoReviewComments) {
    const issueData = parser.extractIssueFromComment(comment.body);
    if (issueData) {
      reviewComments.push({
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

  return reviewComments;
}
