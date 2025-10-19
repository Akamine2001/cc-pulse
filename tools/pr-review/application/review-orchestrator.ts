/**
 * Review Orchestrator
 *
 * PRレビューのメインフロー制御
 * 新仕様: 前回Conversation確認 → レビュー実施
 */

import type { Octokit } from 'octokit';
import { PRReviewer } from '../domain/reviewer';
import { processPreviousConversations } from './comment-processor';
import { collectExistingConversations, formatConversationsForPrompt } from '../domain/conversation-collector';
import { collectCommentsForDuplicateChecker } from '../domain/duplicate-checker-initializer';
import { readPRDiff } from '../infrastructure/file/diff-reader';
import { readProjectContext } from '../infrastructure/file/context-reader';
import { readReviewGuidelines } from '../infrastructure/file/guidelines-reader';
import { GitHubClient } from '../infrastructure/github/github-client';
import { postInlineComments, postReviewSummaryComment } from '../infrastructure/github/comment-poster';
import { formatReviewAsMarkdown } from '../shared/formatter';

export class ReviewOrchestrator {
  constructor(
    private octokit: Octokit,
    private githubClient: GitHubClient,
    private owner: string,
    private repo: string,
    private prNumber: number,
    private prAuthor: string,
    private repositoryName: string
  ) {}

  /**
   * メインレビュープロセスを実行
   */
  async execute(): Promise<void> {
    console.log('🚀 cc-pulse PR Auto-Review (Phase 2.0)');
    console.log(`📋 Repository: ${this.repositoryName}`);
    console.log(`🔢 PR Number: ${this.prNumber}`);
    console.log('');

    try {
      // ====== Phase 1: 前回のConversation処理 ======

      // 1. 最新のコミットSHAを取得
      console.log('🔍 Getting latest commit SHA...');
      const headSha = await this.githubClient.getLatestCommitSha(this.prNumber);
      console.log(`✅ Head SHA: ${headSha.substring(0, 7)}`);

      // 2. プロジェクトコンテキストを読み込む
      console.log('📖 Reading project context...');
      const context = readProjectContext();

      // 3. 前回のConversationを処理（差分チェック → A/B/C/D判定）
      await processPreviousConversations(
        this.octokit,
        this.githubClient,
        this.owner,
        this.repo,
        this.prNumber,
        this.prAuthor,
        headSha,
        context
      );

      // ====== Phase 2: 新規レビュー実施 ======

      // 4. PR差分を読み込む
      console.log('');
      console.log('📖 Reading PR diff...');
      const diff = readPRDiff();
      console.log(`✅ Loaded ${diff.split('\n').length} lines of diff`);

      // 5. レビュー観点を読み込む
      console.log('📖 Reading review guidelines...');
      const reviewGuidelines = readReviewGuidelines();

      // 6. 既存Conversationを収集（重複指摘を避けるため）
      console.log('📋 Collecting existing conversations...');
      const existingConversations = await collectExistingConversations(
        this.octokit,
        this.owner,
        this.repo,
        this.prNumber
      );
      const existingConversationsText = formatConversationsForPrompt(existingConversations);
      console.log(`✅ Found ${existingConversations.length} existing conversations`);

      // 6.5. Duplicate Checker DBを初期化
      console.log('📋 Initializing duplicate checker database...');
      const commentsForDb = await collectCommentsForDuplicateChecker(
        this.octokit,
        this.owner,
        this.repo,
        this.prNumber
      );
      console.log(`✅ Collected ${commentsForDb.length} comments for duplicate checker`);

      // TODO: MCPツールでDB初期化を呼び出す（Phase 3-2で実装）

      // 7. レビュー実施
      console.log('');
      console.log('🤖 Starting code review...');
      const reviewer = new PRReviewer();
      const reviewResult = await reviewer.review(
        diff,
        context,
        reviewGuidelines,
        existingConversationsText,
        commentsForDb
      );
      console.log(`✅ Review completed: ${reviewResult.stats.total_issues} issues found`);

      // 8. ファイル差分への行コメント投稿
      console.log('');
      await postInlineComments(this.githubClient, reviewResult, headSha, this.prNumber);

      // 9. GitHubに統計サマリーコメント投稿
      console.log('');
      console.log('💬 Posting summary comment to GitHub...');
      const reviewMarkdown = formatReviewAsMarkdown(reviewResult);
      await postReviewSummaryComment(this.githubClient, this.prNumber, reviewMarkdown);

      console.log('');
      console.log('✅ Review process completed successfully!');

      // 重大な問題がある場合も警告のみ（ワークフローは成功させる）
      if (reviewResult.stats.critical > 0) {
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
        await this.githubClient.postComment(
          this.prNumber,
          `⚠️ 自動レビューでエラーが発生しました。\n\n\`\`\`\n${errorMessage}${errorStack}\n\`\`\``
        );
      } catch (commentError) {
        console.error('❌ Failed to post error comment');
        if (commentError instanceof Error) {
          console.error(`   Error: ${commentError.message}`);
        } else {
          console.error(`   Error:`, commentError);
        }
      }

      throw error;
    }
  }
}
