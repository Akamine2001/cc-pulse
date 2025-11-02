#!/usr/bin/env bun

/**
 * Send Jules Comments - Entry Point
 *
 * @julesコメントをJulesセッションに送信（Phase 3のみ）
 * コメント投稿時に軽量実行するための専用スクリプト
 */

import { Octokit } from 'octokit';
import { JulesCommentHandler } from './core/jules-comment-handler';

/**
 * 環境変数の検証（最小限）
 */
function validateEnv() {
  const required = {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    PR_NUMBER: process.env.PR_NUMBER,
    JULES_API_KEY: process.env.JULES_API_KEY,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    GITHUB_TOKEN: required.GITHUB_TOKEN!,
    GITHUB_REPOSITORY: required.GITHUB_REPOSITORY!,
    PR_NUMBER: required.PR_NUMBER!,
    JULES_API_KEY: required.JULES_API_KEY!,
  };
}

/**
 * メイン処理
 */
async function main() {
  console.log('🚀 Send Jules Comments (Phase 3 Only)');
  console.log('');

  // 環境変数の検証
  const env = validateEnv();

  // GitHub リポジトリ情報の解析
  const repoParts = env.GITHUB_REPOSITORY.split('/');
  if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
    throw new Error('Invalid GITHUB_REPOSITORY format');
  }
  const [owner, repo] = repoParts as [string, string];

  const prNumber = parseInt(env.PR_NUMBER);
  if (isNaN(prNumber)) {
    throw new Error('Invalid PR_NUMBER');
  }

  // Octokit クライアント初期化
  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });

  // Jules Comment Handler初期化
  const handler = new JulesCommentHandler(
    octokit,
    owner,
    repo,
    prNumber,
    env.JULES_API_KEY
  );

  // 実行
  await handler.execute();
}

// 実行
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
