#!/usr/bin/env bun

/**
 * Feature Reviewer - Entry Point
 *
 * GitHub ActionsからIssue分析・レビュー観点生成を実行するためのエントリーポイント
 */

import { Octokit } from 'octokit';
import { FeatureReviewOrchestrator } from './core/orchestrator';
import { z } from 'zod';

/**
 * 環境変数のバリデーション
 */
const EnvSchema = z.object({
  CLAUDE_CODE_OAUTH_TOKEN: z.string().min(1, 'CLAUDE_CODE_OAUTH_TOKEN is required'),
  JULES_API_KEY: z.string().min(1, 'JULES_API_KEY is required'),
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  ISSUE_NUMBER: z.string().regex(/^\d+$/, 'ISSUE_NUMBER must be a number'),
  GITHUB_REPOSITORY: z.string().regex(/^[^/]+\/[^/]+$/, 'GITHUB_REPOSITORY must be in "owner/repo" format')
});

function validateEnv() {
  return EnvSchema.parse({
    CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
    JULES_API_KEY: process.env.JULES_API_KEY,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    ISSUE_NUMBER: process.env.ISSUE_NUMBER,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY
  });
}

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

  // Feature Review Orchestrator初期化
  const orchestrator = new FeatureReviewOrchestrator(
    octokit,
    owner,
    repo,
    parseInt(env.ISSUE_NUMBER)
  );

  // レビュー観点生成プロセス実行
  await orchestrator.execute();
}

// 実行
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
