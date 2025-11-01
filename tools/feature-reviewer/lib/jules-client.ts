/**
 * Jules API Client
 *
 * Jules APIとの通信を担当するクライアント
 */
import { z } from 'zod';

// Jules APIレスポンスのZodスキーマ
const JulesSessionSchema = z.object({
  name: z.string(),
  id: z.string(),
  url: z.string().url(),
  state: z.string(),
});

type JulesSession = z.infer<typeof JulesSessionSchema>;

export class JulesClient {
  private apiKey: string;
  private endpoint = 'https://jules.googleapis.com/v1alpha/sessions';

  constructor() {
    this.apiKey = process.env.JULES_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('JULES_API_KEY environment variable is not set.');
    }
  }

  /**
   * Julesセッションを作成する
   * @param prompt - Issueの本文
   * @param owner - GitHubリポジトリのオーナー
   * @param repo - GitHubリポジトリ名
   * @param startingBranch - デフォルトブランチ
   * @returns セッションIDとURL
   */
  async createSession(
    prompt: string,
    owner: string,
    repo: string,
    startingBranch: string
  ): Promise<{ sessionId: string; url: string }> {
    console.log('📞 Calling Jules API to create a session...');

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

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Jules API request failed with status ${response.status}: ${errorBody}`
        );
      }

      const responseData = await response.json();

      // Zodでレスポンスを検証
      const session = JulesSessionSchema.parse(responseData);

      console.log(`✅ Jules session created successfully: ${session.id}`);
      console.log(`   URL: ${session.url}`);

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      console.error('❌ Failed to create Jules session:', error);
      if (error instanceof z.ZodError) {
        throw new Error(`Jules API response validation failed: ${error.message}`);
      }
      throw error;
    }
  }
}
