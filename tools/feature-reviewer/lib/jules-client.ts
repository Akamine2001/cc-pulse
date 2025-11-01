
import { z } from 'zod';

// Jules APIレスポンスのスキーマ
const JulesSessionSchema = z.object({
  name: z.string(),
  id: z.string(),
  url: z.string(),
  state: z.string(),
});

/**
 * Jules API Client
 *
 * @see https://developers.google.com/jules/api/reference/rest/v1alpha/sessions/create
 */
export class JulesClient {
  private apiKey: string;
  private readonly apiUrl = 'https://jules.googleapis.com/v1alpha/sessions';

  constructor() {
    this.apiKey = process.env.JULES_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('JULES_API_KEY environment variable is not set.');
    }
  }

  /**
   * Julesセッションを作成
   * @param prompt - 親Issueの本文
   * @param owner - リポジトリの所有者
   * @param repo - リポジトリ名
   * @param startingBranch - デフォルトブランチ名
   * @returns セッションIDとURL
   */
  async createSession(
    prompt: string,
    owner: string,
    repo: string,
    startingBranch: string
  ): Promise<{ sessionId: string; url: string }> {
    const requestBody = {
      prompt,
      sourceContext: {
        source: `sources/github/${owner}/${repo}`,
        githubRepoContext: {
          startingBranch,
        },
      },
      automationMode: 'AUTO_CREATE_PR',
    };

    console.log('   Calling Jules API...');
    console.log(`   - Endpoint: ${this.apiUrl}`);
    console.log(`   - Source: ${requestBody.sourceContext.source}`);
    console.log(`   - Branch: ${startingBranch}`);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Jules API request failed with status ${response.status}: ${errorBody}`);
    }

    const data = await response.json();

    // Zodでレスポンスを検証
    const parsedData = JulesSessionSchema.parse(data);

    console.log(`   ✅ Jules session created: ${parsedData.id}`);
    console.log(`   - URL: ${parsedData.url}`);
    console.log('');

    return {
      sessionId: parsedData.id,
      url: parsedData.url,
    };
  }
}
