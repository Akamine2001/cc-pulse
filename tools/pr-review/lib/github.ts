/**
 * GitHub API Operations for PR Review
 *
 * PR Review特有のGitHub操作（インラインコメント投稿など）
 */

import { existsSync } from 'fs';
import type { Octokit } from 'octokit';
import { BOT_SIGNATURE } from '../shared/constants';
import type { ReviewResult } from '../shared/schemas';
import { DiffParser } from './parsers';
import { formatIssueAsInlineComment } from '../shared/formatter';
import { PRClient } from '../../shared/github/pr-client';

// ============================================================================
// Comment Poster（PR Review特有のロジック）
// ============================================================================

/**
 * ファイル差分への行コメント投稿
 *
 * @param prClient PR APIクライアント
 * @param reviewResult レビュー結果
 * @param headSha コミットSHA
 * @param prNumber PR番号
 */
// TODO: コメント投稿失敗の原因調査
// GitHub API の "pull_request_review_thread.line could not be resolved" エラーが発生する場合がある
// 原因:
//   1. Claudeが指定した行番号が、実際のファイル全体の行番号である可能性（差分内の行番号ではない）
//   2. PR差分が大きなファイルの一部のみを含んでおり、指定行が差分に存在しない
//   3. ファイル全体の行番号と差分内の行番号の混同
// 対策案:
//   - Claudeに「差分内に存在する行番号のみを指定する」ように明示的に指示
//   - または、差分パーサーで行番号を検証し、存在しない場合はコメント投稿をスキップ
//   - 行番号マッピング機能の追加（ファイル全体の行番号 → 差分内の行番号）
//   - **推奨**: PRClientにバリデーション機能を追加
//     - postReviewComment() 実行前に、指定された行番号が差分に存在するかチェック
//     - 存在しない場合は警告ログを出力してスキップ（エラーにしない）
//     - DiffParserを使って差分内の有効な行範囲を取得し、その範囲内かを検証
//     - 例: `if (!diffParser.isLineInDiff(filePath, lineNumber)) { console.warn('Line not in diff, skipping...'); return; }`

export async function postInlineComments(
  prClient: PRClient,
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

      await prClient.postReviewComment(
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
 * @param prClient PR APIクライアント
 * @param prNumber PR番号
 * @param reviewMarkdown レビュー内容（Markdown形式）
 */
export async function postReviewSummaryComment(
  prClient: PRClient,
  prNumber: number,
  reviewMarkdown: string
): Promise<void> {
  const body = `## 🤖 自動コードレビュー結果

${reviewMarkdown}

---
_このレビューはClaude Agent SDKを使用して生成されました_`;

  try {
    await prClient.postComment(prNumber, body);
    console.log('✅ Posted review comment to GitHub');
  } catch (error) {
    console.error('❌ Failed to post comment to GitHub:', error);
    throw error;
  }
}
