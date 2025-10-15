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
 * レビュー結果から除外箇所をフィルタリング
 */
function filterExcludedIssues(
  reviewResult: ReviewResult,
  excludedLocations: Array<{ file: string; line: number; status: string }>
): ReviewResult {
  if (excludedLocations.length === 0) {
    return reviewResult;
  }

  console.log(`🔍 Filtering ${excludedLocations.length} excluded locations from review...`);

  const filteredIssues = reviewResult.issues.filter(issue => {
    if (!issue.file_path || !issue.line_range) {
      return true; // ファイルパス・行番号がない問題は除外しない
    }

    // 除外箇所に該当するか確認
    const isExcluded = excludedLocations.some(excluded =>
      issue.file_path === excluded.file &&
      issue.line_range!.start <= excluded.line &&
      issue.line_range!.end >= excluded.line
    );

    return !isExcluded;
  });

  const excludedCount = reviewResult.issues.length - filteredIssues.length;
  console.log(`  ✅ Filtered out ${excludedCount} issues at excluded locations`);

  // 統計を再計算
  const stats = {
    total_issues: filteredIssues.length,
    critical: filteredIssues.filter(i => i.severity === 'critical').length,
    high: filteredIssues.filter(i => i.severity === 'high').length,
    medium: filteredIssues.filter(i => i.severity === 'medium').length,
    low: filteredIssues.filter(i => i.severity === 'low').length
  };

  return {
    ...reviewResult,
    issues: filteredIssues,
    stats
  };
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

interface CommentState {
  comment: any;
  status: 'fixed' | 'todo_added' | 'needs_decision' | 'not_fixed';
  threadId: string | undefined;
  message: string;
}

/**
 * 前回のレビューコメントの修正状況をチェック（内容ベース比較）
 */
async function handleResolvedIssues(
  currentReviewResult: ReviewResult,
  context: string
): Promise<Array<{ file: string; line: number; status: string }>> {
  console.log('');
  console.log('🔍 Checking previous review comments for resolution...');

  // 1. 前回のコメント取得
  const previousComments = await octokit.rest.pulls.listReviewComments({
    owner,
    repo,
    pull_number: parseInt(env.PR_NUMBER)
  });

  // 2. 自動レビューのコメントのみ抽出
  const allPreviousComments = previousComments.data.filter(
    c => c.body.includes('🤖 Auto-Review')
  );

  if (allPreviousComments.length === 0) {
    console.log('✅ No previous comments to check');
    return [];
  }

  console.log(`📋 Found ${allPreviousComments.length} previous review comments`);

  // 上限設定: 最大50件まで処理（直列実行）
  const MAX_COMMENTS = 50;
  const commentsToCheck = allPreviousComments.slice(0, MAX_COMMENTS);

  if (allPreviousComments.length > MAX_COMMENTS) {
    console.log(`⚠️ Processing first ${MAX_COMMENTS} comments (sequential execution)`);
  } else {
    console.log(`📋 Processing ${commentsToCheck.length} comments (sequential execution)`);
  }

  // 3. GraphQL threadIdマッピング
  const resolver = new ThreadResolver(octokit);
  const threadMap = await resolver.buildThreadMap(owner, repo, parseInt(env.PR_NUMBER));

  // 4. 各コメントの修正判定（内容ベース比較 + Claude判定）
  const checker = new ResolutionChecker();
  const parser = new DiffParser();
  const commentStates: CommentState[] = [];

  // 直列実行（Claude Agent SDKの並列実行制約のため）
  let processedCount = 0;
  for (const comment of commentsToCheck) {
    processedCount++;
    console.log(`🔄 Processing comment ${processedCount}/${commentsToCheck.length}...`);

    try {
      // 前回の問題を抽出
      const previousIssueData = parser.extractIssueFromComment(comment.body);
      if (!previousIssueData) {
        console.log(`⚠️ Could not parse issue from comment ${comment.id}`);
        continue;
      }

      // カテゴリ判定は行わず、全てのコメントについてClaude AIで現在の状態を確認
      const previousIssue: ReviewIssue = {
        severity: previousIssueData.severity as any,
        category: previousIssueData.category,
        description: previousIssueData.description,
        file_path: comment.path,
        line_range: comment.line ? { start: comment.line, end: comment.line } : undefined,
        impact: '',
        suggestion: ''
      };

      const originalCode = parser.extractCodeSnippetFromComment(comment.body);
      const currentCode = await parser.getCurrentCode(
        comment.path,
        comment.line || 1,
        comment.line || 1
      );

      console.log(`🔍 Checking resolution for: ${previousIssue.description.substring(0, 50)}...`);

      const resolution = await checker.checkResolution(
        previousIssue,
        originalCode,
        currentCode,
        context
      );

      console.log(`  ${comment.path}:${comment.line} - ${resolution.status}`);

      commentStates.push({
        comment,
        status: resolution.status,
        threadId: threadMap.get(comment.id),
        message: resolution.reasoning
      });
    } catch (error) {
      console.error(`❌ Failed to check comment ${comment.id}`);
      console.error(`   Comment: ${comment.path}:${comment.line}`);
      console.error(`   Comment body preview: ${comment.body.substring(0, 100)}...`);
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
        console.error(`   Error name: ${error.name}`);
        console.error(`   Stack: ${error.stack}`);
      } else {
        console.error(`   Error:`, error);
      }
      // エラーがあっても続行（他のコメントの処理を継続）
      console.log('⚠️ Continuing with next comment...');
    }
  }

  // 5. Resolve処理と返信
  console.log('');
  console.log('💬 Processing comment resolutions...');

  for (const state of commentStates) {
    try {
      switch (state.status) {
        case 'fixed':
          // Resolve + 返信
          if (state.threadId) {
            await resolver.resolveThread(state.threadId);
          }
          await octokit.rest.pulls.createReplyForReviewComment({
            owner,
            repo,
            pull_number: parseInt(env.PR_NUMBER),
            comment_id: state.comment.id,
            body: `✅ 修正を確認しました\n\n${state.message}`
          });
          console.log(`  ✅ Resolved: ${state.comment.path}:${state.comment.line}`);
          break;

        case 'todo_added':
          // Resolve + 返信
          if (state.threadId) {
            await resolver.resolveThread(state.threadId);
          }
          await octokit.rest.pulls.createReplyForReviewComment({
            owner,
            repo,
            pull_number: parseInt(env.PR_NUMBER),
            comment_id: state.comment.id,
            body: `✅ TODOとして記録されました\n\n${state.message}`
          });
          console.log(`  ✅ Resolved (TODO): ${state.comment.path}:${state.comment.line}`);
          break;

        case 'needs_decision':
          // オーナーメンション（Resolveしない）
          await octokit.rest.pulls.createReplyForReviewComment({
            owner,
            repo,
            pull_number: parseInt(env.PR_NUMBER),
            comment_id: state.comment.id,
            body: `@${env.PR_AUTHOR || owner} こちらの判断をお願いします\n\n${state.message}`
          });
          console.log(`  ⚠️ Needs decision: ${state.comment.path}:${state.comment.line}`);
          break;

        case 'implementation_changed':
          // 実装が大幅変更 → Resolve + 返信
          if (state.threadId) {
            await resolver.resolveThread(state.threadId);
          }
          await octokit.rest.pulls.createReplyForReviewComment({
            owner,
            repo,
            pull_number: parseInt(env.PR_NUMBER),
            comment_id: state.comment.id,
            body: `✅ 実装が大幅に変更されました

${state.message}

前回の指摘は無効になりました。新しい実装に問題があれば別途レビューでお知らせします。`
          });
          console.log(`  ✅ Resolved (implementation changed): ${state.comment.path}:${state.comment.line}`);
          break;

        case 'not_fixed':
          // 未修正の理由を説明して対応を催促
          await octokit.rest.pulls.createReplyForReviewComment({
            owner,
            repo,
            pull_number: parseInt(env.PR_NUMBER),
            comment_id: state.comment.id,
            body: `⚠️ まだ修正されていません

**理由**: ${state.message}

引き続き対応をお願いします 🙏`
          });
          console.log(`  ⚠️ Not fixed (reminded): ${state.comment.path}:${state.comment.line}`);
          break;
      }
    } catch (error) {
      console.error(`❌ Failed to process comment ${state.comment.id}`);
      console.error(`   Comment: ${state.comment.path}:${state.comment.line}`);
      console.error(`   Status: ${state.status}`);
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
      } else {
        console.error(`   Error:`, error);
      }
    }
  }

  // 6. 除外すべき箇所をリスト化（TODO/質問中/未修正）
  const excludedLocations = commentStates
    .filter(state =>
      state.status === 'todo_added' ||
      state.status === 'needs_decision' ||
      state.status === 'not_fixed'
    )
    .map(state => ({
      file: state.comment.path,
      line: state.comment.line || 0,
      status: state.status
    }));

  const resolvedCount = commentStates.filter(s => s.status === 'fixed' || s.status === 'todo_added').length;
  console.log(`✅ Comment resolution completed: ${resolvedCount} resolved, ${excludedLocations.length} excluded from new review`);

  return excludedLocations;
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
    // ====== Phase A: 前回のコメント処理 ======

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

    // 4. まず仮レビューを実施（前回のコメントと比較するため）
    console.log('');
    console.log('📋 Running initial review for comparison...');
    const reviewer = new PRReviewer();
    const initialReviewResult = await reviewer.review(diff, context);
    console.log(`✅ Initial review completed: ${initialReviewResult.stats.total_issues} issues found`);

    // 5. 前回のコメント処理（Resolve判定 + 除外箇所リスト作成）
    const excludedLocations = await handleResolvedIssues(initialReviewResult, context);

    // ====== Phase B: 新しいレビュー実施（除外箇所を考慮） ======

    // 6. 除外箇所をフィルタリング
    console.log('');
    const filteredReviewResult = filterExcludedIssues(initialReviewResult, excludedLocations);
    console.log(`✅ Final review: ${filteredReviewResult.stats.total_issues} issues (after filtering)`);

    // 7. ファイル差分への行コメント投稿（フィルタリング済み）
    console.log('');
    await postInlineComments(filteredReviewResult, headSha);

    // 8. GitHubに統計サマリーコメント投稿（フィルタリング済み）
    console.log('');
    console.log('💬 Posting summary comment to GitHub...');
    const reviewMarkdown = formatReviewAsMarkdown(filteredReviewResult);
    await postReviewComment(reviewMarkdown);

    console.log('');
    console.log('✅ Review process completed successfully!');

    // 重大な問題がある場合も警告のみ（ワークフローは成功させる）
    if (filteredReviewResult.stats.critical > 0) {
      console.log('⚠️ Critical issues found (see PR comment for details)');
    }

  } catch (error) {
    console.error('❌ Review process failed');
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    } else {
      console.error(`   Error:`, error);
    }

    // エラー時はGitHubにコメント投稿を試みる
    try {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error && error.stack ? `\n\nStack trace:\n${error.stack}` : '';
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: parseInt(env.PR_NUMBER),
        body: `⚠️ 自動レビューでエラーが発生しました。\n\n\`\`\`\n${errorMessage}${errorStack}\n\`\`\``,
      });
    } catch (commentError) {
      console.error('❌ Failed to post error comment');
      if (commentError instanceof Error) {
        console.error(`   Error: ${commentError.message}`);
      } else {
        console.error(`   Error:`, commentError);
      }
    }

    process.exit(1);
  }
}

main();
