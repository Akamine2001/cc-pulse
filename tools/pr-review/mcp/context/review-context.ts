// tools/pr-review/mcp/context/review-context.ts

import { Octokit } from 'octokit';
import type { ReviewComment, ReviewIssue } from '../../shared/schemas';
import type { GuidelinesFile } from '../../shared/guidelines-types';
import type { ReviewContextConfig } from '../types';
import { PRClient } from '../../../shared/github/pr-client';
import { ThreadResolver } from '../../../shared/github/thread-resolver';
import { existsSync } from 'fs';

export class ReviewContext {
  // ========================================
  // 状態（private）
  // ========================================

  private commentsByFile = new Map<string, ReviewComment[]>();
  private reviewIssuesBuffer: ReviewIssue[] = [];
  private guidelinesData: GuidelinesFile | null = null;

  // ========================================
  // クライアント（private）
  // ========================================

  private octokit: Octokit | null = null;
  private prClient: PRClient | null = null;
  private threadResolver: ThreadResolver | null = null;

  // ========================================
  // 設定（readonly）
  // ========================================

  readonly config: ReviewContextConfig;

  // ========================================
  // コンストラクタ（private - factoryメソッドを使用）
  // ========================================

  private constructor(config: ReviewContextConfig) {
    this.config = config;
  }

  // ========================================
  // ファクトリーメソッド
  // ========================================

  /**
   * 環境変数からReviewContextを作成
   */
  static async create(env: NodeJS.ProcessEnv): Promise<ReviewContext> {
    const config: ReviewContextConfig = {
      prNumber: parseInt(env.PR_NUMBER || '0', 10),
      prAuthor: env.PR_AUTHOR || '',
      headSha: env.HEAD_SHA || '',
      owner: env.GITHUB_OWNER || '',
      repo: env.GITHUB_REPO || '',
      guidelinesFilePath: env.GUIDELINES_FILE_PATH || '',
      existingCommentsPath: env.EXISTING_COMMENTS_PATH || '',
      isLocalMode: env.LOCAL_MODE === 'true',
      julesSessionFound: env.JULES_SESSION_FOUND === 'true'
    };

    const context = new ReviewContext(config);
    await context.initialize(env);
    return context;
  }

  // ========================================
  // 初期化
  // ========================================

  private async initialize(env: NodeJS.ProcessEnv): Promise<void> {
    await this.initializeComments();
    this.initializeGitHubClients(env);
    await this.initializeGuidelines();
  }

  private async initializeComments(): Promise<void> {
    const filePath = this.config.existingCommentsPath;

    if (!filePath || !existsSync(filePath)) {
      console.error('[MCP] No existing comments file found');
      return;
    }

    try {
      const comments: ReviewComment[] = await Bun.file(filePath).json();

      for (const comment of comments) {
        if (!this.commentsByFile.has(comment.file_path)) {
          this.commentsByFile.set(comment.file_path, []);
        }
        this.commentsByFile.get(comment.file_path)!.push(comment);
      }

      console.error(`[MCP] Loaded ${comments.length} existing comments from ${filePath}`);
    } catch (error) {
      console.error('[MCP] Failed to load existing comments:', error);
    }
  }

  private initializeGitHubClients(env: NodeJS.ProcessEnv): void {
    if (this.config.isLocalMode) {
      console.error('[MCP] Running in LOCAL_MODE - GitHub posting disabled');
      return;
    }

    const token = env.GITHUB_TOKEN;
    if (!token || !this.config.owner || !this.config.repo || !this.config.prNumber) {
      console.error('[MCP] Missing required environment variables for GitHub API');
      return;
    }

    this.octokit = new Octokit({ auth: token });
    this.prClient = new PRClient(this.octokit, this.config.owner, this.config.repo);
    this.threadResolver = new ThreadResolver(this.octokit);

    console.error('[MCP] GitHub clients initialized');
  }

  private async initializeGuidelines(): Promise<void> {
    if (!this.config.guidelinesFilePath || !existsSync(this.config.guidelinesFilePath)) {
      console.error('[MCP-ReviewUtil] No guidelines file found:', this.config.guidelinesFilePath);
      return;
    }

    try {
      this.guidelinesData = await Bun.file(this.config.guidelinesFilePath).json();
      console.error(`[MCP-ReviewUtil] Loaded ${this.guidelinesData?.guidelines.length || 0} guidelines from ${this.config.guidelinesFilePath}`);
    } catch (error) {
      console.error('[MCP-ReviewUtil] Failed to load guidelines:', error);
    }
  }

  // ========================================
  // コメント管理
  // ========================================

  getCommentsForFile(filePath: string): ReviewComment[] {
    const allComments = this.commentsByFile.get(filePath) || [];
    return allComments.filter(c => !c.is_resolved);
  }

  // ========================================
  // レビューIssueバッファ管理
  // ========================================

  addReviewIssue(issue: ReviewIssue): void {
    this.reviewIssuesBuffer.push(issue);
  }

  getReviewIssuesBuffer(): readonly ReviewIssue[] {
    return this.reviewIssuesBuffer;
  }

  getReviewIssuesCount(): number {
    return this.reviewIssuesBuffer.length;
  }

  clearReviewIssuesBuffer(): void {
    this.reviewIssuesBuffer.length = 0;
  }

  // ========================================
  // ガイドライン管理
  // ========================================

  getGuidelines(): GuidelinesFile | null {
    return this.guidelinesData;
  }

  getUncheckedGuideline(): any /* Guideline | null */ {
    if (!this.guidelinesData) {
      return null;
    }
    return this.guidelinesData.guidelines.find(g => !g.checked) || null;
  }

  markGuidelineChecked(id: number): boolean {
    if (!this.guidelinesData) {
      return false;
    }
    const guideline = this.guidelinesData.guidelines.find(g => g.id === id);
    if (guideline) {
      guideline.checked = true;
      return true;
    }
    return false;
  }

  async saveGuidelines(): Promise<void> {
    if (!this.guidelinesData || !this.config.guidelinesFilePath) {
      console.error('[MCP-ReviewUtil] Cannot save: no data or file path');
      return;
    }

    try {
      await Bun.write(this.config.guidelinesFilePath, JSON.stringify(this.guidelinesData, null, 2));
      console.error(`[MCP-ReviewUtil] Saved guidelines to ${this.config.guidelinesFilePath}`);
    } catch (error) {
      console.error('[MCP-ReviewUtil] Failed to save guidelines:', error);
      throw error;
    }
  }

  // ========================================
  // クライアントアクセサ
  // ========================================

  getPRClient(): PRClient | null {
    return this.prClient;
  }

  getThreadResolver(): ThreadResolver | null {
    return this.threadResolver;
  }

  getOctokit(): Octokit | null {
    return this.octokit;
  }
}
