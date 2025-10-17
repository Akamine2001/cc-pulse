/**
 * Comment Poster
 *
 * GitHubへのコメント投稿を担当
 */

import { existsSync } from 'fs';
import type { GitHubClient } from './github-client';
import type { ReviewResult, ReviewIssue } from '../../types';
import { DiffParser } from '../../shared/diff-parser';
import { formatIssueAsInlineComment } from '../../shared/formatter';

/**
 * ファイル差分への行コメント投稿
 *
 * @param githubClient GitHub APIクライアント
 * @param reviewResult レビュー結果
 * @param headSha コミットSHA
 * @param prNumber PR番号
 */
export async function postInlineComments(
  githubClient: GitHubClient,
  reviewResult: ReviewResult,
  headSha: string,
  prNumber: number
): Promise<void> {
  // file_path と line_range がある問題のみ
  const inlineIssues = reviewResult.issues.filter(
    issue => issue.file_path && issue.line_range
  );

  if (inlineIssues.length === 0) {
    console.log('ℹ️ No issues with file_path/line_range for inline comments');
    return;
  }

  // 重要度順にソート（全ての問題を投稿）
  const sortedIssues = inlineIssues
    .sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

  console.log(`💬 Posting ${sortedIssues.length} inline comments (all severities)...`);

  let successCount = 0;
  let failCount = 0;

  // コードスニペット生成用のparserを初期化
  const snippetParser = new DiffParser();

  for (const issue of sortedIssues) {
    try {
      // コードスニペットを生成
      let codeSnippet: string | undefined;
      if (issue.file_path && issue.line_range) {
        codeSnippet = snippetParser.formatCodeSnippet(
          issue.file_path,
          issue.line_range.start,
          issue.line_range.end
        );
      }

      await githubClient.postReviewComment(
        prNumber,
        headSha,
        issue.file_path!,
        issue.line_range!.end,
        formatIssueAsInlineComment(issue, codeSnippet)
      );

      console.log(`  ✅ ${issue.file_path}:${issue.line_range!.end}`);
      successCount++;
    } catch (error: unknown) {
      console.error(`  ❌ Failed to post comment on ${issue.file_path}:${issue.line_range?.end}`);
      if (error instanceof Error) {
        console.error(`     Error: ${error.message}`);
        if (error.stack) {
          console.error(`     Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
        }
      } else {
        console.error(`     Error:`, error);
      }
      failCount++;
    }
  }

  console.log(`✅ Posted ${successCount} inline comments (${failCount} failed)`);
}

/**
 * PRにレビューサマリーコメントを投稿
 *
 * @param githubClient GitHub APIクライアント
 * @param prNumber PR番号
 * @param reviewMarkdown レビュー内容（Markdown形式）
 */
export async function postReviewSummaryComment(
  githubClient: GitHubClient,
  prNumber: number,
  reviewMarkdown: string
): Promise<void> {
  const body = `## 🤖 自動コードレビュー結果

${reviewMarkdown}

---
_このレビューはClaude Agent SDK${existsSync('.serena/memories/project_overview.md') ? 'とSerenaプロジェクトコンテキスト' : ''}を使用して生成されました_`;

  try {
    await githubClient.postComment(prNumber, body);
    console.log('✅ Posted review comment to GitHub');
  } catch (error) {
    console.error('❌ Failed to post comment to GitHub:', error);
    throw error;
  }
}
