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
   * 既存のサブIssueを検索
   *
   * @param title 探索するIssueタイトル
   * @param parentIssueNumber 親Issue番号（本文内の参照を確認）
   * @returns 見つかったIssue情報。存在しない場合はnull
   */
  async findIssueByTitleAndParent(
    title: string,
    parentIssueNumber: number
  ): Promise<IssueInfo | null> {
    const issues = await this.octokit.paginate(
      this.octokit.rest.issues.listForRepo,
      {
        owner: this.owner,
        repo: this.repo,
        state: 'all',
        per_page: 100
      }
    );

    for (const issue of issues) {
      if ('pull_request' in issue) continue; // PRは除外
      if (issue.title !== title) continue;
      if (!issue.body?.includes(`#${parentIssueNumber}`)) continue;

      return {
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        html_url: issue.html_url
      };
    }

    return null;
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

  async findSubIssues(parentIssueNumber: number): Promise<IssueInfo[]> {
    const query = `repo:${this.owner}/${this.repo} is:issue is:open in:body "<!-- parent-issue: #${parentIssueNumber} -->"`;
    const { data } = await this.octokit.rest.search.issuesAndPullRequests({
        q: query,
    });

    return data.items.map(issue => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        html_url: issue.html_url,
    }));
  }
}
