/**
 * Diff File Manager
 *
 * PR差分を一時ファイルに保存・管理するユーティリティ
 */

import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * 一時ディレクトリのベースパス
 */
const TMP_DIR = join(tmpdir(), 'pr-review');

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
