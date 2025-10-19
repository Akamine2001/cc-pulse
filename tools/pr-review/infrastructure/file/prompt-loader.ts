/**
 * Prompt Loader
 *
 * プロンプトMDファイルの読み込みとテンプレート展開
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { FileDiff } from './diff-file-manager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * レビュープロンプトを読み込んで展開
 *
 * @param fileDiffs ファイル単位の差分情報の配列
 * @param projectContext プロジェクトコンテキスト
 * @param reviewGuidelines レビュー観点
 * @param existingConversations 既存Conversation
 * @param commentsJson コメントのJSON文字列
 * @returns 展開済みプロンプト
 */
export function loadReviewPrompt(
  fileDiffs: FileDiff[],
  projectContext: string,
  reviewGuidelines: string,
  existingConversations: string,
  commentsJson: string
): string {
  const promptPath = join(__dirname, '../../prompts/review-prompt.md');

  if (!existsSync(promptPath)) {
    throw new Error(`Review prompt file not found: ${promptPath}`);
  }

  const template = readFileSync(promptPath, 'utf-8');

  // ファイルリストを生成
  const diffFilesList = fileDiffs.map((fd, index) => {
    const sizeKb = (fd.size / 1024).toFixed(1);
    const isLockFile = fd.filePath.match(/lock|yarn\.lock|package-lock\.json/i);
    const sizeWarning = parseFloat(sizeKb) > 50 ? ` ⚠️ **大きなファイル (${sizeKb} KB)** - 必要な場合のみ読込` : '';
    const lockWarning = isLockFile ? ' 🔒 **lockファイル** - 通常はレビュー不要' : '';

    return `${index + 1}. **${fd.filePath}** (${sizeKb} KB)${sizeWarning}${lockWarning}\n   - パス: \`${fd.tempFilePath}\``;
  }).join('\n\n');

  return template
    .replace('{{COMMENTS_JSON}}', commentsJson)
    .replace('{{DIFF_FILES_LIST}}', diffFilesList)
    .replace('{{PROJECT_CONTEXT}}', projectContext)
    .replace('{{REVIEW_GUIDELINES}}', reviewGuidelines)
    .replace('{{EXISTING_CONVERSATIONS}}', existingConversations);
}

/**
 * Conversation差分分析プロンプトを読み込んで展開
 *
 * @param context プロジェクトコンテキスト
 * @param category カテゴリ
 * @param severity 重要度
 * @param description 説明
 * @param suggestion 推奨対応
 * @param fileDiff ファイル差分
 * @returns 展開済みプロンプト
 */
export function loadConversationDiffAnalysisPrompt(
  context: string,
  category: string,
  severity: string,
  description: string,
  suggestion: string,
  fileDiff: string
): string {
  const promptPath = join(__dirname, '../../prompts/conversation-diff-analysis-prompt.md');

  if (!existsSync(promptPath)) {
    throw new Error(`Conversation diff analysis prompt file not found: ${promptPath}`);
  }

  const template = readFileSync(promptPath, 'utf-8');

  return template
    .replace('{{CONTEXT}}', context)
    .replace('{{CATEGORY}}', category)
    .replace('{{SEVERITY}}', severity)
    .replace('{{DESCRIPTION}}', description)
    .replace('{{SUGGESTION}}', suggestion)
    .replace('{{FILE_DIFF}}', fileDiff);
}
