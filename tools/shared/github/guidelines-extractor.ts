/**
 * Guidelines Extractor
 *
 * PRから動的にレビュー観点を抽出
 */

import type { Octokit } from 'octokit';
import { JulesApiClient } from '../../feature-reviewer/core/jules-client';

/**
 * サブIssue情報
 */
export interface SubIssueInfo {
  subIssueNumber: number;
  julesSessionName?: string;
  julesSessionUrl?: string;
}

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

      // 3. サブIssue情報を取得
      const subIssueInfo = await this.findSubIssue(parentIssueNumber);
      if (!subIssueInfo) {
        console.log('ℹ️  No sub-issue found for parent issue');
        return null;
      }

      console.log(`  ✅ Found sub-issue: #${subIssueInfo.subIssueNumber}`);
      if (subIssueInfo.julesSessionName) {
        console.log(`  ✅ Found Jules session: ${subIssueInfo.julesSessionName}`);
      }

      // 4. レビュー観点を抽出
      const guidelines = await this.extractGuidelines(subIssueInfo.subIssueNumber);
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
   * PRからJulesセッション情報を抽出
   *
   * @param prNumber PR番号
   * @param apiKey Jules API Key（セッション紐付けに使用、オプション）
   * @returns Julesセッション情報（取得失敗時はnull）
   */
  async extractJulesSessionFromPR(prNumber: number, apiKey?: string): Promise<SubIssueInfo | null> {
    try {
      console.log('🔍 Extracting Jules session info from related issues...');

      // 1. PRを取得
      const pr = await this.getPR(prNumber);

      // 2. 親Issue番号を抽出
      const parentIssueNumber = await this.extractParentIssueNumber(prNumber, pr.body);
      if (!parentIssueNumber) {
        console.log('ℹ️  No parent issue reference found in PR');
        return null;
      }

      // 3. サブIssue情報（セッション情報含む）を取得
      const subIssueInfo = await this.findSubIssue(parentIssueNumber);
      if (!subIssueInfo) {
        console.log('ℹ️  No sub-issue found for parent issue');
        return null;
      }

      console.log(`  ✅ Found sub-issue: #${subIssueInfo.subIssueNumber}`);

      // 4. APIキーがある場合、Jules APIでPRとセッションを紐付ける
      if (apiKey) {
        console.log('🔍 Finding Jules session for this PR via Jules API...');

        const julesClient = new JulesApiClient(apiKey, this.owner, this.repo);

        try {
          const sessionUrl = await julesClient.findSessionForPR(prNumber);

          if (sessionUrl) {
            // セッションURLからセッション名を抽出
            const sessionId = sessionUrl.match(/\/session\/(\d+)/)?.[1];
            const sessionName = sessionId ? `sessions/${sessionId}` : undefined;

            subIssueInfo.julesSessionUrl = sessionUrl;
            subIssueInfo.julesSessionName = sessionName;

            console.log(`  ✅ Found Jules session for PR #${prNumber}: ${sessionName}`);
            console.log(`  ✅ Session URL: ${sessionUrl}`);
          } else {
            console.log(`  ⚠️  No Jules session found for PR #${prNumber}`);
            subIssueInfo.julesSessionUrl = undefined;
            subIssueInfo.julesSessionName = undefined;
          }
        } catch (error) {
          console.warn('⚠️  Failed to find Jules session via API:', error);
          // APIエラーの場合、従来のHTMLコメントベースの情報を使用（後方互換性）
        }
      } else if (subIssueInfo.julesSessionName) {
        // APIキーがない場合は従来のHTMLコメントベースの情報を使用
        console.log(`  ✅ Found Jules session (from HTML comment): ${subIssueInfo.julesSessionName}`);
        console.log(`  ✅ Session URL: ${subIssueInfo.julesSessionUrl}`);
      }

      return subIssueInfo;
    } catch (error) {
      console.warn('⚠️  Failed to extract Jules session info:', error);
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

    // PR本文・コメントにIssue参照がない場合、Jules APIで逆引き
    const julesApiKey = process.env.JULES_API_KEY;
    if (julesApiKey) {
      console.log('  ℹ️  No issue reference in PR, trying Jules API fallback...');
      try {
        const julesClient = new JulesApiClient(julesApiKey, this.owner, this.repo);
        const issueNumber = await julesClient.findIssueNumberForPR(prNumber);
        if (issueNumber) {
          console.log(`  ✅ Found parent issue via Jules API: #${issueNumber}`);
          return issueNumber;
        }
      } catch (error) {
        console.warn('  ⚠️  Jules API fallback failed:', error);
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
  /**
   * 親Issueのコメントからサブissue情報を取得
   *
   * @param parentIssueNumber 親Issue番号
   * @returns サブissue情報（見つからない場合はnull）
   */
  private async findSubIssue(parentIssueNumber: number): Promise<SubIssueInfo | null> {
    const comments = await this.octokit.rest.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: parentIssueNumber,
      per_page: 100
    });

    // feature-reviewerのコメントパターン:
    // "実装時は以下のIssueを参照してください：\n- #12"
    const subIssuePattern = /実装時は以下のIssueを参照してください：\s*\n\s*-\s*#(\d+)/;
    
    // Julesセッション情報のパターン:
    // <!-- JULES_SESSION_NAME: sessions/123 -->
    // <!-- JULES_SESSION_URL: https://jules.google.com/session/123 -->
    const sessionNamePattern = /<!-- JULES_SESSION_NAME: ([^\s]+) -->/;
    const sessionUrlPattern = /<!-- JULES_SESSION_URL: ([^\s]+) -->/;

    // 最初に見つかったコメントを使用
    for (const comment of comments.data) {
      const body = comment.body || '';
      const subIssueMatch = subIssuePattern.exec(body);
      
      if (subIssueMatch && subIssueMatch[1]) {
        const subIssueNumber = parseInt(subIssueMatch[1]);
        
        // セッション情報も抽出
        const sessionNameMatch = sessionNamePattern.exec(body);
        const sessionUrlMatch = sessionUrlPattern.exec(body);
        
        return {
          subIssueNumber,
          julesSessionName: sessionNameMatch?.[1],
          julesSessionUrl: sessionUrlMatch?.[1],
        };
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
