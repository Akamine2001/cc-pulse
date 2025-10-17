/**
 * Context Reader
 *
 * プロジェクトコンテキストの読み込みを担当
 */

import { readFileSync, existsSync } from 'fs';

/**
 * プロジェクトコンテキストを読み込む（.serenaディレクトリから）
 *
 * @param contextPath Serenaコンテキストのパス（デフォルト: .serena/memories/project_overview.md）
 * @returns プロジェクトコンテキストの内容
 */
export function readProjectContext(
  contextPath: string = '.serena/memories/project_overview.md'
): string {
  if (existsSync(contextPath)) {
    console.log('✅ Found Serena project context');
    return readFileSync(contextPath, 'utf-8');
  }

  console.log('⚠️ No Serena context found, using basic project info');
  return 'No additional project context available.';
}
