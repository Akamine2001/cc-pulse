/**
 * GitHub API Operations
 *
 * GitHub API操作を集約（GitHubClient + CommentPoster + ThreadResolver）
 */

import { existsSync } from 'fs';
import type { Octokit } from 'octokit';
import { BOT_SIGNATURE } from '../shared/constants';
import type { ReviewResult } from '../shared/schemas';
import { DiffParser } from './parsers';
import { formatIssueAsInlineComment } from '../shared/formatter';

// ============================================================================
// GitHub Client
// ============================================================================

export class GitHubClient {
  constructor(
    private octokit: Octokit,
    private owner: string,
    private repo: string
  ) {}

  /**
   * 最新のコミットSHAを取得
   *
   * @param prNumber PR番号
   * @returns コミットSHA
   */
  async getLatestCommitSha(prNumber: number): Promise<string> {
    const pr = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    });

    return pr.data.head.sha;
  }

  /**
   * PRの前回のレビューコメントを取得
   *
   * @param prNumber PR番号
   * @returns 自動レビューのコメントリスト
   */
  async listPreviousComments(prNumber: number): Promise<any[]> {
    const previousComments = await this.octokit.rest.pulls.listReviewComments({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    });

    // 自動レビューのコメントのみ抽出
    return previousComments.data.filter(
      c => c.body.includes(BOT_SIGNATURE)
    );
  }

  /**
   * PRにコメントを投稿
   *
   * @param prNumber PR番号
   * @param body コメント本文
   */
  async postComment(prNumber: number, body: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      body
    });
  }

  /**
   * PRにインラインコメントを投稿
   *
   * @param prNumber PR番号
   * @param headSha コミットSHA
   * @param path ファイルパス
   * @param line 行番号
   * @param body コメント本文
   */
  async postReviewComment(
    prNumber: number,
    headSha: string,
    path: string,
    line: number,
    body: string
  ): Promise<void> {
    await this.octokit.rest.pulls.createReviewComment({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      commit_id: headSha,
      path,
      line,
      body
    });
  }

  /**
   * 特定コミット間のファイル差分を取得
   *
   * @param filePath ファイルパス
   * @param fromCommit 開始コミットSHA
   * @param toCommit 終了コミットSHA
   * @returns ファイルの差分（diff形式）、変更がない場合は空文字列
   */
  async getFileDiff(filePath: string, fromCommit: string, toCommit: string): Promise<string> {
    try {
      // compareコミットで差分取得
      const comparison = await this.octokit.rest.repos.compareCommits({
        owner: this.owner,
        repo: this.repo,
        base: fromCommit,
        head: toCommit
      });

      // 該当ファイルの差分を探す
      const file = comparison.data.files?.find(f => f.filename === filePath);

      if (!file || !file.patch) {
        // ファイルに変更がない、またはpatchが取得できない
        return '';
      }

      return file.patch;
    } catch (error) {
      console.error(`Failed to get diff for ${filePath} (${fromCommit}...${toCommit})`);
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
      }
      // エラー時は空文字列を返す（差分取得失敗 = 差分なし扱い）
      return '';
    }
  }

  /**
   * レビューコメントのスレッド内の返信数を取得
   *
   * @param prNumber PR番号
   * @param commentId コメントID
   * @returns スレッド内の総コメント数（元のコメント含む）
   */
  async getConversationReplies(prNumber: number, commentId: number): Promise<number> {
    try {
      const comments = await this.octokit.rest.pulls.listReviewComments({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });

      // in_reply_to_id でスレッドを追跡
      let count = 1; // 元のコメント自身
      for (const c of comments.data) {
        if (c.in_reply_to_id === commentId) {
          // bot自身の返信は除外（ユーザーの実際の返信のみカウント）
          if (!c.body.includes(BOT_SIGNATURE)) {
            count++;
          }
        }
      }

      return count;
    } catch (error) {
      console.error(`Failed to get conversation replies for comment ${commentId}`);
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
      }
      return 1; // エラー時は元のコメントのみとして扱う
    }
  }

  /**
   * レビューコメントへの返信を投稿
   *
   * @param prNumber PR番号
   * @param commentId コメントID
   * @param body コメント本文
   */
  async postReplyComment(prNumber: number, commentId: number, body: string): Promise<void> {
    await this.octokit.rest.pulls.createReplyForReviewComment({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      comment_id: commentId,
      body
    });
  }
}

// ============================================================================
// Comment Poster
// ============================================================================

/**
 * ファイル差分への行コメント投稿
 *
 * @param githubClient GitHub APIクライアント
 * @param reviewResult レビュー結果
 * @param headSha コミットSHA
 * @param prNumber PR番号
 */
// TODO: コメント投稿失敗の原因調査
// GitHub API の "pull_request_review_thread.line could not be resolved" エラーが発生する場合がある
// 原因:
//   1. Claudeが指定した行番号が、実際のファイル全体の行番号である可能性（差分内の行番号ではない）
//   2. PR差分が大きなファイルの一部のみを含んでおり、指定行が差分に存在しない
//   3. ファイル全体の行番号と差分内の行番号の混同
// 対策案:
//   - Claudeに「差分内に存在する行番号のみを指定する」ように明示的に指示
//   - または、差分パーサーで行番号を検証し、存在しない場合はコメント投稿をスキップ
//   - 行番号マッピング機能の追加（ファイル全体の行番号 → 差分内の行番号）
//   - **推奨**: GitHubClientにバリデーション機能を追加
//     - postReviewComment() 実行前に、指定された行番号が差分に存在するかチェック
//     - 存在しない場合は警告ログを出力してスキップ（エラーにしない）
//     - DiffParserを使って差分内の有効な行範囲を取得し、その範囲内かを検証
//     - 例: `if (!diffParser.isLineInDiff(filePath, lineNumber)) { console.warn('Line not in diff, skipping...'); return; }`

export async function postInlineComments(
  githubClient: GitHubClient,
  reviewResult: ReviewResult,
  headSha: string,
  prNumber: number
): Promise<void> {
  // file_path と line_range がある問題のみ
  const inlineIssues = reviewResult.issues.filter(
    issue => issue.file_path && issue.line_range
  );

  if (inlineIssues.length === 0) {
    console.log('ℹ️ No issues with file_path/line_range for inline comments');
    return;
  }

  // 重要度順にソート（全ての問題を投稿）
  const sortedIssues = inlineIssues
    .sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

  console.log(`💬 Posting ${sortedIssues.length} inline comments (all severities)...`);

  let successCount = 0;
  let failCount = 0;

  // コードスニペット生成用のparserを初期化
  const snippetParser = new DiffParser();

  for (const issue of sortedIssues) {
    try {
      // コードスニペットを生成
      let codeSnippet: string | undefined;
      if (issue.file_path && issue.line_range) {
        codeSnippet = snippetParser.formatCodeSnippet(
          issue.file_path,
          issue.line_range.start,
          issue.line_range.end
        );
      }

      await githubClient.postReviewComment(
        prNumber,
        headSha,
        issue.file_path!,
        issue.line_range!.end,
        formatIssueAsInlineComment(issue, codeSnippet)
      );

      console.log(`  ✅ ${issue.file_path}:${issue.line_range!.end}`);
      successCount++;
    } catch (error: unknown) {
      console.error(`  ❌ Failed to post comment on ${issue.file_path}:${issue.line_range?.end}`);
      if (error instanceof Error) {
        console.error(`     Error: ${error.message}`);
        if (error.stack) {
          console.error(`     Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
        }
      } else {
        console.error(`     Error:`, error);
      }
      failCount++;
    }
  }

  console.log(`✅ Posted ${successCount} inline comments (${failCount} failed)`);
}

/**
 * PRにレビューサマリーコメントを投稿
 *
 * @param githubClient GitHub APIクライアント
 * @param prNumber PR番号
 * @param reviewMarkdown レビュー内容（Markdown形式）
 */
export async function postReviewSummaryComment(
  githubClient: GitHubClient,
  prNumber: number,
  reviewMarkdown: string
): Promise<void> {
  const body = `## 🤖 自動コードレビュー結果

${reviewMarkdown}

---
_このレビューはClaude Agent SDK${existsSync('.serena/memories/project_overview.md') ? 'とSerenaプロジェクトコンテキスト' : ''}を使用して生成されました_`;

  try {
    await githubClient.postComment(prNumber, body);
    console.log('✅ Posted review comment to GitHub');
  } catch (error) {
    console.error('❌ Failed to post comment to GitHub:', error);
    throw error;
  }
}

// ============================================================================
// Thread Resolver
// ============================================================================

interface ReviewThread {
  id: string;
  isResolved: boolean;
  comments: {
    nodes: Array<{
      databaseId: number;
      body: string;
    }>;
  };
}

interface ReviewThreadsResponse {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: ReviewThread[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    };
  };
}

/**
 * GitHub GraphQL APIを使ってreview threadをResolveする
 */
export class ThreadResolver {
  constructor(private octokit: Octokit) {}

  /**
   * PR全体のreviewThreadsを取得してthreadIdマッピングを作成
   * ページネーション対応で全てのthreadsを取得
   */
  async buildThreadMap(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Map<number, string>> {
    const threadMap = new Map<number, string>();
    let hasNextPage = true;
    let cursor: string | null = null;

    console.log('🔍 Fetching review threads from GraphQL API...');

    while (hasNextPage) {
      const response: ReviewThreadsResponse = await this.octokit.graphql<ReviewThreadsResponse>(`
        query($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $prNumber) {
              reviewThreads(first: 100, after: $cursor) {
                nodes {
                  id
                  isResolved
                  comments(first: 100) {
                    nodes {
                      databaseId
                      body
                    }
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      `, { owner, repo, prNumber, cursor });

      // nullチェック: GraphQL APIがnullを返す可能性に対応
      if (!response.repository?.pullRequest?.reviewThreads) {
        console.error('⚠️ Failed to fetch review threads: repository or pullRequest is null');
        break;
      }

      const reviewThreads = response.repository.pullRequest.reviewThreads;
      const nodes = reviewThreads.nodes;
      const pageInfo = reviewThreads.pageInfo;

      // comment.databaseId → thread.id のマッピングを構築
      for (const thread of nodes) {
        for (const comment of thread.comments.nodes) {
          threadMap.set(comment.databaseId, thread.id);
        }
      }

      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;

      console.log(`  Fetched ${nodes.length} threads, total mapped: ${threadMap.size} comments`);
    }

    console.log(`✅ Built thread map: ${threadMap.size} comments mapped to threads`);

    return threadMap;
  }

  /**
   * Review threadをResolveする
   */
  async resolveThread(threadId: string): Promise<void> {
    try {
      await this.octokit.graphql(`
        mutation($threadId: ID!) {
          resolveReviewThread(input: {threadId: $threadId}) {
            thread {
              id
              isResolved
            }
          }
        }
      `, { threadId });

      console.log(`✅ Resolved thread: ${threadId}`);
    } catch (error) {
      console.error(`❌ Failed to resolve thread ${threadId}:`, error);
      throw error;
    }
  }

  /**
   * 複数のthreadsを一括Resolve
   */
  async resolveThreads(threadIds: string[]): Promise<void> {
    console.log(`🔄 Resolving ${threadIds.length} threads...`);

    for (const threadId of threadIds) {
      await this.resolveThread(threadId);
    }

    console.log(`✅ Resolved ${threadIds.length} threads`);
  }

  /**
   * resolve済みのreview thread IDセットを取得
   * ページネーション対応で全てのresolve済みthreadsを取得
   */
  async getResolvedThreadIds(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Set<string>> {
    const resolvedIds = new Set<string>();
    let hasNextPage = true;
    let cursor: string | null = null;

    console.log('🔍 Fetching resolved threads from GraphQL API...');

    while (hasNextPage) {
      const response: ReviewThreadsResponse = await this.octokit.graphql<ReviewThreadsResponse>(`
        query($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $prNumber) {
              reviewThreads(first: 100, after: $cursor) {
                nodes {
                  id
                  isResolved
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      `, { owner, repo, prNumber, cursor });

      // nullチェック: GraphQL APIがnullを返す可能性に対応
      if (!response.repository?.pullRequest?.reviewThreads) {
        console.error('⚠️ Failed to fetch review threads: repository or pullRequest is null');
        break;
      }

      const reviewThreads = response.repository.pullRequest.reviewThreads;
      const nodes = reviewThreads.nodes;
      const pageInfo = reviewThreads.pageInfo;

      // resolve済みのthreadIdを収集
      for (const thread of nodes) {
        if (thread.isResolved) {
          resolvedIds.add(thread.id);
        }
      }

      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;

      console.log(`  Fetched ${nodes.length} threads, ${resolvedIds.size} resolved so far`);
    }

    console.log(`✅ Found ${resolvedIds.size} resolved threads`);
    return resolvedIds;
  }
}
