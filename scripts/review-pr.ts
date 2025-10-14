#!/usr/bin/env bun

/**
 * cc-pulse: PR Auto-Review Script (Phase 1 - Basic Version)
 *
 * This script performs automated code review on Pull Requests using Claude API.
 * Phase 1: Basic review without Serena MCP integration
 * Phase 2: Will add Serena MCP for context-aware review
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { Octokit } from 'octokit';
import { readFileSync, existsSync } from 'fs';

// 環境変数の検証
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY is not set');
  console.error('Note: Set CLAUDE_CODE_OAUTH_TOKEN in GitHub Secrets and it will be passed as ANTHROPIC_API_KEY');
  process.exit(1);
}

if (!GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN is not set');
  process.exit(1);
}

if (!PR_NUMBER) {
  console.error('❌ PR_NUMBER is not set');
  process.exit(1);
}

if (!GITHUB_REPOSITORY) {
  console.error('❌ GITHUB_REPOSITORY is not set');
  process.exit(1);
}

// GitHub リポジトリ情報の解析
const [owner, repo] = GITHUB_REPOSITORY.split('/');

// クライアント初期化
// Anthropic SDKはデフォルトでANTHROPIC_API_KEY環境変数を自動参照
const anthropic = new Anthropic();
const octokit = new Octokit({ auth: GITHUB_TOKEN });

interface ReviewIssue {
  severity: 'high' | 'medium' | 'low';
  category: string;
  description: string;
  impact: string;
  suggestion: string;
}

interface ReviewResult {
  issues: ReviewIssue[];
  summary: string;
  totalIssues: number;
}

/**
 * PR差分を読み込む
 */
function readPRDiff(): string {
  const diffPath = 'pr-diff.txt';

  if (!existsSync(diffPath)) {
    throw new Error(`PR diff file not found: ${diffPath}`);
  }

  return readFileSync(diffPath, 'utf-8');
}

/**
 * プロジェクトコンテキストを読み込む（.serenaディレクトリから）
 */
function readProjectContext(): string {
  const serenaMemoriesPath = '.serena/memories/project_overview.md';

  if (existsSync(serenaMemoriesPath)) {
    console.log('✅ Found Serena project context');
    return readFileSync(serenaMemoriesPath, 'utf-8');
  }

  console.log('⚠️ No Serena context found, using basic project info');
  return 'No additional project context available.';
}

/**
 * Claudeでコードレビューを実施
 */
async function performReview(diff: string, context: string): Promise<ReviewResult> {
  console.log('🤖 Starting Claude code review...');

  const prompt = `あなたはcc-pulseプロジェクトのコードレビュアーです。以下のPull Requestの差分をレビューしてください。

# プロジェクトコンテキスト
${context}

# PR差分
\`\`\`diff
${diff}
\`\`\`

# レビュー観点
以下の観点で問題点を指摘してください：
1. **デグレーションの可能性**: 既存機能への悪影響
2. **パフォーマンス**: 実行速度やメモリ使用量への影響
3. **セキュリティ**: API KEY漏洩、インジェクション脆弱性など
4. **コーディング規約**: CLAUDE.mdの規約遵守
5. **型安全性**: TypeScriptの型定義の適切性

# 出力形式
以下のJSON形式で出力してください：

\`\`\`json
{
  "issues": [
    {
      "severity": "high" | "medium" | "low",
      "category": "デグレーション" | "パフォーマンス" | "セキュリティ" | "コーディング規約" | "型安全性",
      "description": "問題の説明",
      "impact": "影響範囲",
      "suggestion": "推奨対応"
    }
  ],
  "summary": "全体的な評価とコメント"
}
\`\`\`

問題がない場合は、issuesを空配列にしてください。`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response format from Claude');
    }

    // JSONを抽出（```json ... ``` のブロックから）
    const jsonMatch = content.text.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      console.error('❌ Failed to parse Claude response');
      console.error('Response:', content.text);
      throw new Error('Invalid response format from Claude');
    }

    const reviewData = JSON.parse(jsonMatch[1]);

    return {
      issues: reviewData.issues || [],
      summary: reviewData.summary || '',
      totalIssues: (reviewData.issues || []).length,
    };
  } catch (error) {
    console.error('❌ Claude API error:', error);
    throw error;
  }
}

/**
 * GitHubにレビューサマリーを投稿
 */
async function postReviewSummary(result: ReviewResult): Promise<void> {
  const highCount = result.issues.filter((i) => i.severity === 'high').length;
  const mediumCount = result.issues.filter((i) => i.severity === 'medium').length;
  const lowCount = result.issues.filter((i) => i.severity === 'low').length;

  const issuesByCategory = result.issues.reduce((acc, issue) => {
    if (!acc[issue.category]) {
      acc[issue.category] = [];
    }
    acc[issue.category].push(issue);
    return acc;
  }, {} as Record<string, ReviewIssue[]>);

  let detailsMarkdown = '';
  for (const [category, issues] of Object.entries(issuesByCategory)) {
    detailsMarkdown += `\n### ${category}\n\n`;
    for (const issue of issues) {
      const emoji = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
      detailsMarkdown += `${emoji} **${issue.severity === 'high' ? '重要' : issue.severity === 'medium' ? '中程度' : '軽微'}**: ${issue.description}\n`;
      detailsMarkdown += `- **影響**: ${issue.impact}\n`;
      detailsMarkdown += `- **推奨対応**: ${issue.suggestion}\n\n`;
    }
  }

  const body = `## 🤖 自動コードレビュー結果

### 📊 検出された問題
- 🔴 重要: ${highCount}件
- 🟡 中程度: ${mediumCount}件
- 🟢 軽微: ${lowCount}件

${result.totalIssues > 0 ? detailsMarkdown : '_問題は検出されませんでした_'}

### 📝 総評
${result.summary}

---
_このレビューはClaude API${existsSync('.serena/memories/project_overview.md') ? 'とSerenaプロジェクトコンテキスト' : ''}を使用して生成されました_`;

  try {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: parseInt(PR_NUMBER!),
      body,
    });

    console.log('✅ Posted review summary to GitHub');
  } catch (error) {
    console.error('❌ Failed to post comment to GitHub:', error);
    throw error;
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log('🚀 cc-pulse PR Auto-Review (Phase 1)');
  console.log(`📋 Repository: ${GITHUB_REPOSITORY}`);
  console.log(`🔢 PR Number: ${PR_NUMBER}`);
  console.log('');

  try {
    // 1. PR差分を読み込む
    console.log('📖 Reading PR diff...');
    const diff = readPRDiff();
    console.log(`✅ Loaded ${diff.split('\n').length} lines of diff`);

    // 2. プロジェクトコンテキストを読み込む
    console.log('📖 Reading project context...');
    const context = readProjectContext();

    // 3. Claudeでレビュー実施
    const reviewResult = await performReview(diff, context);
    console.log(`✅ Review completed: ${reviewResult.totalIssues} issues found`);

    // 4. GitHubにサマリーを投稿
    console.log('💬 Posting review summary to GitHub...');
    await postReviewSummary(reviewResult);

    console.log('');
    console.log('✅ Review process completed successfully!');

    // 重大な問題がある場合は終了コード1を返す
    const hasCriticalIssues = reviewResult.issues.some((i) => i.severity === 'high');
    if (hasCriticalIssues) {
      console.log('⚠️ Critical issues found, exiting with code 1');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Review process failed:', error);

    // エラー時はGitHubにコメント投稿を試みる
    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: parseInt(PR_NUMBER!),
        body: `⚠️ 自動レビューでエラーが発生しました。\n\n\`\`\`\n${error}\n\`\`\``,
      });
    } catch (commentError) {
      console.error('❌ Failed to post error comment:', commentError);
    }

    process.exit(1);
  }
}

main();
