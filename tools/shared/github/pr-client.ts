/**
 * GitHub Pull Request操作専門クライアント
 *
 * PR取得・コメント投稿・差分取得など、PR操作に特化
 */

import type { Octokit } from 'octokit';

export class PRClient {
  constructor(
    private octokit: Octokit,
    private owner: string,
    private repo: string
  ) {}

  /**
   * 最新のコミットSHAを取得
   *
   * @param prNumber PR番号
   * @returns コミットSHA
   */
  async getLatestCommitSha(prNumber: number): Promise<string> {
    const pr = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    });

    return pr.data.head.sha;
  }

  /**
   * PRの前回のレビューコメントを取得
   *
   * @param prNumber PR番号
   * @param botSignature Bot識別用の署名
   * @returns 自動レビューのコメントリスト
   */
  async listPreviousComments(prNumber: number, botSignature: string): Promise<any[]> {
    const previousComments = await this.octokit.rest.pulls.listReviewComments({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    });

    // 自動レビューのコメントのみ抽出
    return previousComments.data.filter(
      c => c.body.includes(botSignature)
    );
  }

  /**
   * PRにコメントを投稿
   *
   * @param prNumber PR番号
   * @param body コメント本文
   */
  async postComment(prNumber: number, body: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      body
    });
  }

  /**
   * PRにインラインコメントを投稿
   *
   * @param prNumber PR番号
   * @param headSha コミットSHA
   * @param path ファイルパス
   * @param line 行番号
   * @param body コメント本文
   */
  async postReviewComment(
    prNumber: number,
    headSha: string,
    path: string,
    line: number,
    body: string
  ): Promise<void> {
    await this.octokit.rest.pulls.createReviewComment({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      commit_id: headSha,
      path,
      line,
      body
    });
  }

  /**
   * 特定コミット間のファイル差分を取得
   *
   * @param filePath ファイルパス
   * @param fromCommit 開始コミットSHA
   * @param toCommit 終了コミットSHA
   * @returns ファイルの差分（diff形式）、変更がない場合は空文字列
   */
  async getFileDiff(filePath: string, fromCommit: string, toCommit: string): Promise<string> {
    try {
      // compareコミットで差分取得
      const comparison = await this.octokit.rest.repos.compareCommits({
        owner: this.owner,
        repo: this.repo,
        base: fromCommit,
        head: toCommit
      });

      // 該当ファイルの差分を探す
      const file = comparison.data.files?.find(f => f.filename === filePath);

      if (!file || !file.patch) {
        // ファイルに変更がない、またはpatchが取得できない
        return '';
      }

      return file.patch;
    } catch (error) {
      console.error(`Failed to get diff for ${filePath} (${fromCommit}...${toCommit})`);
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
      }
      // エラー時は空文字列を返す（差分取得失敗 = 差分なし扱い）
      return '';
    }
  }

  /**
   * レビューコメントのスレッド内の返信数を取得
   *
   * @param prNumber PR番号
   * @param commentId コメントID
   * @param botSignature Bot識別用の署名
   * @returns スレッド内の総コメント数（元のコメント含む）
   */
  async getConversationReplies(prNumber: number, commentId: number, botSignature: string): Promise<number> {
    try {
      const comments = await this.octokit.rest.pulls.listReviewComments({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });

      // in_reply_to_id でスレッドを追跡
      let count = 1; // 元のコメント自身
      for (const c of comments.data) {
        if (c.in_reply_to_id === commentId) {
          // bot自身の返信は除外（ユーザーの実際の返信のみカウント）
          if (!c.body.includes(botSignature)) {
            count++;
          }
        }
      }

      return count;
    } catch (error) {
      console.error(`Failed to get conversation replies for comment ${commentId}`);
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
      }
      return 1; // エラー時は元のコメントのみとして扱う
    }
  }

  /**
   * レビューコメントへの返信を投稿
   *
   * @param prNumber PR番号
   * @param commentId コメントID
   * @param body コメント本文
   */
  async postReplyComment(prNumber: number, commentId: number, body: string): Promise<void> {
    await this.octokit.rest.pulls.createReplyForReviewComment({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      comment_id: commentId,
      body
    });
  }

  async postSummaryComment(prNumber: number, summary: string): Promise<void> {
    const signature = '<!-- pr-summary-comment -->';
    const body = `${summary}\n${signature}`;

    const comments = await this.octokit.rest.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
    });

    const existingComment = comments.data.find(c => c.body?.includes(signature));

    if (existingComment) {
      await this.octokit.rest.issues.updateComment({
        owner: this.owner,
        repo: this.repo,
        comment_id: existingComment.id,
        body,
      });
    } else {
      await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber,
        body,
      });
    }
  }
}
