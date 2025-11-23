#!/usr/bin/env bun

/**
 * Jules Session Creator - Entry Point
 *
 * GitHub Actionsから /jules コマンドを処理するためのエントリーポイント
 */

import { Octokit } from 'octokit';
import { validateJulesSessionEnv } from '../shared/env';
import { JulesSessionCreator } from './session-creator';

/**
 * メイン処理
 */
async function main() {
  console.log('🚀 Jules Session Creator');
  const env = validateJulesSessionEnv();

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
