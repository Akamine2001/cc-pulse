
import { Octokit } from 'octokit';
import { Command } from 'commander';
import { PRClient } from '../../shared/github/pr-client';
import { GITHUB_OWNER, GITHUB_REPO } from '../../shared/constants';
import { AI_AGENT_MENTION } from '../../pr-review/shared/constants';

interface ReviewComment {
  id: number;
  body: string;
  path: string;
  start_line: number;
  line: number;
}

interface GraphQLResponse {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: Array<{
          isResolved: boolean;
          comments: {
            nodes: Array<{
              databaseId: number;
            }>;
          };
        }>;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    };
  };
}

// Function to get all review comments for a pull request
async function getAllReviewComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<ReviewComment[]> {
  return await octokit.paginate(octokit.rest.pulls.listReviewComments, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });
}

// Main function to run the CLI tool
async function main() {
  const token = process.env.JULES_GITHUB_TOKEN;
  if (!token) {
    console.error('Error: JULES_GITHUB_TOKEN environment variable is not set.');
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });
  const prClient = new PRClient(octokit, GITHUB_OWNER, GITHUB_REPO);
  const program = new Command();

  program
    .command('get-comments')
    .description(`Get unresolved inline comments that mention @${AI_AGENT_MENTION}.`)
    .requiredOption('--pr <number>', 'Pull request number')
    .action(async (options) => {
      const prNumber = parseInt(options.pr, 10);
      try {
        const allComments = await getAllReviewComments(
          octokit,
          GITHUB_OWNER,
          GITHUB_REPO,
          prNumber
        );

        const unresolvedCommentIds = new Set<number>();
        let hasNextPage = true;
        let cursor: string | null = null;

        while (hasNextPage) {
          const response: GraphQLResponse = await octokit.graphql(
            `
            query($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String) {
              repository(owner: $owner, name: $repo) {
                pullRequest(number: $prNumber) {
                  reviewThreads(first: 100, after: $cursor) {
                    nodes {
                      isResolved
                      comments(first: 100) {
                        nodes {
                          databaseId
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
          `,
            {
              owner: GITHUB_OWNER,
              repo: GITHUB_REPO,
              prNumber,
              cursor,
            }
          );

          if (!response.repository?.pullRequest?.reviewThreads) {
            console.error('⚠️ Failed to fetch review threads: repository or pullRequest is null');
            break;
          }

          const reviewThreads = response.repository.pullRequest.reviewThreads;
          reviewThreads.nodes.forEach((thread) => {
            if (!thread.isResolved) {
              thread.comments.nodes.forEach((comment) => {
                unresolvedCommentIds.add(comment.databaseId);
              });
            }
          });

          hasNextPage = reviewThreads.pageInfo.hasNextPage;
          cursor = reviewThreads.pageInfo.endCursor;
        }

        const julesComments = allComments
          .filter(
            (c) =>
              c.body.includes(`@${AI_AGENT_MENTION}`) &&
              unresolvedCommentIds.has(c.id)
          )
          .map((c) => ({
            comment_id: c.id,
            file_path: c.path,
            line_range: {
              start: c.start_line ?? c.line,
              end: c.line,
            },
            body: c.body,
          }));

        if (julesComments.length === 0) {
          console.log('[]')
          console.error(`No unresolved @${AI_AGENT_MENTION} comments found`);
        } else {
          console.log(JSON.stringify(julesComments, null, 2));
        }
      } catch (error) {
        console.error('Error getting comments:', error);
        process.exit(1);
      }
    });

  program
    .command('reply')
    .description('Reply to an inline comment.')
    .requiredOption('--pr <number>', 'Pull request number')
    .requiredOption('--comment-id <number>', 'Comment ID to reply to')
    .requiredOption('--body <string>', 'Reply message')
    .action(async (options) => {
      const prNumber = parseInt(options.pr, 10);
      const commentId = parseInt(options.commentId, 10);
      const body = options.body.replace(/\\n/g, '\n');
      try {
        await prClient.postReplyComment(prNumber, commentId, body);
        console.log('✅ Reply posted successfully');
        console.log(`PR: #${prNumber}`);
        console.log(`Comment ID: ${commentId}`);
      } catch (error) {
        console.error('Error posting reply:', error);
        process.exit(1);
      }
    });

  program.parse(process.argv);
}

main();
