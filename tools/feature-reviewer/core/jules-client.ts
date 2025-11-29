/**
 * Jules API Client
 *
 * Jules APIとの連携
 */
import { $ } from 'bun';

import { z } from 'zod';

const JULES_API_BASE = 'https://jules.googleapis.com/v1alpha';

/**
 * PRに紐づくセッション情報
 */
export interface SessionInfoForPR {
  sessionUrl: string;
  issueNumber: number | null;
}

/**
 * Source APIレスポンススキーマ
 */
const SourceSchema = z.object({
  name: z.string(),
  id: z.string(),
  githubRepo: z.object({
    owner: z.string(),
    repo: z.string(),
    defaultBranch: z.object({
      displayName: z.string(),
    }).optional(),
  }).optional(),
});

const SourcesListResponseSchema = z.object({
  sources: z.array(SourceSchema).optional(),
});

/**
 * Session Details APIレスポンススキーマ
 */
const SessionDetailsSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  // セッションタイトル（Issue番号を含む形式: "Issue #XX: タイトル"）
  title: z.string().optional(),
  // 単数形: 1つのPRが紐づく場合
  pullRequest: z.object({
    url: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
});

/**
 * Session作成APIレスポンススキーマ
 */
const JulesSessionResponseSchema = z.object({
  name: z.string(),           // sessions/{sessionId}
  url: z.string().url(),      // https://jules.google.com/session/{sessionId}
  id: z.string(),             // sessionId
  automationMode: z.string().optional(),
  sourceContext: z.object({
    source: z.string(),
    githubRepoContext: z.object({
      startingBranch: z.string(),
    }).optional(),
  }).optional(),
});

type JulesSessionResponse = z.infer<typeof JulesSessionResponseSchema>;

export class JulesApiClient {
  constructor(
    private apiKey: string,
    private owner: string,
    private repo: string
  ) {}

  /**
   * デフォルトブランチを取得
   */
  /**
   * デフォルトブランチを取得
   */
  async getDefaultBranch(): Promise<string> {
    console.log('🌿 Fetching default branch...');
    try {
      const result = await $`gh repo view ${this.owner}/${this.repo} --json defaultBranchRef --jq .defaultBranchRef.name`.text();
      const branchName = result.trim();
      console.log(`✅ Default branch: ${branchName}`);
      return branchName;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to get default branch: ${errorMessage}`);
      throw new Error(`Failed to get default branch: ${errorMessage}`);
    }
  }


  /**
   * Jules Sourceを取得
   */
  async getSource(): Promise<string> {
    console.log('📦 Fetching Jules source...');

    const response = await fetch(`${JULES_API_BASE}/sources`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`❌ Failed to fetch sources: ${response.status}`);
      throw new Error(`Failed to fetch sources: ${response.status} - ${errorBody}`);
    }

    const rawResponse = await response.json();
    const sourcesData = SourcesListResponseSchema.parse(rawResponse);

    // owner/repoに一致するSourceを検索
    const matchingSource = sourcesData.sources?.find(
      (s) =>
        s.githubRepo?.owner === this.owner &&
        s.githubRepo?.repo === this.repo
    );

    if (!matchingSource) {
      console.error(`❌ Source not found for ${this.owner}/${this.repo}`);
      console.error('');
      console.error('💡 Please register the repository in Jules Web UI:');
      console.error('   https://jules.google.com');
      throw new Error(`Source not found for ${this.owner}/${this.repo}`);
    }

    console.log(`✅ Found source: ${matchingSource.name}`);
    return matchingSource.name;
  }

  /**
   * Jules APIを呼び出し、自動実装を開始
   */
  /**
   * Jules APIを呼び出し、自動実装を開始
   */
  /**
   * Jules APIを呼び出し、自動実装を開始
   */
  /**
   * Jules APIを呼び出し、自動実装を開始
   */
  async startAutomatedImplementation(
    prompt: string,
    issueNumber: number,
    issueTitle: string,
    subIssueNumber: number | undefined,
    branch?: string
  ): Promise<JulesSessionResponse> {
    console.log('🚀 Calling Jules API to start automated implementation...');

    const sourceName = await this.getSource();
    const startingBranch = branch || await this.getDefaultBranch();

    // セッションタイトルにIssue番号を含める（PRからの逆引き用）
    const sessionTitle = `Issue #${issueNumber}: ${issueTitle}`;

    const requestBody = {
      prompt: prompt,
      title: sessionTitle,
      sourceContext: {
        source: sourceName,
        githubRepoContext: {
          startingBranch: startingBranch,
        },
      },
      automationMode: 'AUTO_CREATE_PR',
    };

    const response = await fetch(`${JULES_API_BASE}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ Jules API call failed:', response.status, errorBody);
      throw new Error(`Jules API request failed with status ${response.status}: ${errorBody}`);
    }

    const rawResponse = await response.json();
    const responseData = JulesSessionResponseSchema.parse(rawResponse);
    console.log(`✅ Jules session created successfully`);
    console.log(`   Session URL: ${responseData.url}`);
    console.log(`   Session ID: ${responseData.id}`);
    console.log(`   Session Title: ${sessionTitle}`);
    return responseData;
  }

  /**
   * セッションURLからセッションIDを抽出
   */
  /**
   * セッションURLからセッションIDを抽出
   */
  /**
   * セッションURLからセッションIDを抽出
   */
  private extractSessionId(sessionUrl: string): string {
    // URL形式: https://jules.google.com/session/{sessionId}
    //      または: https://jules.google.com/task/{sessionId}
    const match = sessionUrl.match(/\/(session|task)\/(\d+)/);
    if (!match || !match[2]) {
      throw new Error(`Invalid session URL format: ${sessionUrl}`);
    }
    return match[2];
  }

  /**
   * Finds the Jules session URL for a given pull request number.
   * Note: This method lists all sessions and then fetches details for each one individually.
   * This could be inefficient and slow if the number of sessions becomes large.
   */
  async findSessionForPR(prNumber: number): Promise<string | null> {
    const result = await this.findSessionInfoForPR(prNumber);
    return result?.sessionUrl || null;
  }

  /**
   * PRからJulesセッション情報を取得（セッションURL + Issue番号）
   * セッションのtitleから「Issue #XX:」形式でIssue番号を抽出します。
   */
  async findSessionInfoForPR(prNumber: number): Promise<{ sessionUrl: string; issueNumber: number | null } | null> {
    console.log(`🔍 Searching for Jules session that created PR #${prNumber}...`);

    // 1. 全セッションを取得（filterパラメータは未サポートのため使用しない）
    const response = await fetch(`${JULES_API_BASE}/sessions`, {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': this.apiKey },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to list sessions: ${response.status} - ${errorBody}`);
    }

    const { sessions } = await response.json();
    if (!sessions || sessions.length === 0) {
      console.log('  ℹ️  No sessions found');
      return null;
    }

    console.log(`  ℹ️  Found ${sessions.length} session(s), checking each...`);

    // 2. 各セッションの詳細を取得してPR URLを確認
    const targetPrUrl = `https://github.com/${this.owner}/${this.repo}/pull/${prNumber}`;

    for (const session of sessions) {
      try {
        const sessionDetails = await this.getSessionDetails(session.name);

        // pullRequest (単数形) フィールドのURLでマッチング
        if (sessionDetails.pullRequest?.url === targetPrUrl) {
          console.log(`  ✅ Found matching session: ${session.name}`);
          
          // titleからIssue番号を抽出（形式: "Issue #XX: タイトル"）
          const issueNumber = this.extractIssueNumberFromTitle(sessionDetails.title);
          if (issueNumber) {
            console.log(`  ✅ Extracted issue number from title: #${issueNumber}`);
          }
          
          return {
            sessionUrl: sessionDetails.url || session.url,
            issueNumber,
          };
        }
      } catch (error) {
        // 個別セッションの取得失敗は無視して続行
        console.warn(`  ⚠️  Failed to get details for session ${session.name}:`, error);
        continue;
      }
    }

    console.log(`  ⚠️  No session found for PR #${prNumber}`);
    return null;
  }

  /**
   * セッションタイトルからIssue番号を抽出
   * 形式: "Issue #XX: タイトル"
   */
  private extractIssueNumberFromTitle(title: string | undefined): number | null {
    if (!title) return null;
    const match = title.match(/^Issue #(\d+):/);
    return match && match[1] ? parseInt(match[1], 10) : null;
  }

  /**
   * PRからIssue番号を取得（Jules APIによる逆引き）
   * PR本文にIssue参照がない場合のフォールバック用
   */
  async findIssueNumberForPR(prNumber: number): Promise<number | null> {
    const sessionInfo = await this.findSessionInfoForPR(prNumber);
    return sessionInfo?.issueNumber || null;
  }

  private async getSessionDetails(sessionName: string): Promise<z.infer<typeof SessionDetailsSchema>> {
    const response = await fetch(`${JULES_API_BASE}/${sessionName}`, {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': this.apiKey },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to get session details: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    return SessionDetailsSchema.parse(data);
  }

  /**
   * Julesセッションにメッセージを送信
   */
  async sendMessageToSession(
    sessionUrl: string,
    message: string
  ): Promise<void> {
    console.log('💬 Sending message to Jules session...');

    const sessionId = this.extractSessionId(sessionUrl);
    const sessionName = `sessions/${sessionId}`;
    const endpoint = `https://jules.googleapis.com/v1alpha/${sessionName}:sendMessage`;

    const requestBody = {
      prompt: message,
    };

    console.log(`   Session: ${sessionName}`);
    console.log(`   Message: ${message.substring(0, 50)}...`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ Failed to send message to Jules session:', response.status, errorBody);
      throw new Error(`Failed to send message to Jules session: ${response.status} - ${errorBody}`);
    }

    console.log('✅ Message sent to Jules session successfully');
  }
}
