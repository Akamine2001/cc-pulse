/**
 * Jules Session Creator
 *
 * /jules コマンドのメインロジック
 */
import type { Octokit } from 'octokit';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { IssueClient, type IssueInfo } from '../shared/github/issue-client';
import { JulesApiClient } from '../feature-reviewer/core/jules-client';
import { retry } from '../shared/retry';

interface CommandOptions {
  branch?: string;
  force: boolean;
}

export class JulesSessionCreator {
  private issueClient: IssueClient;
  private julesClient: JulesApiClient;

  constructor(
    private octokit: Octokit,
    private owner: string,
    private repo: string,
    private issueNumber: number,
    private commentBody: string,
    private commentUser: string
  ) {
    this.issueClient = new IssueClient(octokit, owner, repo);
    const apiKey = process.env.JULES_API_KEY;
    if (!apiKey) {
      throw new Error('JULES_API_KEY environment variable is required');
    }
    this.julesClient = new JulesApiClient(apiKey, owner, repo);
  }

  async execute(): Promise<void> {
    try {
      const options = this.parseCommand();
      const { parentIssue, subIssue } = await this.resolveIssues();

      if (!subIssue && !options.force) {
        await this.postNoSubIssueComment();
        return;
      }

      const prompt = this.createPrompt(parentIssue, subIssue, options);

      const julesResponse = await retry(3, () =>
        this.julesClient.startAutomatedImplementation(prompt, parentIssue.number, subIssue?.number, options.branch)
      );

      await this.postSessionCreatedComment(parentIssue.number, subIssue?.number, julesResponse.url);
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  private parseCommand(): CommandOptions {
    const parts = this.commentBody.trim().split(/\s+/);
    const options: CommandOptions = { force: false };
    for (let i = 1; i < parts.length; i++) {
      if ((parts[i] === '-b' || parts[i] === '--branch') && i + 1 < parts.length) {
        options.branch = parts[++i];
      } else if (parts[i] === '-f' || parts[i] === '--force') {
        options.force = true;
      }
    }
    return options;
  }

  private async resolveIssues(): Promise<{ parentIssue: IssueInfo; subIssue?: IssueInfo }> {
    const currentIssue = await this.issueClient.getIssue(this.issueNumber);

    const parentIssueNumber = this.extractParentIssueNumber(currentIssue);
    if (parentIssueNumber) {
      const parentIssue = await this.issueClient.getIssue(parentIssueNumber);
      const subIssues = await this.issueClient.findSubIssues(parentIssueNumber);
      return { parentIssue, subIssue: subIssues[0] };
    }

    const subIssues = await this.issueClient.findSubIssues(this.issueNumber);
    return { parentIssue: currentIssue, subIssue: subIssues[0] };
  }

  private extractParentIssueNumber(issue: IssueInfo): number | null {
    const match = issue.body?.match(/<!-- parent-issue: #(\d+) -->/);
    if (match && match[1]) {
        return parseInt(match[1]);
    }
    return null;
  }

  private createPrompt(parentIssue: IssueInfo, subIssue: IssueInfo | undefined, options: CommandOptions): string {
    let prompt = `# Issue #${parentIssue.number}: ${parentIssue.title}\n\n${parentIssue.body}`;
    if (subIssue) {
      prompt += `\n\n---\n\n# Sub-Issue #${subIssue.number}: ${subIssue.title}\n\n${subIssue.body}`;
    }
    if (options.branch) {
      prompt += `\n\n---\n\n**Branch:** ${options.branch}`;
    }
    return prompt;
  }

  private async postSessionCreatedComment(parentIssueNumber: number, subIssueNumber: number | undefined, sessionUrl: string): Promise<void> {
    const template = await this.loadTemplate('session-created.md');
    const comment = template.replace(/\{\{JULES_SESSION_URL\}\}/g, sessionUrl);

    await this.issueClient.postComment(parentIssueNumber, comment);
    if (subIssueNumber && subIssueNumber !== parentIssueNumber) {
      await this.issueClient.postComment(subIssueNumber, comment);
    }
  }

  private async postNoSubIssueComment(): Promise<void> {
    const template = await this.loadTemplate('no-sub-issue.md');
    await this.issueClient.postComment(this.issueNumber, template);
  }

  private async handleError(error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const template = await this.loadTemplate('error.md');
    const comment = template.replace(/\{\{ERROR_MESSAGE\}\}/g, errorMessage);

    const { parentIssue } = await this.resolveIssues().catch(() => ({ parentIssue: { number: this.issueNumber } }));

    await this.issueClient.postComment(this.issueNumber, comment);
    if (parentIssue.number !== this.issueNumber) {
        await this.issueClient.postComment(parentIssue.number, comment);
    }
  }

  private async loadTemplate(filename: string): Promise<string> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const templatePath = join(__dirname, 'templates', filename);
    return await Bun.file(templatePath).text();
  }
}
