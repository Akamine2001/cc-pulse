import type { ReviewIssue, ReviewResult } from '../../../shared/schemas';
import type { CategoryComment } from '../../../shared/schemas';
import type { ReviewContext } from '../../context/review-context';

/**
 * サマリーを生成
 */
export function generateSummary(
  summaryComment: string,
  categoryComments: CategoryComment[],
  issues: ReviewIssue[],
  julesSessionFound: boolean
): string {
  let summary = `**総評**\n${summaryComment}\n\n`;
  summary += `**主な指摘**\n`;

  // カテゴリごとの件数を集計
  const categoryCount = new Map<string, number>();
  for (const issue of issues) {
    const count = categoryCount.get(issue.category) || 0;
    categoryCount.set(issue.category, count + 1);
  }

  // カテゴリコメントと件数を組み合わせて出力
  for (const { category, comment } of categoryComments) {
    const count = categoryCount.get(category) || 0;
    summary += `- ${category}: ${count}件 - ${comment}\n`;
  }

  if (!julesSessionFound) {
    summary += '\n\nℹ️ Julesセッション: 見つかりませんでした（julesコメントは送信されません）';
  }

  return summary;
}

/**
 * 統計を計算
 */
export function calculateStats(issues: readonly ReviewIssue[]) {
  return {
    total_issues: issues.length,
    critical: issues.filter(i => i.severity === 'critical').length,
    high: issues.filter(i => i.severity === 'high').length,
    medium: issues.filter(i => i.severity === 'medium').length,
    low: issues.filter(i => i.severity === 'low').length
  };
}

/**
 * ローカルモードでのファイル保存
 */
export async function saveReviewToLocalFile(
  reviewResult: ReviewResult,
  prNumber: number,
  diffFiles: string[]
): Promise<string> {
  const { dirname, join } = await import('path');
  const { mkdir } = await import('fs/promises');
  const { fileURLToPath } = await import('url');
  const { formatReviewAsMarkdown } = await import('../../../shared/formatter.js');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const outputDir = join(__dirname, '../../output');
  const outputPath = join(outputDir, `pr-${prNumber}-review.md`);

  await mkdir(outputDir, { recursive: true });

  // Markdown生成（詳細な形式）
  let fullMarkdown = `# PR #${prNumber} 自動レビュー結果\n\n`;
  fullMarkdown += `## 📊 サマリー\n\n${formatReviewAsMarkdown(reviewResult)}\n\n`;

  // インラインコメント（差分内かつline_rangeあり）
  const inlineIssues = reviewResult.issues.filter(
    issue => issue.file_path && issue.line_range && diffFiles.includes(issue.file_path)
  );

  // ファイル全体への指摘（差分内だがline_rangeなし）
  const fileWideIssues = reviewResult.issues.filter(
    issue => issue.file_path && !issue.line_range && diffFiles.includes(issue.file_path)
  );

  // 差分外コメント（file_pathあり、diffFilesに含まれない）
  const outOfDiffIssues = reviewResult.issues.filter(
    issue => issue.file_path && !diffFiles.includes(issue.file_path)
  );

  if (inlineIssues.length > 0) {
    fullMarkdown += `---\n\n## 💬 インラインコメント（PR Reviewコメント）\n\n`;
    fullMarkdown += `> **GitHub投稿先**: 差分ビューの各行にインラインで投稿されます（Files changedタブ）\n\n`;

    // ファイルごとにグループ化
    const byFile = new Map<string, typeof inlineIssues>();
    for (const issue of inlineIssues) {
      const file = issue.file_path!;
      if (!byFile.has(file)) {
        byFile.set(file, []);
      }
      byFile.get(file)!.push(issue);
    }

    for (const [file, issues] of byFile.entries()) {
      fullMarkdown += `### ${file}\n\n`;
      for (const issue of issues) {
        fullMarkdown += `#### Line ${issue.line_range!.start}-${issue.line_range!.end} (${issue.severity})\n\n`;
        fullMarkdown += `${issue.description}\n\n`;
        if (issue.suggestion) {
          fullMarkdown += `**提案**:\n${issue.suggestion}\n\n`;
        }
      }
    }
  }

  if (fileWideIssues.length > 0) {
    fullMarkdown += `---\n\n## 📁 ファイル全体への指摘（PRコメント）\n\n`;
    fullMarkdown += `> **GitHub投稿先**: PRの会話タブに通常のコメントとして投稿されます\n\n`;
    fullMarkdown += `以下はファイル全体に対する指摘です（特定の行に限定されません）。\n\n`;

    for (const issue of fileWideIssues) {
      const severityLabel = { critical: '重大', high: '重要', medium: '中程度', low: '軽微' }[issue.severity];

      fullMarkdown += `### ${issue.file_path} (${severityLabel})\n\n`;
      fullMarkdown += `**カテゴリ**: ${issue.category}\n`;
      fullMarkdown += `**問題**:\n${issue.description}\n\n`;
      fullMarkdown += `**提案**:\n${issue.suggestion}\n\n`;
    }
  }

  if (outOfDiffIssues.length > 0) {
    fullMarkdown += `---\n\n## ⚠️ 差分外ファイルへの指摘（PRコメント）\n\n`;
    fullMarkdown += `> **GitHub投稿先**: PRの会話タブに通常のコメントとして投稿されます\n\n`;
    fullMarkdown += `以下のファイルはPR差分に含まれていませんが、関連する問題が見つかりました。\n\n`;

    for (const issue of outOfDiffIssues) {
      const severityLabel = { critical: '重大', high: '重要', medium: '中程度', low: '軽微' }[issue.severity];
      const lineInfo = issue.line_range ? `:${issue.line_range.start}-${issue.line_range.end}` : '';

      fullMarkdown += `### ${issue.file_path}${lineInfo} (${severityLabel})\n\n`;
      fullMarkdown += `**問題**:\n${issue.description}\n\n`;
      fullMarkdown += `**提案**:\n${issue.suggestion}\n\n`;
    }
  }

  await Bun.write(outputPath, fullMarkdown);
  return outputPath;
}

/**
 * GitHubへのコメント投稿
 */
export async function postReviewToGitHub(
  context: ReviewContext,
  reviewResult: ReviewResult,
  diffFiles: string[]
): Promise<void> {
  const prClient = context.getPRClient();
  if (!prClient) {
    throw new Error('PRClient not initialized');
  }

  const { prNumber, headSha } = context.config;

  // 1. インラインコメント投稿
  const { postInlineComments } = await import('../../../lib/github.js');
  await postInlineComments(prClient, reviewResult, headSha, prNumber, diffFiles);

  // 2. ファイル全体への指摘（差分内だが行指定なし）
  const { postFileWideComments } = await import('../../../lib/github.js');
  await postFileWideComments(prClient, reviewResult, diffFiles, prNumber);

  // 3. 差分外コメント投稿
  const { postOutOfDiffComments } = await import('../../../lib/github.js');
  await postOutOfDiffComments(prClient, reviewResult, diffFiles, prNumber);

  // 3. サマリーコメント投稿
  const { postReviewSummaryComment } = await import('../../../lib/github.js');
  const { formatReviewAsMarkdown } = await import('../../../shared/formatter.js');
  const reviewMarkdown = formatReviewAsMarkdown(reviewResult);
  await postReviewSummaryComment(prClient, prNumber, reviewMarkdown);
}
