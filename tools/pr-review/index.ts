#!/usr/bin/env bun

/**
 * PR Auto-Review Tool - Entry Point
 *
 * GitHub ActionsからPRレビューを実行するためのエントリーポイント
 */

import { Octokit } from 'octokit';
import { validateEnv } from './shared/env';
import { PRClient } from '../shared/github/pr-client';
import { ReviewOrchestrator } from './core/orchestrator';

/**
 * メイン処理
 */
async function main() {
  // 環境変数の検証
  const env = validateEnv();

  // GitHub リポジトリ情報の解析
  const repoParts = env.GITHUB_REPOSITORY.split('/');
  if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
    throw new Error('Invalid GITHUB_REPOSITORY format');
  }
  const [owner, repo] = repoParts as [string, string];

  // Octokit クライアント初期化
  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });

  // GitHub Client初期化
  const githubClient = new PRClient(octokit, owner, repo);

  // Review Orchestrator初期化
  const orchestrator = new ReviewOrchestrator(
    octokit,
    githubClient,
    owner,
    repo,
    parseInt(env.PR_NUMBER),
    env.PR_AUTHOR || owner,
    env.GITHUB_REPOSITORY,
    env.JULES_API_KEY
  );

  // レビュープロセス実行
  await orchestrator.execute();
}

// 実行
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
