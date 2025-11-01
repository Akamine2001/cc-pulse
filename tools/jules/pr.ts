
import { Octokit } from 'octokit';
import { Command } from 'commander';
import { PRClient } from '../../shared/github/pr-client';
import { ThreadResolver } from '../../shared/github/thread-resolver';
import { GITHUB_OWNER, GITHUB_REPO } from '../../shared/constants';

// Function to get all review comments for a pull request
async function getAllReviewComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
) {
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
  const threadResolver = new ThreadResolver(octokit);
  const program = new Command();

  program
    .command('get-comments')
    .description('Get unresolved inline comments that mention @jules.')
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

        const response: any = await octokit.graphql(
          `
          query($owner: String!, $repo: String!, $prNumber: Int!) {
            repository(owner: $owner, name: $repo) {
              pullRequest(number: $prNumber) {
                reviewThreads(first: 100) {
                  nodes {
                    isResolved
                    comments(first: 100) {
                      nodes {
                        databaseId
                      }
                    }
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
          }
        );

        const unresolvedCommentIds = new Set<number>();
        response.repository.pullRequest.reviewThreads.nodes.forEach((thread: any) => {
          if (!thread.isResolved) {
            thread.comments.nodes.forEach((comment: any) => {
              unresolvedCommentIds.add(comment.databaseId);
            });
          }
        });

        const julesComments = allComments
          .filter(
            (c: any) =>
              c.body.includes('@jules') && unresolvedCommentIds.has(c.id)
          )
          .map((c: any) => ({
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
          console.error('No unresolved @jules comments found');
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
