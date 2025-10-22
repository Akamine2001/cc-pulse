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

  // PR情報を取得（base/head SHA）
  const prInfo = await githubClient.getPRInfo(prNumber);
  const { baseSha } = prInfo;

  // DiffParserを初期化（差分解析 + コードスニペット生成）
  const diffParser = new DiffParser();

  // ファイルごとに差分を取得して解析
  const uniqueFiles = [...new Set(sortedIssues.map(issue => issue.file_path!))];
  for (const filePath of uniqueFiles) {
    const diff = await githubClient.getFileDiff(filePath, baseSha, headSha);
    if (diff) {
      diffParser.parseDiff(filePath, diff);
    }
  }

  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  for (const issue of sortedIssues) {
    try {
      const filePath = issue.file_path!;
      const lineNumber = issue.line_range!.end;

      // side判定（LEFT: 削除行, RIGHT: 追加/変更行）
      const side = diffParser.getLineSide(filePath, lineNumber);

      if (!side) {
        // 差分に含まれない行 → スキップ
        console.log(`  ⚠️  Skipped ${filePath}:${lineNumber} (line not in diff)`);
        skippedCount++;
        continue;
      }

      // コードスニペットを生成
      let codeSnippet: string | undefined;
      if (issue.line_range) {
        codeSnippet = diffParser.formatCodeSnippet(
          filePath,
          issue.line_range.start,
          issue.line_range.end
        );
      }

      await githubClient.postReviewComment(
        prNumber,
        headSha,
        filePath,
        lineNumber,
        side,
        formatIssueAsInlineComment(issue, codeSnippet)
      );

      console.log(`  ✅ ${filePath}:${lineNumber} (${side})`);
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

  console.log(`✅ Posted ${successCount} inline comments (${failCount} failed, ${skippedCount} skipped)`);
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
