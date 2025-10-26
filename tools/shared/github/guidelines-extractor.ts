/**
 * Guidelines Extractor
 *
 * PRから動的にレビュー観点を抽出
 */

import type { Octokit } from 'octokit';

export class GuidelinesExtractor {
  constructor(
    private octokit: Octokit,
    private owner: string,
    private repo: string
  ) {}

  /**
   * PRから動的にレビュー観点を抽出
   *
   * @param prNumber PR番号
   * @returns レビュー観点（取得失敗時はnull）
   */
  async extractFromPR(prNumber: number): Promise<string | null> {
    try {
      console.log('📋 Extracting review guidelines from related issues...');

      // 1. PRを取得
      const pr = await this.getPR(prNumber);

      // 2. 親Issue番号を抽出（PR本文 + コメント最初の10件）
      const parentIssueNumber = await this.extractParentIssueNumber(prNumber, pr.body);
      if (!parentIssueNumber) {
        console.log('ℹ️  No parent issue reference found in PR');
        return null;
      }

      console.log(`  ✅ Found parent issue: #${parentIssueNumber}`);

      // 3. サブIssue番号を取得
      const subIssueNumber = await this.findSubIssue(parentIssueNumber);
      if (!subIssueNumber) {
        console.log('ℹ️  No sub-issue found for parent issue');
        return null;
      }

      console.log(`  ✅ Found sub-issue: #${subIssueNumber}`);

      // 4. レビュー観点を抽出
      const guidelines = await this.extractGuidelines(subIssueNumber);
      if (!guidelines) {
        console.log('ℹ️  No review guidelines found in sub-issue');
        return null;
      }

      console.log(`  ✅ Extracted review guidelines (${guidelines.length} chars)`);
      return guidelines;
    } catch (error) {
      console.warn('⚠️  Failed to extract guidelines from issues:', error);
      return null;
    }
  }

  /**
   * PRを取得
   */
  private async getPR(prNumber: number) {
    const { data } = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    });
    return data;
  }

  /**
   * PR本文とコメント（最初の10件）から親Issue番号を抽出
   *
   * @param prNumber PR番号
   * @param prBody PR本文
   * @returns 親Issue番号（見つからない場合はnull）
   */
  private async extractParentIssueNumber(
    prNumber: number,
    prBody: string | null
  ): Promise<number | null> {
    // まずPR本文から検索
    if (prBody) {
      const issueNumber = this.findIssueNumber(prBody);
      if (issueNumber) {
        return issueNumber;
      }
    }

    // PR本文にない場合、コメント（最初の10件）から検索
    // TODO: PRコメントに親Issue番号が書かれるかは不確定。
    //       PR本文に書かれることが一般的なので、この機能の必要性を検討すべき。
    //       将来的には、PRテンプレートで親Issue記載を必須にする方が確実。
    const comments = await this.octokit.rest.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      per_page: 10 // 最初の10件のみ
    });

    for (const comment of comments.data) {
      const issueNumber = this.findIssueNumber(comment.body || '');
      if (issueNumber) {
        return issueNumber;
      }
    }

    return null;
  }

  /**
   * テキストからIssue番号を抽出
   *
   * パターン: #123, Closes #456, Fixes #789, Resolves #101 など
   */
  private findIssueNumber(text: string): number | null {
    // シンプルに #数字 のパターンを検索
    const match = text.match(/#(\d+)/);
    if (match && match[1]) {
      return parseInt(match[1]);
    }
    return null;
  }

  /**
   * 親Issueのコメントからサブissue番号を取得
   *
   * @param parentIssueNumber 親Issue番号
   * @returns サブissue番号（見つからない場合はnull）
   */
  private async findSubIssue(parentIssueNumber: number): Promise<number | null> {
    const comments = await this.octokit.rest.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: parentIssueNumber,
      per_page: 100
    });

    // feature-reviewerのコメントパターン:
    // "実装時は以下のIssueを参照してください：\n- #12"
    const pattern = /実装時は以下のIssueを参照してください：\s*\n\s*-\s*#(\d+)/;

    // 最初に見つかったコメントを使用
    for (const comment of comments.data) {
      const match = pattern.exec(comment.body || '');
      if (match && match[1]) {
        return parseInt(match[1]);
      }
    }

    return null;
  }

  /**
   * サブIssueからレビュー観点を抽出
   *
   * @param subIssueNumber サブIssue番号
   * @returns レビュー観点（見つからない場合はnull）
   */
  private async extractGuidelines(subIssueNumber: number): Promise<string | null> {
    const issue = await this.octokit.rest.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: subIssueNumber
    });

    const body = issue.data.body || '';

    // HTMLコメントブロックを抽出（マーカー自体は含めない）
    const startMarker = '<!-- REVIEW_GUIDELINES_START -->';
    const endMarker = '<!-- REVIEW_GUIDELINES_END -->';

    const startIndex = body.indexOf(startMarker);
    const endIndex = body.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1) {
      return null;
    }

    // マーカーを含めずに中身だけ抽出
    const guidelines = body
      .substring(startIndex + startMarker.length, endIndex)
      .trim();

    return guidelines;
  }
}
