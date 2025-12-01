import type { ToolHandler } from '../../types';
import { addReviewCommentHandler } from './add-review-comment';
import { submitAllReviewsHandler } from './submit-all-reviews';

export const reviewHandlers: ToolHandler[] = [
  addReviewCommentHandler,
  submitAllReviewsHandler
];
