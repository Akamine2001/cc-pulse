#!/usr/bin/env bun
/**
 * MCP Server for PR review output (TypeScript stdio)
 *
 * Provides tools:
 * - format_review: Format and validate review data before submission
 * - submit_review: Submit the final review result
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Import schemas from shared
import { ReviewIssueSchema, ReviewStatsSchema } from '../shared/schemas';

// Input schemas
const FormatReviewInputSchema = z.object({
  issues: z.array(ReviewIssueSchema),
  summary: z.string(),
  stats: ReviewStatsSchema
});

const SubmitReviewInputSchema = z.object({
  issues: z.array(ReviewIssueSchema),
  summary: z.string(),
  stats: ReviewStatsSchema
});

type FormatReviewInput = z.infer<typeof FormatReviewInputSchema>;
type SubmitReviewInput = z.infer<typeof SubmitReviewInputSchema>;

// Create MCP server
const server = new Server(
  {
    name: 'review-output',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'format_review',
        description: 'Format and validate review data before submission. Call this with your review data to validate the format before calling submit_review.',
        inputSchema: zodToJsonSchema(FormatReviewInputSchema, { $refStrategy: 'none' })
      },
      {
        name: 'submit_review',
        description: 'Submit the final review result. ONLY call this after format_review succeeds.',
        inputSchema: zodToJsonSchema(SubmitReviewInputSchema, { $refStrategy: 'none' })
      }
    ] as Tool[]
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'format_review') {
    const input = FormatReviewInputSchema.parse(args);

    // Validate stats consistency
    const actualStats = {
      total_issues: input.issues.length,
      critical: input.issues.filter(i => i.severity === 'critical').length,
      high: input.issues.filter(i => i.severity === 'high').length,
      medium: input.issues.filter(i => i.severity === 'medium').length,
      low: input.issues.filter(i => i.severity === 'low').length
    };

    const statsMatch =
      actualStats.total_issues === input.stats.total_issues &&
      actualStats.critical === input.stats.critical &&
      actualStats.high === input.stats.high &&
      actualStats.medium === input.stats.medium &&
      actualStats.low === input.stats.low;

    if (!statsMatch) {
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ Stats mismatch detected!\n\nExpected: ${JSON.stringify(input.stats)}\nActual: ${JSON.stringify(actualStats)}\n\nPlease correct the stats and try again.`
          }
        ]
      };
    }

    // Validation passed
    return {
      content: [
        {
          type: 'text',
          text: `✅ Review data validated successfully!\n\nFormatted review (${input.issues.length} issues):\n- Critical: ${actualStats.critical}\n- High: ${actualStats.high}\n- Medium: ${actualStats.medium}\n- Low: ${actualStats.low}\n\n✅ Validation passed! Now call submit_review with this exact data.`
        }
      ]
    };
  }

  if (name === 'submit_review') {
    const input = SubmitReviewInputSchema.parse(args);

    // Stats validation (same as format_review)
    const actualStats = {
      total_issues: input.issues.length,
      critical: input.issues.filter(i => i.severity === 'critical').length,
      high: input.issues.filter(i => i.severity === 'high').length,
      medium: input.issues.filter(i => i.severity === 'medium').length,
      low: input.issues.filter(i => i.severity === 'low').length
    };

    // Return success message
    return {
      content: [
        {
          type: 'text',
          text: `✅ Review result submitted successfully.\n\nTotal issues: ${actualStats.total_issues}\n- Critical: ${actualStats.critical}\n- High: ${actualStats.high}\n- Medium: ${actualStats.medium}\n- Low: ${actualStats.low}`
        }
      ]
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Run server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
