/**
 * Comment Processor
 *
 * 前回のConversation（レビューコメント）の処理
 * 新仕様: 差分チェック → A/B/C/D判定
 */

import type { Octokit } from 'octokit';
import type { ReviewIssue } from '../types';
import { ConversationDiffAnalyzer } from '../domain/conversation-diff-analyzer';
import { ThreadResolver } from '../infrastructure/github/thread-resolver';
import { GitHubClient } from '../infrastructure/github/github-client';
import { DiffParser } from '../shared/diff-parser';

/**
 * 前回のConversationを処理
 *
 * @param octokit Octokitインスタンス
 * @param githubClient GitHub APIクライアント
 * @param owner リポジトリオーナー
 * @param repo リポジトリ名
 * @param prNumber PR番号
 * @param prAuthor PR作成者
 * @param latestCommitSha 最新のコミットSHA
 * @param context プロジェクトコンテキスト
 */
export async function processPreviousConversations(
  octokit: Octokit,
  githubClient: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
  prAuthor: string,
  latestCommitSha: string,
  context: string
): Promise<void> {
  console.log('');
  console.log('🔍 Checking previous conversations...');

  // 1. 前回のコメント取得
  const previousComments = await octokit.rest.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber
  });

  // 2. 自動レビューのコメントのみ抽出
  const autoReviewComments = previousComments.data.filter(
    c => c.body.includes('🤖 Auto-Review')
  );

  if (autoReviewComments.length === 0) {
    console.log('✅ No previous conversations to process');
    return;
  }

  console.log(`📋 Found ${autoReviewComments.length} previous conversations`);

  // 上限設定: 最大50件まで処理
  const MAX_COMMENTS = 50;
  const commentsToCheck = autoReviewComments.slice(0, MAX_COMMENTS);

  if (autoReviewComments.length > MAX_COMMENTS) {
    console.log(`⚠️ Processing first ${MAX_COMMENTS} comments`);
  }

  // 3. GraphQL threadIdマッピング + resolve済みスレッド取得
  const resolver = new ThreadResolver(octokit);
  const threadMap = await resolver.buildThreadMap(owner, repo, prNumber);
  const resolvedThreadIds = await resolver.getResolvedThreadIds(owner, repo, prNumber);

  // 4. 各Conversationを処理
  const analyzer = new ConversationDiffAnalyzer();
  const parser = new DiffParser();
  let processedCount = 0;
  let skippedCount = 0;

  for (const comment of commentsToCheck) {
    processedCount++;
    console.log(`🔄 Processing conversation ${processedCount}/${commentsToCheck.length}...`);

    // resolve済みならスキップ
    const threadId = threadMap.get(comment.id);
    if (threadId && resolvedThreadIds.has(threadId)) {
      console.log(`  ✅ Skipped (already resolved): ${comment.path}:${comment.line}`);
      skippedCount++;
      continue;
    }

    try {
      // コメントから前回の問題を抽出
      const previousIssueData = parser.extractIssueFromComment(comment.body);
      if (!previousIssueData) {
        console.log(`⚠️ Could not parse issue from comment ${comment.id}`);
        continue;
      }

      const previousIssue: ReviewIssue = {
        severity: previousIssueData.severity as any,
        category: previousIssueData.category,
        description: previousIssueData.description,
        file_path: comment.path,
        line_range: comment.line ? { start: comment.line, end: comment.line } : undefined,
        impact: '',
        suggestion: ''
      };

      // コメント投稿時のコミットSHA
      const commentCommitSha = comment.original_commit_id;

      // ファイル差分を取得（コメント投稿時 〜 最新）
      const fileDiff = await githubClient.getFileDiff(
        comment.path,
        commentCommitSha,
        latestCommitSha
      );

      // 差分なし → 修正されていない
      if (fileDiff === '') {
        console.log(`  ⚠️ No changes: ${comment.path}:${comment.line}`);
        await octokit.rest.pulls.createReplyForReviewComment({
          owner,
          repo,
          pull_number: prNumber,
          comment_id: comment.id,
          body: `⚠️ このファイルはコメント投稿後に変更されていません。

引き続き対応をお願いします 🙏`
        });
        continue;
      }

      // 差分あり → 返信チェック（D判定）
      const replyCount = await githubClient.getConversationReplies(prNumber, comment.id);
      const hasReplies = replyCount > 1; // 元のコメント + 返信

      if (hasReplies) {
        // D: Conversationへ返信あり → オーナーメンション、クローズしない
        console.log(`  💬 Has replies: ${comment.path}:${comment.line}`);
        await octokit.rest.pulls.createReplyForReviewComment({
          owner,
          repo,
          pull_number: prNumber,
          comment_id: comment.id,
          body: `@${prAuthor} こちらのConversationについて、判断をお願いします。

ファイルに変更がありましたが、議論が継続中のため、自動クローズしていません。`
        });
        continue;
      }

      // 差分あり + 返信なし → Claude AIで A/B/C判定
      const checkResult = await analyzer.analyzeDiff(previousIssue, fileDiff, context);

      console.log(`  ${comment.path}:${comment.line} - ${checkResult.action}`);

      const threadId = threadMap.get(comment.id);

      switch (checkResult.action) {
        case 'major_change':
          // A: 大幅に実装が変わっている → クローズ
          if (threadId) {
            await resolver.resolveThread(threadId);
          }
          await octokit.rest.pulls.createReplyForReviewComment({
            owner,
            repo,
            pull_number: prNumber,
            comment_id: comment.id,
            body: `✅ 実装が大幅に変更されました

${checkResult.reasoning}

前回の指摘は無効になりました。新しい実装に問題があれば、次のレビューでお知らせします。`
          });
          console.log(`  ✅ Closed (major change): ${comment.path}:${comment.line}`);
          break;

        case 'todo_added':
          // B: TODO/コメントで対応計画記載 → クローズ
          if (threadId) {
            await resolver.resolveThread(threadId);
          }
          await octokit.rest.pulls.createReplyForReviewComment({
            owner,
            repo,
            pull_number: prNumber,
            comment_id: comment.id,
            body: `✅ TODO/コメントで対応計画が記載されました

${checkResult.reasoning}

対応計画が明確なため、クローズします。`
          });
          console.log(`  ✅ Closed (TODO added): ${comment.path}:${comment.line}`);
          break;

        case 'not_resolved':
          // C: 根本的解決でない → 再コメント（クローズしない）
          await octokit.rest.pulls.createReplyForReviewComment({
            owner,
            repo,
            pull_number: prNumber,
            comment_id: comment.id,
            body: `⚠️ まだ根本的な解決に至っていません

${checkResult.reasoning}

引き続き対応をお願いします 🙏`
          });
          console.log(`  ⚠️ Not resolved (re-commented): ${comment.path}:${comment.line}`);
          break;
      }

    } catch (error) {
      console.error(`❌ Failed to process conversation for comment ${comment.id}`);
      console.error(`   Comment: ${comment.path}:${comment.line}`);
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
      } else {
        console.error(`   Error:`, error);
      }
      // エラーがあっても続行
      console.log('⚠️ Continuing with next conversation...');
    }
  }

  console.log(`✅ Processed ${processedCount} conversations (${skippedCount} skipped as already resolved)`);
}
