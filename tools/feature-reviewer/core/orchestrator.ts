/**
 * Feature Reviewer Orchestrator
 *
 * Issue分析からサブIssue作成までのメインフロー制御
 */

import type { Octokit } from 'octokit';
import { spawn } from 'bun';
import { IssueClient, type Issue } from '../../shared/github/issue-client';
import { IssueAnalyzer } from './analyzer';
import { JulesClient } from '../lib/jules-client';
import { convertToSubIssueMarkdown } from '../lib/markdown-converter';

export class FeatureReviewOrchestrator {
  private issueClient: IssueClient;

  constructor(
    private octokit: Octokit,
    private owner: string,
    private repo: string,
    private issueNumber: number
  ) {
    this.issueClient = new IssueClient(octokit, owner, repo);
  }

  /**
   * Julesセッションを起動
   */
  private async invokeJulesSession(
    issue: Issue,
    subIssueNumber: number
  ): Promise<{ sessionId: string; url: string }> {
    console.log('');
    console.log('🤖 Invoking Jules AI for auto-implementation...');

    try {
      // プロンプトをファイルに保存
      const prompt = await this.savePromptToFile(issue);

      // デフォルトブランチを取得
      const startingBranch = await this.getDefaultBranch();

      // Jules API呼び出し
      const julesClient = new JulesClient();
      const session = await julesClient.createSession(
        prompt,
        this.owner,
        this.repo,
        startingBranch
      );

      console.log('✅ Jules invocation successful');
      return session;
    } catch (error) {
      console.error('❌ Jules invocation failed:', error);
      // サブIssueにエラーコメントを投稿
      await this.postJulesErrorComment(subIssueNumber, error);
      // 失敗してもメインフローは継続させるため、空のURLを返す
      return { sessionId: '', url: '' };
    }
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

        const subIssue = await this.createSubIssue(subIssueTitle, subIssueMarkdown);

        console.log(`✅ Sub-issue created: #${subIssue.number}`);
        console.log(`   URL: ${subIssue.html_url}`);

        // ====== 【NEW】Phase 4: Jules API呼び出し ======
        // ローカルモードでない場合のみJules APIを呼び出す
        const julesSession = await this.invokeJulesSession(issue, subIssue.number);

        // ====== Phase 5: 成功コメント投稿 ======
        console.log('💬 Posting success comment to parent issue...');

        await this.postSuccessComment(subIssue.number, julesSession.url);

        console.log('✅ Success comment posted');
        console.log('');
        console.log('🎉 Feature Reviewer completed successfully!');
      }
    } catch (error) {
      console.error('❌ Feature Reviewer failed:', error);

      // エラーコメント投稿
      try {
        await this.postErrorComment(error);
        console.log('✅ Error comment posted to parent issue');
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
  private async postSuccessComment(subIssueNumber: number, julesSessionUrl: string): Promise<void> {
    const template = await this.loadTemplate('success-comment.md');
    const comment = template
      .replace(/\{\{SUB_ISSUE_NUMBER\}\}/g, String(subIssueNumber))
      .replace(/\{\{JULES_SESSION_URL\}\}/g, julesSessionUrl || 'N/A');
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

  /**
   * デフォルトブランチを取得
   */
  private async getDefaultBranch(): Promise<string> {
    console.log('🌿 Getting default branch...');
    const proc = spawn(['gh', 'repo', 'view', `${this.owner}/${this.repo}`, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.error(`❌ gh command failed with exit code ${exitCode}`);
      console.error('   Stderr:', stderr);
      throw new Error(`Failed to get default branch: ${stderr}`);
    }

    const branch = stdout.trim();
    console.log(`✅ Default branch: ${branch}`);
    return branch;
  }

  /**
   * 親Issueの本文をプロンプトファイルとして保存
   */
  private async savePromptToFile(issue: Issue): Promise<string> {
    console.log('📝 Saving parent issue to prompt file...');
    const { dirname, join } = await import('path');
    const { fileURLToPath } = await import('url');
    const { mkdir } = await import('fs/promises');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const promptsDir = join(__dirname, '../prompts');
    const promptPath = join(promptsDir, `issue-${issue.number}.md`);

    await mkdir(promptsDir, { recursive: true });

    const content = `# Issue #${issue.number}: ${issue.title}\n\n${issue.body}`;
    await Bun.write(promptPath, content);

    console.log(`✅ Prompt file saved to: ${promptPath}`);
    return content;
  }

  /**
   * Jules APIエラーをサブIssueにコメント
   */
  private async postJulesErrorComment(subIssueNumber: number, error: unknown): Promise<void> {
    console.log(`💬 Posting Jules error comment to sub-issue #${subIssueNumber}...`);
    const template = await this.loadTemplate('jules-error-comment.md');
    const errorMessage = error instanceof Error ? error.message : String(error);
    const comment = template.replace(/\{\{ERROR_MESSAGE\}\}/g, errorMessage);
    await this.issueClient.postComment(subIssueNumber, comment);
    console.log('✅ Jules error comment posted.');
  }
}
