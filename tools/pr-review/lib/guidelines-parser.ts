/**
 * レビュー観点のMarkdown→JSON変換
 */

import type { GuidelinesFile, Guideline, VerificationType, CheckMethod } from '../shared/guidelines-types';

/**
 * Markdown形式のレビュー観点をJSON形式に変換
 *
 * @param markdownContent Markdown形式の観点
 * @param prNumber PR番号
 * @returns JSON形式の観点
 */
export function parseGuidelinesMarkdown(
  markdownContent: string,
  prNumber: number
): GuidelinesFile {
  const guidelines: Guideline[] = [];
  let guidelineId = 1;

  // 基底観点の説明を抽出
  const baseDescriptionMatch = markdownContent.match(/# 基底レビュー観点\s+([\s\S]*?)(?=\n## |$)/);
  const baseDescription = baseDescriptionMatch ? baseDescriptionMatch[1].trim() : '';

  // チェックリスト形式の観点を抽出: - [ ] ... の形式
  const checklistPattern = /- \[ \] (.+?)(?:\n  - (.+?))*(?=\n- \[ \]|\n\n###|\n###|$)/gs;
  const matches = markdownContent.matchAll(checklistPattern);

  for (const match of matches) {
    const rule = match[1].trim();
    const details = match[2] || '';

    // ファイル名を抽出
    const fileMatch = rule.match(/([A-Za-z0-9._-]+\.ts)/);
    const file = fileMatch ? fileMatch[1] : 'unknown';

    // カテゴリを判定（セクション見出しから）
    let category = 'その他';
    const beforeMatch = markdownContent.substring(0, match.index);
    // 全ての###見出しを取得して最後のものを使用（チェックリスト直前の見出し）
    const categoryMatches = Array.from(beforeMatch.matchAll(/###\s+(.+?)$/gm));
    if (categoryMatches.length > 0) {
      const lastMatch = categoryMatches[categoryMatches.length - 1]!;
      category = lastMatch[1]!.trim();
    }

    // 検証タイプを判定
    let verificationType: VerificationType = 'diff_check';
    let checkMethod: CheckMethod = 'diff';
    let targetPath: string | undefined;
    let expectedPattern: string | undefined;

    // detailsから参考情報を抽出
    const referenceMatch = details.match(/参考:\s*(.+?)(?:\n|$)/);
    const reference = referenceMatch ? referenceMatch[1].trim() : undefined;

    // 理由を抽出
    const reasonMatch = details.match(/理由:\s*(.+?)(?:\n|$)/);
    const reason = reasonMatch ? reasonMatch[1].trim() : '';

    // ファイル名からtarget_pathを推測
    if (reference && reference.includes('.ts:')) {
      const pathMatch = reference.match(/([a-zA-Z0-9/_-]+\.ts)/);
      if (pathMatch) {
        targetPath = pathMatch[1];
      }
    }

    // verification_typeの判定
    // PR差分に現れない可能性のある修正を確認する観点は codebase_check
    const isCodebaseCheck =
      rule.includes('変更されているか') ||
      rule.includes('削除され') ||
      rule.includes('追加されているか') ||
      rule.includes('維持されているか') ||
      rule.includes('解決されているか');

    if (isCodebaseCheck) {
      verificationType = 'codebase_check';
      checkMethod = 'mcp__serena__read_file';

      // 期待されるパターンを推測
      if (rule.includes('Record<string, McpServerConfig>')) {
        expectedPattern = 'mcpServers.*Record<string,\\s*McpServerConfig>';
      } else if (rule.includes('SDKMessage') && rule.includes('import')) {
        expectedPattern = 'import.*SDKMessage';
      } else if (rule.includes('削除され')) {
        // 削除の確認は否定パターン（該当文字列が存在しないことを確認）
        if (rule.includes('StreamMessage')) {
          expectedPattern = 'NOT:StreamMessage';
        } else if (rule.includes('StdioMcpServer')) {
          expectedPattern = 'NOT:StdioMcpServer';
        } else if (rule.includes('ContentBlock')) {
          expectedPattern = 'NOT:(ContentBlock|TextBlock|ToolUseBlock|ToolResultBlock)';
        }
      } else if (rule.includes('AsyncIterable<SDKMessage>')) {
        expectedPattern = 'AsyncIterable<SDKMessage>';
      } else if (rule.includes('message?.type')) {
        expectedPattern = 'message\\?\\.type.*===.*[\'"]assistant[\'"]';
      } else if (rule.includes('block.type')) {
        expectedPattern = 'block\\.type.*===.*(tool_use|text)';
      }
    }

    guidelines.push({
      id: guidelineId++,
      category,
      file,
      verification_type: verificationType,
      rule,
      check_method: checkMethod,
      target_path: targetPath,
      expected_pattern: expectedPattern,
      reference,
      reason,
      checked: false,
      applicable: undefined,
    });
  }

  return {
    pr_number: prNumber,
    base_description: baseDescription,
    guidelines,
  };
}
