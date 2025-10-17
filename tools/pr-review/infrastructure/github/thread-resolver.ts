import { Octokit } from 'octokit';

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
}
