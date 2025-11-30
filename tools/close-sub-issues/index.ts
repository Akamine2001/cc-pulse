/**
 * Close Sub-Issues on PR Merge
 *
 * PRがマージされた際に、関連するサブIssueを自動的にクローズする
 */
import { Octokit } from 'octokit';
import { JulesApiClient } from '../feature-reviewer/core/jules-client';

// 環境変数
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const JULES_API_KEY = process.env.JULES_API_KEY;
const PR_NUMBER = process.env.PR_NUMBER;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;

if (!GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN is required');
  process.exit(1);
}

if (!PR_NUMBER) {
  console.error('❌ PR_NUMBER is required');
  process.exit(1);
}

if (!GITHUB_REPOSITORY) {
  console.error('❌ GITHUB_REPOSITORY is required');
  process.exit(1);
}

const [owner, repo] = GITHUB_REPOSITORY.split('/');
const prNumber = parseInt(PR_NUMBER, 10);

const octokit = new Octokit({ auth: GITHUB_TOKEN });

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
 * サブIssueにコメントを投稿してクローズ
 */
async function closeSubIssue(subIssueNumber: number, parentIssueNumber: number): Promise<void> {
  const comment = `✅ PR #${prNumber} がマージされたため、このサブIssueをクローズします。

親Issue: #${parentIssueNumber}
マージされたPR: #${prNumber}`;

  // コメント投稿
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: subIssueNumber,
    body: comment,
  });

  // Issueクローズ
  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: subIssueNumber,
    state: 'closed',
  });

  console.log(`✅ サブIssue #${subIssueNumber} をクローズしました`);
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

  if (parentIssueNumber) {
    console.log(`✅ PR本文から親Issue #${parentIssueNumber} を検出`);
  } else {
    console.log('ℹ️  PR本文にIssue参照がありません');

    // 3. Jules APIでIssue番号を逆引き（フォールバック）
    if (JULES_API_KEY) {
      console.log('🔍 Jules APIで親Issueを検索中...');
      try {
        const julesClient = new JulesApiClient(JULES_API_KEY, owner, repo);
        const issueNumber = await julesClient.findIssueNumberForPR(prNumber);
        if (issueNumber) {
          parentIssueNumber = issueNumber;
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

  if (!subIssueNumber) {
    console.log('⚠️  サブIssueが見つかりませんでした。処理を終了します。');
    return;
  }

  console.log(`✅ サブIssue #${subIssueNumber} を検出`);

  // 5. サブIssueをクローズ
  await closeSubIssue(subIssueNumber, parentIssueNumber);

  console.log('');
  console.log('### ✅ サブIssue自動クローズ完了');
  console.log(`- 親Issue: #${parentIssueNumber}`);
  console.log(`- サブIssue: #${subIssueNumber}`);
  console.log(`- マージされたPR: #${prNumber}`);
}

main().catch((error) => {
  console.error('❌ エラーが発生しました:', error);
  process.exit(1);
});
