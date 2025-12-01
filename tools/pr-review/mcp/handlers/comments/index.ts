// tools/pr-review/mcp/handlers/comments/index.ts

export { getCommentsForFileHandler } from './get-comments-for-file';
export { updateConversationHandler } from './update-conversation';

import type { ToolHandler } from '../../types';
import { getCommentsForFileHandler } from './get-comments-for-file';
import { updateConversationHandler } from './update-conversation';

export const commentsHandlers: ToolHandler[] = [
  getCommentsForFileHandler,
  updateConversationHandler
];
