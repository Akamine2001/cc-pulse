// tools/pr-review/mcp/handlers/comments/update-conversation.ts

import type { ToolHandler, ToolResult } from '../../types';
import type { ReviewContext } from '../../context/review-context';
import { BOT_SIGNATURE, AI_AGENT_MENTION } from '../../../../shared/constants';

type ConversationAction =
  | 'no_change'
  | 'has_replies'
  | 'major_change'
  | 'todo_added'
  | 'not_resolved';

interface UpdateConversationArgs {
  comment_id: number;
  thread_id: string | null;
  action: ConversationAction;
  reasoning: string;
}

export const updateConversationHandler: ToolHandler = {
  name: 'update_conversation',

  description: 'Update conversation status and post comment based on A/B/C analysis',

  inputSchema: {
    type: 'object',
    properties: {
      comment_id: {
        type: 'number',
        description: 'Comment ID from get_comments_for_file'
      },
      thread_id: {
        type: ['string', 'null'],
        description: 'Thread ID from get_comments_for_file (nullable)'
      },
      action: {
        type: 'string',
        enum: ['no_change', 'has_replies', 'major_change', 'todo_added', 'not_resolved'],
        description: 'Action to take'
      },
      reasoning: {
        type: 'string',
        description: 'Reasoning for the action'
      }
    },
    required: ['comment_id', 'action', 'reasoning']
  },

  async execute(args: unknown, context: ReviewContext): Promise<ToolResult> {
    const { comment_id, thread_id, action, reasoning } = args as UpdateConversationArgs;

    const prClient = context.getPRClient();
    const threadResolver = context.getThreadResolver();

    if (!prClient || !threadResolver) {
      return {
        content: [{ type: 'text', text: '❌ GitHub clients not initialized' }],
        isError: true
      };
    }

    const { prNumber, prAuthor } = context.config;

    try {
      switch (action) {
        case 'no_change':
          await prClient.postReplyComment(
            prNumber,
            comment_id,
            `@${AI_AGENT_MENTION}\n\n⚠️ このファイルはコメント投稿後に変更されていません。\n\n${reasoning}\n\n引き続き対応をお願いします 🙏\n\n_- ${BOT_SIGNATURE}_`
          );
          console.error(`[MCP] Posted warning for comment ${comment_id}`);
          break;

        case 'has_replies':
          await prClient.postReplyComment(
            prNumber,
            comment_id,
            `@${prAuthor} こちらのConversationについて、判断をお願いします。\n\n${reasoning}\n\nファイルに変更がありましたが、議論が継続中のため、自動クローズしていません。\n\n_- ${BOT_SIGNATURE}_`
          );
          console.error(`[MCP] Mentioned owner for comment ${comment_id}`);
          break;

        case 'major_change':
          if (thread_id) {
            await threadResolver.resolveThread(thread_id);
            console.error(`[MCP] Resolved thread ${thread_id}`);
            await prClient.postReplyComment(
              prNumber,
              comment_id,
              `✅ 実装が大幅に変更されました\n\n${reasoning}\n\n前回の指摘は無効になりました。新しい実装に問題があれば、次のレビューでお知らせします。\n\n_- ${BOT_SIGNATURE}_`
            );
          } else {
            await prClient.addReactionToIssueComment(comment_id, '+1');
            console.error(`[MCP] Added reaction to issue comment ${comment_id}`);
          }
          console.error(`[MCP] Resolved comment ${comment_id} (major_change)`);
          break;

        case 'todo_added':
          if (thread_id) {
            await threadResolver.resolveThread(thread_id);
            console.error(`[MCP] Resolved thread ${thread_id}`);
            await prClient.postReplyComment(
              prNumber,
              comment_id,
              `✅ TODO/コメントで対応計画が記載されました\n\n${reasoning}\n\n対応計画が明確なため、クローズします。\n\n_- ${BOT_SIGNATURE}_`
            );
          } else {
            await prClient.addReactionToIssueComment(comment_id, '+1');
            console.error(`[MCP] Added reaction to issue comment ${comment_id}`);
          }
          console.error(`[MCP] Resolved comment ${comment_id} (todo_added)`);
          break;

        case 'not_resolved':
          await prClient.postReplyComment(
            prNumber,
            comment_id,
            `@${AI_AGENT_MENTION}\n\n⚠️ まだ根本的な解決に至っていません\n\n${reasoning}\n\n引き続き対応をお願いします 🙏\n\n_- ${BOT_SIGNATURE}_`
          );
          console.error(`[MCP] Posted reminder for comment ${comment_id}`);
          break;
      }

      return {
        content: [{
          type: 'text',
          text: `✅ ${action} processed successfully for comment ${comment_id}`
        }]
      };

    } catch (error) {
      console.error(`[MCP] Failed to update conversation for comment ${comment_id}:`, error);
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to update conversation: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
};
