#!/usr/bin/env bun
/**
 * MCP Server for PR review utilities (TypeScript stdio)
 *
 * Provides tools:
 * - submit_review: Submit the final review result with automatic validation
 * - get_comments_for_file: Get existing review comments for a specific file
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { existsSync } from 'fs';
import { Octokit } from 'octokit';
import { PRClient } from '../../shared/github/pr-client';
import { ThreadResolver } from '../../shared/github/thread-resolver';
import { BOT_SIGNATURE, AI_AGENT_MENTION } from '../../shared/constants';
import { ReviewContext } from './context/review-context';
import { guidelinesHandlers } from './handlers/guidelines/index.js';
import { commentsHandlers } from './handlers/comments/index.js';
import { reviewHandlers } from './handlers/review/index.js';
import type { ToolHandler } from './types.js';

// Import schemas from shared
import {
  ReviewIssueSchema,
  ReviewStatsSchema,
  SubmitAllReviewsInputSchema,
  type ReviewComment,
  type ReviewIssue,
  type CategoryComment
} from '../shared/schemas';
import type { GuidelinesFile } from '../shared/guidelines-types';
import type { ToolResult } from './types';

let context: ReviewContext;

// The MCP SDK does not export the server-side result type, so we define a local one
// that is compatible with our ToolResult
type ServerResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

// Input schema
const SubmitReviewInputSchema = z.object({
  issues: z.array(ReviewIssueSchema),
  summary: z.string(),
  stats: ReviewStatsSchema
});

type SubmitReviewInput = z.infer<typeof SubmitReviewInputSchema>;



// Create MCP server
const server = new Server(
  {
    name: 'review-util',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Register handlers
const handlers = new Map<string, ToolHandler>();

// New modular handlers
for (const handler of [...guidelinesHandlers, ...commentsHandlers, ...reviewHandlers]) {
  handlers.set(handler.name, handler);
}
// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const dynamicTools = [...handlers.values()].map(h => ({
    name: h.name,
    description: h.description,
    inputSchema: h.inputSchema,
  }));
  return {
    tools: [
      ...dynamicTools,
    ] as Tool[]
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Dynamic handler lookup
  const handler = handlers.get(name);
  if (handler) {
    const result: ToolResult = await handler.execute(args, context);
    return result as ServerResult;
  }





  throw new Error(`Unknown tool: ${name}`);
});

// Run server
async function main() {
  context = await ReviewContext.create(process.env);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
