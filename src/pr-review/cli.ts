#!/usr/bin/env bun

/**
 * cc-pulse: PR Auto-Review CLI
 *
 * GitHub ActionsからPRレビューを実行するためのエントリーポイント
 */

import { Octokit } from 'octokit';
import { readFileSync, existsSync } from 'fs';
import { PRReviewer } from './reviewer';
import { formatReviewAsMarkdown, formatIssueAsInlineComment } from './formatter';
import { ResolutionChecker } from './resolution-checker';
import { ThreadResolver } from './thread-resolver';
import { DiffParser } from './diff-parser';
import type { ReviewIssue, ReviewResult } from './schemas';
import { validateEnv } from './env';

// 環境変数の検証（Zodバリデーション）
const env = validateEnv();

// GitHub リポジトリ情報の解析
const [owner, repo] = env.GITHUB_REPOSITORY.split('/');

// Octokit クライアント初期化
const octokit = new Octokit({ auth: env.GITHUB_TOKEN });

/**
 * PR差分を読み込む
 */
function readPRDiff(): string {
  const diffPath = 'pr-diff.txt';

  if (!existsSync(diffPath)) {
    throw new Error(`PR diff file not found: ${diffPath}`);
  }

  return readFileSync(diffPath, 'utf-8');
}

/**
 * プロジェクトコンテキストを読み込む（.serenaディレクトリから）
 */
function readProjectContext(): string {
  const serenaMemoriesPath = '.serena/memories/project_overview.md';

  if (existsSync(serenaMemoriesPath)) {
    console.log('✅ Found Serena project context');
    return readFileSync(serenaMemoriesPath, 'utf-8');
  }

  console.log('⚠️ No Serena context found, using basic project info');
  return 'No additional project context available.';
}

/**
 * 最新のコミットSHAを取得
 */
async function getLatestCommitSha(): Promise<string> {
  const pr = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: parseInt(env.PR_NUMBER)
  });

  return pr.data.head.sha;
}

/**
 * ファイル差分への行コメント投稿
 */
async function postInlineComments(reviewResult: ReviewResult, headSha: string): Promise<void> {
  // file_path と line_range がある問題のみ
  const inlineIssues = reviewResult.issues.filter(
    issue => issue.file_path && issue.line_range
  );

  if (inlineIssues.length === 0) {
    console.log('ℹ️ No issues with file_path/line_range for inline comments');
    return;
  }

  // 重要度順にソート（critical, high のみ投稿）
  const criticalIssues = inlineIssues
    .filter(i => i.severity === 'critical' || i.severity === 'high')
    .sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    })
    .slice(0, 20); // 最大20件（ノイズ回避）

  console.log(`💬 Posting ${criticalIssues.length} inline comments (critical/high only)...`);

  let successCount = 0;
  let failCount = 0;

  // コードスニペット生成用のparserを初期化
  const snippetParser = new DiffParser();

  for (const issue of criticalIssues) {
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

      await octokit.rest.pulls.createReviewComment({
        owner,
        repo,
        pull_number: parseInt(env.PR_NUMBER),
        commit_id: headSha,
        path: issue.file_path!,
        line: issue.line_range!.end,
        body: formatIssueAsInlineComment(issue, codeSnippet)
      });

      console.log(`  ✅ ${issue.file_path}:${issue.line_range!.end}`);
      successCount++;
    } catch (error: any) {
      console.error(`  ❌ Failed to post comment on ${issue.file_path}:${issue.line_range?.end}: ${error.message}`);
      failCount++;
    }
  }

  console.log(`✅ Posted ${successCount} inline comments (${failCount} failed)`);

  // 残りの問題がある場合
  const remainingCount = inlineIssues.length - criticalIssues.length;
  if (remainingCount > 0) {
    console.log(`ℹ️ ${remainingCount} medium/low issues not posted as inline comments (see summary comment)`);
  }
}

/**
 * GitHubにレビューコメントを投稿
 */
async function postReviewComment(reviewMarkdown: string): Promise<void> {
  const body = `## 🤖 自動コードレビュー結果

${reviewMarkdown}

---
_このレビューはClaude Agent SDK${existsSync('.serena/memories/project_overview.md') ? 'とSerenaプロジェクトコンテキスト' : ''}を使用して生成されました_`;

  try {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: parseInt(env.PR_NUMBER),
      body,
    });

    console.log('✅ Posted review comment to GitHub');
  } catch (error) {
    console.error('❌ Failed to post comment to GitHub:', error);
    throw error;
  }
}

/**
 * Outdatedなコメントの修正状況をチェック
 */
async function handleOutdatedComments(context: string): Promise<void> {
  console.log('');
  console.log('🔍 Checking outdated comments for resolution...');

  // 1. 前回のコメント取得
  const previousComments = await octokit.rest.pulls.listReviewComments({
    owner,
    repo,
    pull_number: parseInt(env.PR_NUMBER)
  });

  // 2. Outdatedコメント抽出（自動レビューのコメントのみ）
  const allOutdatedComments = previousComments.data.filter(
    c => c.body.includes('🤖 Auto-Review') && c.position === null
  );

  if (allOutdatedComments.length === 0) {
    console.log('✅ No outdated comments to check');
    return;
  }

  // 上限設定: 最大50件まで処理、5件ずつ並列実行（GitHub Actions timeout & API Rate Limit対策）
  const MAX_OUTDATED_COMMENTS = 50;
  const BATCH_SIZE = 5; // 同時実行数
  const outdatedComments = allOutdatedComments.slice(0, MAX_OUTDATED_COMMENTS);

  if (allOutdatedComments.length > MAX_OUTDATED_COMMENTS) {
    console.log(`⚠️ Found ${allOutdatedComments.length} outdated comments, processing first ${MAX_OUTDATED_COMMENTS} in batches of ${BATCH_SIZE}`);
  } else {
    console.log(`📋 Found ${outdatedComments.length} outdated comments to check (batches of ${BATCH_SIZE})`);
  }

  // 3. GraphQL threadIdマッピング
  const resolver = new ThreadResolver(octokit);
  const threadMap = await resolver.buildThreadMap(owner, repo, parseInt(env.PR_NUMBER));

  // 4. 各コメントの修正判定（バッチ並列処理）
  const checker = new ResolutionChecker();
  const parser = new DiffParser();

  // コメント処理関数
  const processComment = async (comment: typeof outdatedComments[0]) => {
    try {
      // 前回の問題を抽出
      const previousIssueData = parser.extractIssueFromComment(comment.body);
      if (!previousIssueData) {
        console.log(`⚠️ Could not parse issue from comment ${comment.id}`);
        return { success: false, commentId: comment.id };
      }

      // ReviewIssueオブジェクトを構築
      const previousIssue: ReviewIssue = {
        severity: previousIssueData.severity as any,
        category: previousIssueData.category,
        description: previousIssueData.description,
        file_path: comment.path,
        line_range: comment.line ? { start: comment.line, end: comment.line } : undefined,
        impact: '',
        suggestion: ''
      };

      // 前回指摘した時のコードスニペットを抽出
      const originalCode = parser.extractCodeSnippetFromComment(comment.body);

      // 該当箇所の現在のコードを取得
      const currentCode = await parser.getCurrentCode(
        comment.path,
        comment.line || 1,
        comment.line || 1
      );

      // Claude SDKで判定（元のコードと現在のコードを比較）
      const resolution = await checker.checkResolution(
        previousIssue,
        originalCode,
        currentCode,
        context
      );

      console.log(`  ${comment.path}:${comment.line} - ${resolution.status}`);

      // 判定結果に基づいて処理
      const threadId = threadMap.get(comment.id);

      switch (resolution.status) {
        case 'fixed':
          // Resolve + 返信
          if (threadId) {
            await resolver.resolveThread(threadId);
          }
          await octokit.rest.pulls.createReplyForReviewComment({
            owner,
            repo,
            pull_number: parseInt(env.PR_NUMBER),
            comment_id: comment.id,
            body: `✅ 修正を確認しました\n\n${resolution.reasoning}`
          });
          break;

        case 'todo_added':
          // Resolve + 返信
          if (threadId) {
            await resolver.resolveThread(threadId);
          }
          await octokit.rest.pulls.createReplyForReviewComment({
            owner,
            repo,
            pull_number: parseInt(env.PR_NUMBER),
            comment_id: comment.id,
            body: `✅ TODOとして記録されました\n\n${resolution.reasoning}`
          });
          break;

        case 'needs_decision':
          // オーナーメンション（Resolveしない）
          await octokit.rest.pulls.createReplyForReviewComment({
            owner,
            repo,
            pull_number: parseInt(env.PR_NUMBER),
            comment_id: comment.id,
            body: `@${env.PR_AUTHOR || owner} こちらの判断をお願いします\n\n${resolution.reasoning}`
          });
          break;

        case 'not_fixed':
          // 警告（Resolveしない）
          await octokit.rest.pulls.createReplyForReviewComment({
            owner,
            repo,
            pull_number: parseInt(env.PR_NUMBER),
            comment_id: comment.id,
            body: `⚠️ 問題は解決されていません\n\n${resolution.reasoning}`
          });
          break;
      }

      return { success: true, commentId: comment.id };
    } catch (error) {
      console.error(`❌ Failed to check comment ${comment.id}:`, error);
      return { success: false, commentId: comment.id, error };
    }
  };

  // バッチ処理: 5件ずつ並列実行
  let totalSuccess = 0;
  let totalFail = 0;

  for (let i = 0; i < outdatedComments.length; i += BATCH_SIZE) {
    const batch = outdatedComments.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(outdatedComments.length / BATCH_SIZE);

    console.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} comments)...`);

    const batchPromises = batch.map(comment => processComment(comment));
    const results = await Promise.allSettled(batchPromises);

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failCount = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

    totalSuccess += successCount;
    totalFail += failCount;

    console.log(`  ✅ Batch ${batchNumber} completed: ${successCount} succeeded, ${failCount} failed`);
  }

  console.log(`✅ All outdated comments processed: ${totalSuccess} succeeded, ${totalFail} failed`);
}

/**
 * メイン処理
 */
async function main() {
  console.log('🚀 cc-pulse PR Auto-Review (Phase 1.5)');
  console.log(`📋 Repository: ${env.GITHUB_REPOSITORY}`);
  console.log(`🔢 PR Number: ${env.PR_NUMBER}`);
  console.log('');

  try {
    // 1. PR差分を読み込む
    console.log('📖 Reading PR diff...');
    const diff = readPRDiff();
    console.log(`✅ Loaded ${diff.split('\n').length} lines of diff`);

    // 2. プロジェクトコンテキストを読み込む
    console.log('📖 Reading project context...');
    const context = readProjectContext();

    // 3. 最新のコミットSHAを取得
    console.log('🔍 Getting latest commit SHA...');
    const headSha = await getLatestCommitSha();
    console.log(`✅ Head SHA: ${headSha.substring(0, 7)}`);

    // 4. PRReviewerでレビュー実施
    const reviewer = new PRReviewer();
    const reviewResult = await reviewer.review(diff, context);
    console.log(`✅ Review completed: ${reviewResult.stats.total_issues} issues found`);

    // 5. Markdown形式にフォーマット
    const reviewMarkdown = formatReviewAsMarkdown(reviewResult);

    // 6. ファイル差分への行コメント投稿（Phase 1.5）
    console.log('');
    await postInlineComments(reviewResult, headSha);

    // 7. GitHubに統計サマリーコメント投稿
    console.log('');
    console.log('💬 Posting summary comment to GitHub...');
    await postReviewComment(reviewMarkdown);

    // 8. Outdatedコメントの修正状況チェック（Phase 1.5）
    await handleOutdatedComments(context);

    console.log('');
    console.log('✅ Review process completed successfully!');

    // 重大な問題がある場合も警告のみ（ワークフローは成功させる）
    if (reviewResult.stats.critical > 0) {
      console.log('⚠️ Critical issues found (see PR comment for details)');
    }

  } catch (error) {
    console.error('❌ Review process failed:', error);

    // エラー時はGitHubにコメント投稿を試みる
    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: parseInt(env.PR_NUMBER),
        body: `⚠️ 自動レビューでエラーが発生しました。\n\n\`\`\`\n${error}\n\`\`\``,
      });
    } catch (commentError) {
      console.error('❌ Failed to post error comment:', commentError);
    }

    process.exit(1);
  }
}

main();
