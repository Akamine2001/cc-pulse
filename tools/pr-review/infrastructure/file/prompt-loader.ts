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
 * @returns 展開済みプロンプト
 */
export function loadReviewPrompt(
  fileDiffs: FileDiff[],
  projectContext: string,
  reviewGuidelines: string
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
    .replace('{{DIFF_FILES_LIST}}', diffFilesList)
    .replace('{{PROJECT_CONTEXT}}', projectContext)
    .replace('{{REVIEW_GUIDELINES}}', reviewGuidelines);
}

/**
 * 前回コメント解決プロンプトを読み込んで展開
 *
 * @param fileDiffs ファイル単位の差分情報の配列
 * @param context プロジェクトコンテキスト
 * @returns 展開済みプロンプト
 */
export function loadResolveCommentPrompt(
  fileDiffs: FileDiff[],
  context: string
): string {
  const promptPath = join(__dirname, '../../prompts/resolve-comment-prompt.md');

  if (!existsSync(promptPath)) {
    throw new Error(`Resolve comment prompt file not found: ${promptPath}`);
  }

  const template = readFileSync(promptPath, 'utf-8');

  // ファイルリストを生成（review-prompt.mdと同じ形式）
  const diffFilesList = fileDiffs.map((fd, index) => {
    const sizeKb = (fd.size / 1024).toFixed(1);
    const isLockFile = fd.filePath.match(/lock|yarn\.lock|package-lock\.json/i);
    const sizeWarning = parseFloat(sizeKb) > 50 ? ` ⚠️ **大きなファイル (${sizeKb} KB)** - 必要な場合のみ読込` : '';
    const lockWarning = isLockFile ? ' 🔒 **lockファイル** - 通常はレビュー不要' : '';

    return `${index + 1}. **${fd.filePath}** (${sizeKb} KB)${sizeWarning}${lockWarning}\n   - 差分ファイルパス: \`${fd.tempFilePath}\``;
  }).join('\n\n');

  return template
    .replace('{{DIFF_FILES_LIST}}', diffFilesList)
    .replace('{{CONTEXT}}', context);
}
