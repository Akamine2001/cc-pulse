/**
 * Diff Reader
 *
 * PR差分の読み込みを担当
 */

import { readFileSync, existsSync } from 'fs';

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
