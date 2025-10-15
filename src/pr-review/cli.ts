#!/usr/bin/env bun

/**
 * cc-pulse: PR Auto-Review CLI
 *
 * GitHub ActionsからPRレビューを実行するためのエントリーポイント
 */

import { Octokit } from 'octokit';
import { readFileSync, existsSync } from 'fs';
import { PRReviewer } from './reviewer';
import { formatReviewAsMarkdown } from './formatter';

// 環境変数の検証
const CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;

if (!CLAUDE_CODE_OAUTH_TOKEN) {
  console.error('❌ CLAUDE_CODE_OAUTH_TOKEN is not set');
  process.exit(1);
}

if (!GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN is not set');
  process.exit(1);
}

if (!PR_NUMBER) {
  console.error('❌ PR_NUMBER is not set');
  process.exit(1);
}

if (!GITHUB_REPOSITORY) {
  console.error('❌ GITHUB_REPOSITORY is not set');
  process.exit(1);
}

// GitHub リポジトリ情報の解析
const [owner, repo] = GITHUB_REPOSITORY.split('/');

// Octokit クライアント初期化
const octokit = new Octokit({ auth: GITHUB_TOKEN });

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
      issue_number: parseInt(PR_NUMBER!),
      body,
    });

    console.log('✅ Posted review comment to GitHub');
  } catch (error) {
    console.error('❌ Failed to post comment to GitHub:', error);
    throw error;
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log('🚀 cc-pulse PR Auto-Review (Phase 1)');
  console.log(`📋 Repository: ${GITHUB_REPOSITORY}`);
  console.log(`🔢 PR Number: ${PR_NUMBER}`);
  console.log('');

  try {
    // 1. PR差分を読み込む
    console.log('📖 Reading PR diff...');
    const diff = readPRDiff();
    console.log(`✅ Loaded ${diff.split('\n').length} lines of diff`);

    // 2. プロジェクトコンテキストを読み込む
    console.log('📖 Reading project context...');
    const context = readProjectContext();

    // 3. PRReviewerでレビュー実施
    const reviewer = new PRReviewer();
    const reviewResult = await reviewer.review(diff, context);
    console.log(`✅ Review completed: ${reviewResult.stats.total_issues} issues found`);

    // 4. Markdown形式にフォーマット
    const reviewMarkdown = formatReviewAsMarkdown(reviewResult);

    // 5. GitHubにコメント投稿
    console.log('💬 Posting review comment to GitHub...');
    await postReviewComment(reviewMarkdown);

    console.log('');
    console.log('✅ Review process completed successfully!');

    // 重大な問題がある場合は終了コード1を返す
    if (reviewResult.stats.critical > 0) {
      console.log('⚠️ Critical issues found, exiting with code 1');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Review process failed:', error);

    // エラー時はGitHubにコメント投稿を試みる
    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: parseInt(PR_NUMBER!),
        body: `⚠️ 自動レビューでエラーが発生しました。\n\n\`\`\`\n${error}\n\`\`\``,
      });
    } catch (commentError) {
      console.error('❌ Failed to post error comment:', commentError);
    }

    process.exit(1);
  }
}

main();
