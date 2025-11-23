/**
 * Feature Reviewer Orchestrator
 *
 * Issue分析からサブIssue作成までのメインフロー制御
 */

import type { Octokit } from 'octokit';
import { IssueClient } from '../../shared/github/issue-client';
import { IssueAnalyzer } from './analyzer';
import { JulesApiClient } from './jules-client';
import { convertToSubIssueMarkdown } from '../lib/markdown-converter';

/**
 * Jules APIエラーを示すカスタムエラークラス
 * 重複したエラーコメント投稿を防ぐために使用
 */
class JulesApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JulesApiError';
  }
}

export class FeatureReviewOrchestrator {
  private issueClient: IssueClient;
  private julesClient: JulesApiClient;

  constructor(
    private octokit: Octokit,
    private owner: string,
    private repo: string,
    private issueNumber: number
  ) {
    this.issueClient = new IssueClient(octokit, owner, repo);
    
    // JULES_API_KEY環境変数のバリデーション
    const apiKey = process.env.JULES_API_KEY;
    if (!apiKey) {
      throw new Error('JULES_API_KEY environment variable is required');
    }
    
    this.julesClient = new JulesApiClient(
      apiKey,
      owner,
      repo
    );
  }

  /**
   * メイン処理を実行
   */
  async execute(): Promise<void> {
    console.log('🚀 cc-pulse Feature Reviewer');
    console.log(`📋 Repository: ${this.owner}/${this.repo}`);
    console.log(`🔢 Issue Number: ${this.issueNumber}`);
    console.log('');

    try {
      // ====== Phase 1: 親Issue取得 ======
      console.log('📋 Fetching parent issue...');
      const issue = await this.fetchIssue();
      console.log(`✅ Issue #${issue.number}: ${issue.title}`);
      console.log('');

      // ====== Phase 2: Issue分析 ======
      console.log('🔍 Analyzing issue with Claude AI...');
      console.log('   (This may take several minutes)');
      console.log('');

      const analyzer = new IssueAnalyzer(this.issueNumber);
      const guidelines = await analyzer.analyze(issue);

      console.log('✅ Analysis completed');
      console.log('');

      // ====== Phase 3: サブIssue作成 ======
      const subIssueTitle = `[レビュー・テスト観点] ${issue.title}`;
      const subIssueMarkdown = await convertToSubIssueMarkdown(
        guidelines,
        issue.number,
        issue.title
      );

      // ローカルモード判定
      const isLocalMode = process.env.LOCAL_MODE === 'true';

      if (isLocalMode) {
        // ローカルモード: mdファイルに保存
        console.log('📝 Saving guidelines to local file (LOCAL_MODE=true)...');

        const { dirname, join } = await import('path');
        const { fileURLToPath } = await import('url');
        const { mkdir } = await import('fs/promises');

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const outputDir = join(__dirname, '../output');  // ../../output → ../output に修正
        const outputPath = join(outputDir, `issue-${issue.number}-guidelines.md`);

        // output/ディレクトリを作成
        await mkdir(outputDir, { recursive: true });

        // mdファイルとして保存（タイトルも含める）
        const fullMarkdown = `# ${subIssueTitle}\n\n${subIssueMarkdown}`;
        await Bun.write(outputPath, fullMarkdown);

        console.log(`✅ Guidelines saved to: ${outputPath}`);
        console.log('');
        console.log('🎉 Feature Reviewer completed successfully (Local Mode)!');
        console.log('');
        console.log('💡 Tip: GitHubに作成する場合は、LOCAL_MODEを設定せずに実行してください');
      } else {
        // 通常モード: GitHubに作成
        console.log('📝 Creating sub-issue on GitHub...');
        const subIssue = await this.createSubIssue(
          subIssueTitle,
          subIssueMarkdown
        );
        console.log(`✅ Sub-issue created: #${subIssue.number}`);
        console.log(`   URL: ${subIssue.html_url}`);
        console.log('');

        // ====== Phase 4: 成功コメント投稿 ======
        console.log('💬 Posting success comment to parent issue...');
        await this.postSuccessComment(subIssue.number);
        console.log('✅ Success comment posted');
        console.log('');
        console.log('🎉 Feature Reviewer completed successfully!');
      }
    } catch (error) {
      console.error('❌ Feature Reviewer failed:', error);

      // エラーコメント投稿
      try {
        // Jules APIエラーの場合は既にコメント投稿済みなのでスキップ
        if (!(error instanceof JulesApiError)) {
          await this.postErrorComment(error);
          console.log('✅ Error comment posted to parent issue');
        }
      } catch (commentError) {
        console.error('❌ Failed to post error comment:', commentError);
      }

      throw error;
    }
  }

  /**
   * 親Issueを取得
   */
  private async fetchIssue() {
    return await this.issueClient.getIssue(this.issueNumber);
  }

  /**
   * サブIssueを作成
   */
  private async createSubIssue(title: string, body: string) {
    return await this.issueClient.createIssue(title, body);
  }

  /**
   * 成功コメントを投稿
   */
  private async postSuccessComment(subIssueNumber: number): Promise<void> {
    const template = await this.loadTemplate('success-comment.md');
    const comment = template.replace(
      /\{\{SUB_ISSUE_NUMBER\}\}/g,
      String(subIssueNumber)
    );
    await this.issueClient.postComment(this.issueNumber, comment);
  }

  /**
   * エラーコメントを投稿
   */
  private async postErrorComment(error: unknown): Promise<void> {
    const template = await this.loadTemplate('error-comment.md');
    const errorMessage = error instanceof Error ? error.message : String(error);
    const comment = template.replace(/\{\{ERROR_MESSAGE\}\}/g, errorMessage);
    await this.issueClient.postComment(this.issueNumber, comment);
  }

  /**
   * Jules APIエラーコメントをサブIssueに投稿
   */
  private async postJulesErrorComment(
    subIssueNumber: number,
    error: unknown
  ): Promise<void> {
    const template = await this.loadTemplate('jules-error-comment.md');
    const errorMessage = error instanceof Error ? error.message : String(error);
    const comment = template.replace(/\{\{ERROR_MESSAGE\}\}/g, errorMessage);
    await this.issueClient.postComment(subIssueNumber, comment);
  }

  /**
   * プロンプトをファイルに保存
   */
  private async savePromptToFile(
    filename: string,
    content: string
  ): Promise<string> {
    const { dirname, join } = await import('path');
    const { fileURLToPath } = await import('url');
    const { mkdir } = await import('fs/promises');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const outputDir = join(__dirname, '../prompts');
    const outputPath = join(outputDir, filename);

    await mkdir(outputDir, { recursive: true });
    await Bun.write(outputPath, content);

    return outputPath;
  }

  /**
   * テンプレートを読み込み
   */
  private async loadTemplate(filename: string): Promise<string> {
    const { dirname, join } = await import('path');
    const { fileURLToPath } = await import('url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const templatePath = join(__dirname, '../templates', filename);

    return await Bun.file(templatePath).text();
  }
}
