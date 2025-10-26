/**
 * GitHub Issue操作専門クライアント
 *
 * Issue取得・作成・コメント投稿など、Issue操作に特化
 */

import type { Octokit } from 'octokit';

/**
 * Issue情報
 */
export interface IssueInfo {
  number: number;
  title: string;
  body: string;
  html_url: string;
}

/**
 * Issue作成結果
 */
export interface CreateIssueResult {
  number: number;
  html_url: string;
}

export class IssueClient {
  constructor(
    private octokit: Octokit,
    private owner: string,
    private repo: string
  ) {}

  /**
   * Issueを取得
   *
   * @param issueNumber Issue番号
   * @returns Issue情報
   */
  async getIssue(issueNumber: number): Promise<IssueInfo> {
    const { data } = await this.octokit.rest.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber
    });

    return {
      number: data.number,
      title: data.title,
      body: data.body || '',
      html_url: data.html_url
    };
  }

  /**
   * Issueを作成
   *
   * @param title タイトル
   * @param body 本文
   * @returns 作成されたIssue情報
   */
  async createIssue(title: string, body: string): Promise<CreateIssueResult> {
    const { data } = await this.octokit.rest.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body
    });

    return {
      number: data.number,
      html_url: data.html_url
    };
  }

  /**
   * Issueにコメントを投稿
   *
   * @param issueNumber Issue番号
   * @param body コメント本文
   */
  async postComment(issueNumber: number, body: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body
    });
  }
}
