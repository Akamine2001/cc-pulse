/**
 * Jules API Client
 *
 * Jules APIとの連携
 */
import { $ } from 'bun';

const JULES_API_URL = 'https://jules.googleapis.com/v1/jobs';

export class JulesApiClient {
  constructor(
    private apiKey: string,
    private owner: string,
    private repo: string
  ) {}

  /**
   * デフォルトブランチを取得
   */
  async getDefaultBranch(): Promise<string> {
    console.log('🌿 Fetching default branch...');
    const command = [
      'gh',
      'repo',
      'view',
      `${this.owner}/${this.repo}`,
      '--json',
      'defaultBranchRef',
      '--jq',
      '.defaultBranchRef.name',
    ];
    const { stdout, stderr, exitCode } = await new Response(
      await Bun.spawn(command).stdout
    ).text();

    if (exitCode !== 0) {
      console.error(`❌ Failed to get default branch: ${stderr}`);
      throw new Error(`Failed to get default branch: ${stderr}`);
    }
    const branchName = stdout.trim();
    console.log(`✅ Default branch: ${branchName}`);
    return branchName;
  }

  /**
   * Jules APIを呼び出し、自動実装を開始
   */
  async startAutomatedImplementation(
    prompt: string,
    issueNumber: number,
    subIssueNumber: number
  ): Promise<{ url: string }> {
    console.log('🚀 Calling Jules API to start automated implementation...');

    const defaultBranch = await this.getDefaultBranch();

    const requestBody = {
      sourceContext: {
        githubRepoContext: {
          owner: this.owner,
          repo: this.repo,
          issueNumber: subIssueNumber,
          startingBranch: defaultBranch,
        },
      },
      prompt: prompt,
      automationMode: 'AUTO_CREATE_PR',
    };

    const response = await fetch(JULES_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ Jules API call failed:', response.status, errorBody);
      throw new Error(`Jules API request failed with status ${response.status}: ${errorBody}`);
    }

    const responseData = (await response.json()) as { url: string };
    console.log(`✅ Jules API call successful. Session URL: ${responseData.url}`);
    return responseData;
  }
}
