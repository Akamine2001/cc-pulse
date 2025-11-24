/**
 * Jules Comment Handler
 *
 * PRコメントから@julesメンションを検出し、Julesセッションに送信
 */

import type { Octokit } from 'octokit';
import { GuidelinesExtractor } from '../../shared/github/guidelines-extractor';
import { JulesApiClient } from '../../feature-reviewer/core/jules-client';
import { ThreadResolver } from '../../shared/github/thread-resolver';
import { AI_AGENT_MENTION } from '../../shared/constants';

interface CommentWithThread {
  id: number;
  body: string;
  user: string;
  threadId?: string;
  isResolved: boolean;
  url: string;
}

export class JulesCommentHandler {
  private guidelinesExtractor: GuidelinesExtractor;
  private threadResolver: ThreadResolver;
  private julesClient?: JulesApiClient;

  constructor(
    private octokit: Octokit,
    private owner: string,
    private repo: string,
    private prNumber: number,
    private apiKey: string
  ) {
    this.guidelinesExtractor = new GuidelinesExtractor(octokit, owner, repo);
    this.threadResolver = new ThreadResolver(octokit);
  }

  /**
   * メイン処理：@julesコメントを収集してJulesセッションに送信
   */
  async execute(): Promise<void> {
    console.log('🤖 Jules Comment Handler');
    console.log(`📋 Repository: ${this.owner}/${this.repo}`);
    console.log(`🔢 PR Number: ${this.prNumber}`);
    console.log('');

    try {
      // 1. Julesセッション情報を取得
      console.log(`🔍 Finding associated Jules session for PR #${this.prNumber}...`);
      this.julesClient = new JulesApiClient(this.apiKey, this.owner, this.repo);
      const sessionUrl = await this.julesClient.findSessionForPR(this.prNumber);

      if (!sessionUrl) {
        console.log('⚠️  No Jules session found for this PR');
        console.log('ℹ️  @jules comments will not be sent (session info already in summary comment)');
        return;
      }

      console.log(`✅ Found Jules session: ${sessionUrl}`);
      console.log('');

      // 2. @julesコメントを収集
      console.log(`📝 Collecting @${AI_AGENT_MENTION} comments...`);
      const julesComments = await this.collectJulesComments();

      if (julesComments.length === 0) {
        console.log(`ℹ️  No unresolved @${AI_AGENT_MENTION} comments found`);
        return;
      }

      console.log(`✅ Found ${julesComments.length} unresolved @${AI_AGENT_MENTION} comment(s)`);
      console.log('');

      // 3. コメントをJulesセッションに送信
      console.log('📤 Sending comments to Jules session...');
      await this.sendCommentsToSession(
        sessionUrl,
        julesComments
      );

      console.log('');
      console.log('✅ All comments sent to Jules successfully!');
      console.log(`   Session URL: ${sessionUrl}`);

    } catch (error) {
      console.error('❌ Jules Comment Handler failed:', error);
      throw error;
    }
  }

  /**
   * @julesコメントを収集（未解決のみ）
   */
  private async collectJulesComments(): Promise<CommentWithThread[]> {
    // ThreadResolver初期化
    const threadMap = await this.threadResolver.buildThreadMap(
      this.owner,
      this.repo,
      this.prNumber
    );
    const resolvedThreadIds = await this.threadResolver.getResolvedThreadIds(
      this.owner,
      this.repo,
      this.prNumber
    );

    // PRレビューコメント取得
    const reviewComments = await this.octokit.rest.pulls.listReviewComments({
      owner: this.owner,
      repo: this.repo,
      pull_number: this.prNumber,
      per_page: 100,
    });

    // Issueコメント取得（PRコメント）
    const issueComments = await this.octokit.rest.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.prNumber,
      per_page: 100,
    });

    const allComments: CommentWithThread[] = [];

    // レビューコメント処理
    for (const comment of reviewComments.data) {
      if (!comment.body) continue;

      const threadId = threadMap.get(comment.id);
      const isResolved = threadId ? resolvedThreadIds.has(threadId) : false;

      allComments.push({
        id: comment.id,
        body: comment.body,
        user: comment.user?.login || 'unknown',
        threadId,
        isResolved,
        url: comment.html_url,
      });
    }

    // Issueコメント処理
    for (const comment of issueComments.data) {
      if (!comment.body) continue;

      allComments.push({
        id: comment.id,
        body: comment.body,
        user: comment.user?.login || 'unknown',
        isResolved: false, // Issueコメントは常に未解決として扱う
        url: comment.html_url,
      });
    }

    // @julesメンションを含む未解決コメントのみフィルタ
    // ただし、GitHub Actions Botからのコメントのみに限定
    return allComments.filter(
      (c) =>
        c.body.includes(`@${AI_AGENT_MENTION}`) &&
        !c.isResolved &&
        c.user === 'github-actions[bot]'  // GitHub Actions Botからのコメントのみ
    );
  }

  /**
   * コメントをJulesセッションに送信
   */
  private async sendCommentsToSession(
    sessionUrl: string,
    comments: CommentWithThread[]
  ): Promise<void> {
    if (!this.julesClient) {
      throw new Error('JulesApiClient not initialized');
    }

    for (const comment of comments) {
      console.log(`  📩 Sending comment #${comment.id} from @${comment.user}...`);

      // コメント本文を整形
      const message = this.formatCommentForJules(comment);

      try {
        await this.julesClient.sendMessageToSession(sessionUrl, message);
        console.log(`     ✅ Sent`);
      } catch (error) {
        console.error(`     ❌ Failed to send comment #${comment.id}:`, error);
        // 1つ失敗しても続行
      }
    }
  }

  /**
   * コメントをJules用に整形
   */
  private formatCommentForJules(comment: CommentWithThread): string {
    return `# PR Comment from @${comment.user}

${comment.body}

---
Comment URL: ${comment.url}
Comment ID: ${comment.id}
`;
  }
}
