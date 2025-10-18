/**
 * Conversation Collector
 *
 * 既存のConversation（レビューコメント）を収集してプロンプト用にフォーマット
 */

import type { Octokit } from 'octokit';
import { DiffParser } from '../shared/diff-parser';
import { BOT_SIGNATURE } from '../shared/constants';

export interface ExistingConversation {
  filePath: string;
  line: number;
  category: string;
  severity: string;
  description: string;
}

/**
 * 既存のConversation内容を収集
 *
 * @param octokit Octokitインスタンス
 * @param owner リポジトリオーナー
 * @param repo リポジトリ名
 * @param prNumber PR番号
 * @returns 既存Conversationのリスト
 */
export async function collectExistingConversations(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<ExistingConversation[]> {
  const previousComments = await octokit.rest.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber
  });

  // 自動レビューのコメントのみ抽出
  const autoReviewComments = previousComments.data.filter(
    c => c.body.includes(BOT_SIGNATURE)
  );

  if (autoReviewComments.length === 0) {
    return [];
  }

  console.log(`📋 Found ${autoReviewComments.length} existing conversations`);

  const parser = new DiffParser();
  const conversations: ExistingConversation[] = [];

  for (const comment of autoReviewComments) {
    const issueData = parser.extractIssueFromComment(comment.body);
    if (issueData) {
      conversations.push({
        filePath: comment.path,
        line: comment.line || 0,
        category: issueData.category,
        severity: issueData.severity,
        description: issueData.description
      });
    }
  }

  return conversations;
}

/**
 * 既存Conversationをプロンプト用にフォーマット
 *
 * @param conversations 既存Conversationのリスト
 * @returns プロンプトに含める文字列
 */
export function formatConversationsForPrompt(conversations: ExistingConversation[]): string {
  if (conversations.length === 0) {
    return '';
  }

  const formatted = conversations.map((conv, idx) => {
    return `${idx + 1}. **[${conv.severity}] ${conv.category}** (${conv.filePath}:${conv.line})
   - ${conv.description}`;
  }).join('\n');

  return `
# 既に指摘済みの問題（重複指摘を避けるため）

以下の問題は既に前回のレビューで指摘済みです。**これらと同じ内容の指摘は避けてください**。

${formatted}

**注意**: 上記以外の新しい問題があれば、遠慮なく指摘してください。
`;
}
