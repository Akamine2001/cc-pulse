/**
 * Jules API Client
 *
 * Jules APIとの連携
 */
import { $ } from 'bun';

import { z } from 'zod';

const JULES_API_BASE = 'https://jules.googleapis.com/v1alpha';

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
    subIssueNumber: number | undefined,
    branch?: string
  ): Promise<JulesSessionResponse> {
    console.log('🚀 Calling Jules API to start automated implementation...');

    const sourceName = await this.getSource();
    const startingBranch = branch || await this.getDefaultBranch();

    const requestBody = {
      prompt: prompt,
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
    const sourceName = await this.getSource();
    const response = await fetch(`${JULES_API_BASE}/sessions?filter=source="${sourceName}"`, {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': this.apiKey },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to list sessions: ${response.status} - ${errorBody}`);
    }

    const { sessions } = await response.json();
    if (!sessions) return null;

    for (const session of sessions) {
      const sessionDetails = await this.getSessionDetails(session.name);
      if (sessionDetails.pullRequests?.some((pr: { number: number }) => pr.number === prNumber)) {
        return session.url;
      }
    }

    return null;
  }

  private async getSessionDetails(sessionName: string): Promise<any> {
    const response = await fetch(`${JULES_API_BASE}/${sessionName}`, {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': this.apiKey },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to get session details: ${response.status} - ${errorBody}`);
    }

    return await response.json();
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
