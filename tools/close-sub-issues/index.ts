#!/usr/bin/env bun
/**
 * Close Sub-Issues on PR Merge
 *
 * PRがマージされた際に、関連するサブIssueを自動的にクローズする
 */
import { Octokit } from 'octokit';
import { z } from 'zod';
import { JulesApiClient } from '../feature-reviewer/core/jules-client';

// 環境変数スキーマ
const EnvSchema = z.object({
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  PR_NUMBER: z.string().regex(/^\d+$/, 'PR_NUMBER must be a number'),
  GITHUB_REPOSITORY: z.string().regex(/^[^/]+\/[^/]+$/, 'GITHUB_REPOSITORY must be in "owner/repo" format'),
  JULES_API_KEY: z.string().optional(),
});

function validateEnv() {
  return EnvSchema.parse({
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    PR_NUMBER: process.env.PR_NUMBER,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    JULES_API_KEY: process.env.JULES_API_KEY,
  });
}

// 環境変数のバリデーション
let env: z.infer<typeof EnvSchema>;
try {
  env = validateEnv();
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ 環境変数のバリデーションエラー:');
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
  } else {
    console.error('❌ 環境変数の検証に失敗しました:', error);
  }
  process.exit(1);
}

const [owner, repo] = env.GITHUB_REPOSITORY.split('/');
const prNumber = parseInt(env.PR_NUMBER, 10);

const octokit = new Octokit({ auth: env.GITHUB_TOKEN });

/**
 * PR本文からCloses/Fixes/Resolves #XXX パターンでIssue番号を抽出
 */
function extractParentIssueFromBody(body: string | null): number | null {
  if (!body) return null;
  const match = body.match(/(?:close[s]?|fix(?:es)?|resolve[s]?)\s+#(\d+)/i);
  return match && match[1] ? parseInt(match[1], 10) : null;
}

/**
 * 親IssueのコメントからサブIssue番号を抽出
 * パターン: "実装時は以下のIssueを参照してください：\n- #123"
 */
async function findSubIssueFromComments(parentIssueNumber: number): Promise<number | null> {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: parentIssueNumber,
    per_page: 100,
  });

  const subIssuePattern = /実装時は以下のIssueを参照してください：\s*\n\s*-\s*#(\d+)/;

  for (const comment of comments) {
    const match = comment.body?.match(subIssuePattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

/**
 * Issueにコメントを投稿してクローズ
 */
async function closeIssueWithComment(
  issueNumber: number,
  comment: string
): Promise<void> {
  // コメント投稿
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: comment,
  });

  // Issueクローズ
  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    state: 'closed',
  });
}

/**
 * サブIssueをクローズ
 */
async function closeSubIssue(subIssueNumber: number, parentIssueNumber: number): Promise<void> {
  const comment = `✅ PR #${prNumber} がマージされたため、このサブIssueをクローズします。

親Issue: #${parentIssueNumber}
マージされたPR: #${prNumber}`;

  await closeIssueWithComment(subIssueNumber, comment);
  console.log(`✅ サブIssue #${subIssueNumber} をクローズしました`);
}

/**
 * 親Issueをクローズ（Jules APIフォールバック時のみ）
 */
async function closeParentIssue(parentIssueNumber: number, subIssueNumber: number | null): Promise<void> {
  let comment = `✅ PR #${prNumber} がマージされたため、このIssueをクローズします。

マージされたPR: #${prNumber}`;

  if (subIssueNumber) {
    comment += `\nサブIssue: #${subIssueNumber}`;
  }

  await closeIssueWithComment(parentIssueNumber, comment);
  console.log(`✅ 親Issue #${parentIssueNumber} をクローズしました`);
}

async function main(): Promise<void> {
  console.log(`🔍 PR #${prNumber} の関連Issue情報を取得中...`);

  // 1. PR情報を取得
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  // 2. PR本文から親Issue番号を抽出
  let parentIssueNumber = extractParentIssueFromBody(pr.body);
  let foundViaJulesApi = false;

  if (parentIssueNumber) {
    console.log(`✅ PR本文から親Issue #${parentIssueNumber} を検出`);
    console.log('ℹ️  親IssueはGitHub標準機能で自動クローズされます');
  } else {
    console.log('ℹ️  PR本文にIssue参照がありません');

    // 3. Jules APIでIssue番号を逆引き（フォールバック）
    if (env.JULES_API_KEY) {
      console.log('🔍 Jules APIで親Issueを検索中...');
      try {
        const julesClient = new JulesApiClient(env.JULES_API_KEY, owner, repo);
        const issueNumber = await julesClient.findIssueNumberForPR(prNumber);
        if (issueNumber) {
          parentIssueNumber = issueNumber;
          foundViaJulesApi = true;
          console.log(`✅ Jules APIから親Issue #${parentIssueNumber} を検出`);
        } else {
          console.log('⚠️  Jules APIでも親Issueが見つかりませんでした');
        }
      } catch (error) {
        console.warn('⚠️  Jules API呼び出しに失敗:', error);
      }
    } else {
      console.log('ℹ️  JULES_API_KEYが設定されていないため、フォールバック検索をスキップ');
    }
  }

  if (!parentIssueNumber) {
    console.log('⚠️  親Issueが見つかりませんでした。処理を終了します。');
    return;
  }

  // 4. 親IssueのコメントからサブIssue番号を取得
  console.log(`🔍 親Issue #${parentIssueNumber} のコメントからサブIssueを検索中...`);
  const subIssueNumber = await findSubIssueFromComments(parentIssueNumber);

  if (subIssueNumber) {
    console.log(`✅ サブIssue #${subIssueNumber} を検出`);
    // 5. サブIssueをクローズ
    await closeSubIssue(subIssueNumber, parentIssueNumber);
  } else {
    console.log('ℹ️  サブIssueが見つかりませんでした');
  }

  // 6. Jules APIフォールバック時は親Issueもクローズ
  //    （PR本文に Closes #X がある場合はGitHubが自動でクローズするのでスキップ）
  if (foundViaJulesApi) {
    console.log('🔍 Jules APIで検出した親Issueをクローズします...');
    await closeParentIssue(parentIssueNumber, subIssueNumber);
  }

  console.log('');
  console.log('### ✅ Issue自動クローズ完了');
  console.log(`- 親Issue: #${parentIssueNumber}${foundViaJulesApi ? ' (クローズ済み)' : ' (GitHub自動クローズ)'}`);
  if (subIssueNumber) {
    console.log(`- サブIssue: #${subIssueNumber} (クローズ済み)`);
  }
  console.log(`- マージされたPR: #${prNumber}`);
}

main().catch((error) => {
  console.error('❌ エラーが発生しました:', error);
  process.exit(1);
});
