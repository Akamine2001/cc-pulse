#!/usr/bin/env bun
/**
 * MCP Server for Feature Reviewer (TypeScript stdio)
 *
 * Provides tools:
 * - create_review_guidelines: Create review and test guidelines from analysis
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { GuidelinesOutputSchema } from '../shared/schemas';

// Create MCP server
const server = new Server(
  {
    name: 'feature-review',
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
        name: 'create_review_guidelines',
        description: 'Create review and test guidelines from code analysis. This tool validates the structure and stores the guidelines for sub-issue creation.',
        inputSchema: zodToJsonSchema(GuidelinesOutputSchema, { $refStrategy: 'none' })
      }
    ] as Tool[]
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'create_review_guidelines') {
    try {
      // Validate with Zod schema
      const guidelines = GuidelinesOutputSchema.parse(args);

      // Count non-empty sections
      const counts = {
        businessRules: guidelines.businessRules.length,
        reviewBusiness: guidelines.reviewGuidelines.businessRules.length,
        reviewImplementation: guidelines.reviewGuidelines.implementation.length,
        reviewAdditional: guidelines.reviewGuidelines.additional.length,
        testNewFeatureNormal: guidelines.testGuidelines.newFeature.normal.length,
        testNewFeatureEdge: guidelines.testGuidelines.newFeature.edgeCase.length,
        testNewFeatureError: guidelines.testGuidelines.newFeature.error.length,
        testRegressionNormal: guidelines.testGuidelines.regression.normal.length,
        testRegressionEdge: guidelines.testGuidelines.regression.edgeCase.length,
        testRegressionError: guidelines.testGuidelines.regression.error.length
      };

      const totalItems = Object.values(counts).reduce((sum, count) => sum + count, 0);

      // Build success message
      const messages: string[] = [];
      messages.push('✅ レビュー・テスト観点の作成に成功しました\n');
      messages.push(`合計: ${totalItems}件の観点を生成\n`);
      messages.push('\n【内訳】');
      messages.push(`- ビジネスルール: ${counts.businessRules}件`);
      messages.push(`- レビュー観点（ビジネスルール）: ${counts.reviewBusiness}件`);
      messages.push(`- レビュー観点（実装方針）: ${counts.reviewImplementation}件`);
      messages.push(`- レビュー観点（追加観点）: ${counts.reviewAdditional}件`);
      messages.push(`- テスト観点（新規機能）: ${counts.testNewFeatureNormal + counts.testNewFeatureEdge + counts.testNewFeatureError}件`);
      messages.push(`  - 正常系: ${counts.testNewFeatureNormal}件`);
      messages.push(`  - 境界値: ${counts.testNewFeatureEdge}件`);
      messages.push(`  - 異常系: ${counts.testNewFeatureError}件`);
      messages.push(`- テスト観点（デグレチェック）: ${counts.testRegressionNormal + counts.testRegressionEdge + counts.testRegressionError}件`);
      messages.push(`  - 正常系: ${counts.testRegressionNormal}件`);
      messages.push(`  - 境界値: ${counts.testRegressionEdge}件`);
      messages.push(`  - 異常系: ${counts.testRegressionError}件`);

      // Add absent reason summary
      const absentReasons: string[] = [];
      if (guidelines.businessRulesAbsentReason) {
        absentReasons.push(`ビジネスルール: ${guidelines.businessRulesAbsentReason}`);
      }
      if (guidelines.reviewGuidelines.businessRulesAbsentReason) {
        absentReasons.push(`レビュー観点（ビジネスルール）: ${guidelines.reviewGuidelines.businessRulesAbsentReason}`);
      }
      if (guidelines.reviewGuidelines.implementationAbsentReason) {
        absentReasons.push(`レビュー観点（実装方針）: ${guidelines.reviewGuidelines.implementationAbsentReason}`);
      }
      if (guidelines.reviewGuidelines.additionalAbsentReason) {
        absentReasons.push(`レビュー観点（追加観点）: ${guidelines.reviewGuidelines.additionalAbsentReason}`);
      }

      // 新規機能テスト観点
      if (guidelines.testGuidelines.newFeatureAbsentReason) {
        absentReasons.push(`テスト観点（新規機能）: ${guidelines.testGuidelines.newFeatureAbsentReason}`);
      } else {
        if (guidelines.testGuidelines.newFeature.normalAbsentReason) {
          absentReasons.push(`テスト観点（新規機能・正常系）: ${guidelines.testGuidelines.newFeature.normalAbsentReason}`);
        }
        if (guidelines.testGuidelines.newFeature.edgeCaseAbsentReason) {
          absentReasons.push(`テスト観点（新規機能・境界値）: ${guidelines.testGuidelines.newFeature.edgeCaseAbsentReason}`);
        }
        if (guidelines.testGuidelines.newFeature.errorAbsentReason) {
          absentReasons.push(`テスト観点（新規機能・異常系）: ${guidelines.testGuidelines.newFeature.errorAbsentReason}`);
        }
      }

      // デグレチェックテスト観点
      if (guidelines.testGuidelines.regressionAbsentReason) {
        absentReasons.push(`テスト観点（デグレチェック）: ${guidelines.testGuidelines.regressionAbsentReason}`);
      } else {
        if (guidelines.testGuidelines.regression.normalAbsentReason) {
          absentReasons.push(`テスト観点（デグレ・正常系）: ${guidelines.testGuidelines.regression.normalAbsentReason}`);
        }
        if (guidelines.testGuidelines.regression.edgeCaseAbsentReason) {
          absentReasons.push(`テスト観点（デグレ・境界値）: ${guidelines.testGuidelines.regression.edgeCaseAbsentReason}`);
        }
        if (guidelines.testGuidelines.regression.errorAbsentReason) {
          absentReasons.push(`テスト観点（デグレ・異常系）: ${guidelines.testGuidelines.regression.errorAbsentReason}`);
        }
      }

      if (absentReasons.length > 0) {
        messages.push('\n【該当なし理由】');
        absentReasons.forEach(reason => messages.push(`- ${reason}`));
      }

      messages.push('\n✅ バリデーション成功: サブIssue作成の準備が整いました');

      console.error('[MCP] Guidelines validated and stored');

      return {
        content: [
          {
            type: 'text',
            text: messages.join('\n')
          }
        ]
      };
    } catch (error) {
      console.error('[MCP] Failed to validate guidelines:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: 'text',
            text: `❌ レビュー・テスト観点の検証に失敗しました\n\nエラー: ${errorMessage}\n\nスキーマ定義を確認してください。`
          }
        ],
        isError: true
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Run server
async function main() {
  console.error('[MCP] Feature Review MCP Server starting...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP] Feature Review MCP Server ready');
}

main().catch(console.error);
