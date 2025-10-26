/**
 * Review Orchestrator
 *
 * PRレビューのメインフロー制御
 * 新仕様: 前回Conversation確認 → レビュー実施
 */

import type { Octokit } from 'octokit';
import { unlink } from 'fs/promises';
import { PRReviewer } from './reviewer';
import { CommentResolver } from './comment-resolver';
import { collectExistingConversations } from '../lib/parsers';
import { readPRDiff, readReviewGuidelines, saveDiffByFiles, deleteTempDiffFiles } from '../lib/files';
import { PRClient } from '../../shared/github/pr-client';
import { ThreadResolver } from '../../shared/github/thread-resolver';
import { GuidelinesExtractor } from '../../shared/github/guidelines-extractor';

export class ReviewOrchestrator {
  constructor(
    private octokit: Octokit,
    private githubClient: PRClient,
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

    const commentsFilePath = `/tmp/review-comments-${this.prNumber}.json`;

    try {
      // ====== Phase 0: レビュー観点の動的取得 ======

      console.log('');
      const guidelinesExtractor = new GuidelinesExtractor(
        this.octokit,
        this.owner,
        this.repo
      );

      const dynamicGuidelines = await guidelinesExtractor.extractFromPR(this.prNumber);

      // ====== Phase 1: 前回のConversation処理 ======

      console.log('');
      // 1. 最新のコミットSHAを取得
      console.log('🔍 Getting latest commit SHA...');
      const headSha = await this.githubClient.getLatestCommitSha(this.prNumber);
      console.log(`✅ Head SHA: ${headSha.substring(0, 7)}`);

      // 2. 既存Conversationを収集（前回コメント取得 + threadIdマッピング）
      console.log('📋 Collecting existing conversations...');
      const existingConversations = await collectExistingConversations(
        this.octokit,
        this.owner,
        this.repo,
        this.prNumber
      );
      console.log(`✅ Found ${existingConversations.length} existing conversations`);

      // 4. ThreadResolverでthreadIdマッピング作成
      console.log('🔍 Building thread ID mapping...');
      const threadResolver = new ThreadResolver(this.octokit);
      const threadMap = await threadResolver.buildThreadMap(this.owner, this.repo, this.prNumber);
      console.log(`✅ Built thread map: ${threadMap.size} comments mapped`);

      // 5. Resolve済みthread IDを取得
      console.log('🔍 Fetching resolved thread IDs...');
      const resolvedThreadIds = await threadResolver.getResolvedThreadIds(this.owner, this.repo, this.prNumber);
      console.log(`✅ Found ${resolvedThreadIds.size} resolved threads`);

      // 6. 既存コメントにthreadIdとis_resolvedを追加
      const commentsWithThreadIds = existingConversations.map(comment => {
        const threadId = threadMap.get(comment.comment_id) || null;
        return {
          ...comment,
          thread_id: threadId,
          is_resolved: threadId ? resolvedThreadIds.has(threadId) : false
        };
      });

      // 7. 既存コメントをJSONファイルに保存
      await Bun.write(commentsFilePath, JSON.stringify(commentsWithThreadIds, null, 2));
      console.log(`✅ Saved ${commentsWithThreadIds.length} comments to ${commentsFilePath}`);

      // 8. PR差分を読み込んでファイル単位で分割保存
      console.log('📖 Reading PR diff...');
      const diff = readPRDiff();
      const diffFiles = saveDiffByFiles(diff);
      console.log(`✅ Saved ${diffFiles.length} diff files`);

      // 9. 前回コメントを解決（Claude Agent SDKで判定）
      if (commentsWithThreadIds.length > 0) {
        console.log('');
        console.log('🔄 Resolving previous comments...');
        const commentResolver = new CommentResolver();
        await commentResolver.resolvePreviousComments(
          commentsWithThreadIds,
          commentsFilePath,
          diffFiles,
          this.owner,
          this.repo,
          this.prNumber,
          this.prAuthor
        );

        // 10. CommentResolver実行後にResolve状態を更新
        console.log('🔄 Updating resolved status after comment resolution...');
        const updatedResolvedIds = await threadResolver.getResolvedThreadIds(
          this.owner,
          this.repo,
          this.prNumber
        );
        console.log(`✅ Found ${updatedResolvedIds.size} resolved threads (after resolution)`);

        const updatedComments = commentsWithThreadIds.map(comment => ({
          ...comment,
          is_resolved: comment.thread_id ? updatedResolvedIds.has(comment.thread_id) : false
        }));

        await Bun.write(commentsFilePath, JSON.stringify(updatedComments, null, 2));
        console.log(`✅ Updated ${updatedComments.length} comments with latest resolve status`);
      } else {
        console.log('✅ No previous comments to resolve');
      }

      // ====== Phase 2: 新規レビュー実施 ======

      console.log('');
      console.log('📖 Reading review guidelines...');
      const reviewGuidelines = readReviewGuidelines(dynamicGuidelines);

      // ローカルモードの場合、レビュー観点をファイルに保存
      const isLocalMode = process.env.LOCAL_MODE === 'true';
      if (isLocalMode) {
        await this.saveGuidelinesLocally(reviewGuidelines);
      }

      // 10. レビュー実施（submit_review内でGitHub投稿）
      console.log('');
      console.log('🤖 Starting code review...');
      const reviewer = new PRReviewer(
        commentsFilePath,
        headSha,
        this.owner,
        this.repo,
        this.prNumber
      );
      await reviewer.review(
        diffFiles,
        reviewGuidelines
      );

      // 11. 差分一時ファイルをクリーンアップ
      deleteTempDiffFiles(diffFiles);

      console.log('');
      console.log('✅ Review process completed successfully!');

      // 一時ファイルのクリーンアップ
      try {
        await unlink(commentsFilePath);
        console.log(`🗑️  Cleaned up temporary file: ${commentsFilePath}`);
      } catch (cleanupError) {
        console.warn(`⚠️  Failed to cleanup temporary file: ${commentsFilePath}`);
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

      // エラー時も一時ファイルのクリーンアップ
      try {
        await unlink(commentsFilePath);
        console.log(`🗑️  Cleaned up temporary file: ${commentsFilePath}`);
      } catch (cleanupError) {
        console.warn(`⚠️  Failed to cleanup temporary file: ${commentsFilePath}`);
      }

      throw error;
    }
  }

  /**
   * ローカルモード: レビュー観点をファイルに保存
   */
  private async saveGuidelinesLocally(guidelines: string): Promise<void> {
    try {
      const { dirname, join } = await import('path');
      const { mkdir } = await import('fs/promises');
      const { fileURLToPath } = await import('url');

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const outputDir = join(__dirname, '../output');
      const outputPath = join(outputDir, `pr-${this.prNumber}-guidelines.md`);

      await mkdir(outputDir, { recursive: true });

      const content = `# PR #${this.prNumber} レビュー観点\n\n${guidelines}`;
      await Bun.write(outputPath, content);

      console.log(`📝 Review guidelines saved to: ${outputPath}`);
    } catch (error) {
      console.warn('⚠️  Failed to save guidelines to file:', error);
    }
  }
}
