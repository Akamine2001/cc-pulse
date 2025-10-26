/**
 * File I/O Operations
 *
 * ファイル操作を集約（DiffReader + ContextReader + GuidelinesReader + PromptLoader + DiffFileManager）
 */

import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Diff Reader
// ============================================================================

/**
 * PR差分ファイルを読み込む
 *
 * @param diffPath 差分ファイルのパス（デフォルト: pr-diff.txt）
 * @returns PR差分の内容
 * @throws ファイルが存在しない場合
 */
export function readPRDiff(diffPath: string = 'pr-diff.txt'): string {
  if (!existsSync(diffPath)) {
    throw new Error(`PR diff file not found: ${diffPath}`);
  }

  return readFileSync(diffPath, 'utf-8');
}

// ============================================================================
// Guidelines Reader
// ============================================================================

/**
 * レビュー観点を読み込む
 *
 * 構成:
 * - 基底観点（base-review-guidelines.md）を常に含める
 * - 動的観点（サブIssueから取得）または静的観点（review-guidelines.md）を追加
 *
 * @param dynamicGuidelines 動的に取得したレビュー観点（オプション）
 * @returns レビュー観点の内容
 */
export function readReviewGuidelines(dynamicGuidelines?: string | null): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));

  // 1. 基底観点を読み込み（常に含める）
  const baseGuidelinesPath = join(currentDir, '../base-review-guidelines.md');
  if (!existsSync(baseGuidelinesPath)) {
    throw new Error(
      `base-review-guidelines.md not found at ${baseGuidelinesPath}.\n` +
        'This file is required for all PR reviews.'
    );
  }
  const baseGuidelines = readFileSync(baseGuidelinesPath, 'utf-8');

  // 2. 動的観点または静的観点を追加
  let additionalGuidelines: string;

  if (dynamicGuidelines) {
    // 動的観点が取得できた場合
    console.log('✅ Using base + dynamic review guidelines from related issue');
    additionalGuidelines = dynamicGuidelines;
  } else {
    // 静的ファイルから読み込み
    const guidelinesPath = join(currentDir, '../review-guidelines.md');
    if (!existsSync(guidelinesPath)) {
      throw new Error(
        `review-guidelines.md not found at ${guidelinesPath}.\n` +
          'Please create this file or ensure a related issue with review guidelines exists.'
      );
    }
    console.log('✅ Using base + static review guidelines from review-guidelines.md');
    additionalGuidelines = readFileSync(guidelinesPath, 'utf-8');
  }

  // 3. 基底観点 + 追加観点を結合
  return `${baseGuidelines}\n\n---\n\n${additionalGuidelines}`;
}

// ============================================================================
// Prompt Loader
// ============================================================================

/**
 * ファイル単位の差分情報
 */
export interface FileDiff {
  /** ファイルパス */
  filePath: string;
  /** 差分内容 */
  diff: string;
  /** 差分サイズ（文字数） */
  size: number;
  /** 一時ファイルのパス */
  tempFilePath: string;
}

/**
 * レビュープロンプトを読み込んで展開
 *
 * @param fileDiffs ファイル単位の差分情報の配列
 * @param reviewGuidelines レビュー観点
 * @returns 展開済みプロンプト
 */
export function loadReviewPrompt(
  fileDiffs: FileDiff[],
  reviewGuidelines: string
): string {
  const promptPath = join(__dirname, '../prompts/review-prompt.md');

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
    .replace('{{REVIEW_GUIDELINES}}', reviewGuidelines);
}

/**
 * 前回コメント解決プロンプトを読み込んで展開
 *
 * @param fileDiffs ファイル単位の差分情報の配列
 * @returns 展開済みプロンプト
 */
export function loadResolveCommentPrompt(
  fileDiffs: FileDiff[]
): string {
  const promptPath = join(__dirname, '../prompts/resolve-comment-prompt.md');

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
    .replace('{{DIFF_FILES_LIST}}', diffFilesList);
}

// ============================================================================
// Diff File Manager
// ============================================================================

/**
 * 一時ディレクトリのベースパス
 */
const TMP_DIR = join(tmpdir(), 'pr-review');

/**
 * PR差分を一時ファイルに保存
 *
 * @param diff PR差分の内容
 * @returns 保存されたファイルの絶対パス
 */
export function saveDiffToTempFile(diff: string): string {
  // 一時ディレクトリを作成（存在しない場合）
  if (!existsSync(TMP_DIR)) {
    mkdirSync(TMP_DIR, { recursive: true });
  }

  // タイムスタンプを使用してユニークなファイル名を生成
  const timestamp = Date.now();
  const diffPath = join(TMP_DIR, `diff-${timestamp}.txt`);

  // 差分をファイルに書き込み
  writeFileSync(diffPath, diff, 'utf-8');

  console.log(`📝 Saved diff to temp file: ${diffPath} (${diff.length} chars)`);

  return diffPath;
}

/**
 * 一時ファイルを削除
 *
 * @param diffPath 削除する一時ファイルのパス
 */
export function deleteTempDiffFile(diffPath: string): void {
  try {
    if (existsSync(diffPath)) {
      unlinkSync(diffPath);
      console.log(`🗑️  Deleted temp diff file: ${diffPath}`);
    }
  } catch (error) {
    console.warn(`⚠️  Failed to delete temp diff file: ${diffPath}`, error);
  }
}

/**
 * PR差分をファイル単位で分割して一時ファイルに保存
 *
 * @param diff PR差分の内容（全体）
 * @returns ファイル単位の差分情報の配列
 */
export function saveDiffByFiles(diff: string): FileDiff[] {
  // 一時ディレクトリを作成（存在しない場合）
  if (!existsSync(TMP_DIR)) {
    mkdirSync(TMP_DIR, { recursive: true });
  }

  const timestamp = Date.now();
  const fileDiffs: FileDiff[] = [];

  // diff形式: "diff --git a/file/path b/file/path" で始まる
  const fileBlocks = diff.split(/(?=^diff --git)/m);

  fileBlocks.forEach((block, index) => {
    if (!block.trim()) return;

    // ファイルパスを抽出
    const match = block.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
    if (!match) return;

    const filePath = match[2]; // b側のパス（新しい方）
    if (!filePath) {
      console.error(`[WARN] Could not extract file path from diff block ${index}`);
      return;
    }

    const size = block.length;

    // 一時ファイルに保存
    const sanitizedPath = filePath.replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempFilePath = join(TMP_DIR, `${timestamp}-${index}-${sanitizedPath}.diff`);
    writeFileSync(tempFilePath, block, 'utf-8');

    fileDiffs.push({
      filePath,
      diff: block,
      size,
      tempFilePath
    });
  });

  console.log(`📝 Saved ${fileDiffs.length} file diffs to temp directory`);
  fileDiffs.forEach((fd) => {
    const sizeKb = (fd.size / 1024).toFixed(1);
    console.log(`   - ${fd.filePath} (${sizeKb} KB)`);
  });

  return fileDiffs;
}

/**
 * ファイル差分の一時ファイルを全て削除
 *
 * @param fileDiffs 削除する差分情報の配列
 */
export function deleteTempDiffFiles(fileDiffs: FileDiff[]): void {
  fileDiffs.forEach((fd) => {
    deleteTempDiffFile(fd.tempFilePath);
  });
}
