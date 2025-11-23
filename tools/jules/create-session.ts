#!/usr/bin/env bun

/**
 * Jules Session Creator - Entry Point
 *
 * GitHub Actionsから /jules コマンドを処理するためのエントリーポイント
 */

import { Octokit } from 'octokit';
import { z } from 'zod';
import { JulesSessionCreator } from './session-creator';

/**
 * 環境変数のバリデーション
 */
const EnvSchema = z.object({
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  JULES_API_KEY: z.string().min(1, 'JULES_API_KEY is required'),
  GITHUB_REPOSITORY: z.string().regex(/^[^/]+\/[^/]+$/, 'GITHUB_REPOSITORY must be in "owner/repo" format'),
  ISSUE_NUMBER: z.string().regex(/^\d+$/, 'ISSUE_NUMBER must be a number'),
  COMMENT_BODY: z.string().min(1, 'COMMENT_BODY is required'),
  COMMENT_USER: z.string().min(1, 'COMMENT_USER is required'),
});

function validateEnv() {
  return EnvSchema.parse(process.env);
}

/**
 * メイン処理
 */
async function main() {
  console.log('🚀 Jules Session Creator');
  const env = validateEnv();

  const [owner, repo] = env.GITHUB_REPOSITORY.split('/');
  if (!owner || !repo) {
    throw new Error('Invalid GITHUB_REPOSITORY format');
  }

  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });

  const sessionCreator = new JulesSessionCreator(
    octokit,
    owner,
    repo,
    parseInt(env.ISSUE_NUMBER),
    env.COMMENT_BODY,
    env.COMMENT_USER
  );

  await sessionCreator.execute();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
