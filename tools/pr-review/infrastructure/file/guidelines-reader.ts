/**
 * Guidelines Reader
 *
 * レビュー観点ファイル（review-guidelines.md）の読み込み
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * review-guidelines.mdを読み込む
 *
 * @returns レビュー観点の内容
 */
export function readReviewGuidelines(): string {
  // tools/pr-review/review-guidelines.md のパスを解決
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const guidelinesPath = join(currentDir, '../../review-guidelines.md');

  if (!existsSync(guidelinesPath)) {
    console.warn('⚠️ review-guidelines.md not found, using default guidelines');
    return getDefaultGuidelines();
  }

  console.log('✅ Loaded review guidelines from review-guidelines.md');
  return readFileSync(guidelinesPath, 'utf-8');
}

/**
 * デフォルトのレビュー観点（ファイルが見つからない場合）
 */
function getDefaultGuidelines(): string {
  return `# デフォルトレビュー観点

1. **デグレーション**: 既存機能への悪影響
2. **パフォーマンス**: 実行速度やメモリ使用量への影響
3. **セキュリティ**: API KEY漏洩、インジェクション脆弱性など
4. **コーディング規約**: CLAUDE.mdの規約遵守
5. **型安全性**: TypeScriptの型定義の適切性
`;
}
