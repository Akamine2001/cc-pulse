import type { ReviewResult, ReviewIssue, ReviewSeverity } from './schemas';
import { BOT_SIGNATURE, AI_AGENT_MENTION } from './constants';

/**
 * 重要度別の絵文字を取得
 */
function getSeverityEmoji(severity: ReviewSeverity): string {
  const emojiMap: Record<ReviewSeverity, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢'
  };
  return emojiMap[severity];
}

/**
 * 重要度別の日本語ラベルを取得
 */
function getSeverityLabel(severity: ReviewSeverity): string {
  const labelMap: Record<ReviewSeverity, string> = {
    critical: '重大',
    high: '重要',
    medium: '中程度',
    low: '軽微'
  };
  return labelMap[severity];
}

/**
 * 問題をMarkdown形式でフォーマット
 */
function formatIssue(issue: ReviewIssue): string {
  const emoji = getSeverityEmoji(issue.severity);
  const label = getSeverityLabel(issue.severity);

  let markdown = `${emoji} **[${label}] ${issue.category}**: ${issue.description}\n`;

  if (issue.file_path) {
    markdown += `  - **ファイル**: \`${issue.file_path}\``;
    if (issue.line_range) {
      markdown += ` (L${issue.line_range.start}-${issue.line_range.end})`;
    }
    markdown += '\n';
  }

  markdown += `  - **影響**: ${issue.impact}\n`;
  markdown += `  - **推奨対応**: ${issue.suggestion}\n`;

  // 根拠がある場合は追加
  if (issue.evidence && issue.evidence.length > 0) {
    markdown += '\n**根拠**:\n';
    issue.evidence.forEach((ev, index) => {
      markdown += `${index + 1}. \`${ev.file}:${ev.line}\` - ${ev.description}\n`;
      if (ev.code_snippet) {
        markdown += `\`\`\`typescript\n${ev.code_snippet}\n\`\`\`\n`;
      }
    });
  }

  return markdown;
}

/**
 * 個別の問題をインラインコメント用にフォーマット
 */
export function formatIssueAsInlineComment(issue: ReviewIssue, codeSnippet?: string): string {
  const emoji = getSeverityEmoji(issue.severity);
  const label = getSeverityLabel(issue.severity);

  // AIエージェントメンション（constants.tsに設定されている場合のみ追加）
  let markdown = '';
  if (AI_AGENT_MENTION) {
    markdown = `@${AI_AGENT_MENTION}\n\n`;
  }

  markdown += `${emoji} **[${label}] ${issue.category}**: ${issue.description}\n`;

  // コードスニペットがある場合は含める
  if (codeSnippet) {
    markdown += `\n**該当コード**:\n\`\`\`typescript\n${codeSnippet}\n\`\`\`\n`;
  }

  markdown += `\n**影響**: ${issue.impact}`;
  markdown += `\n**推奨対応**: ${issue.suggestion}`;

  // 根拠がある場合は追加
  if (issue.evidence && issue.evidence.length > 0) {
    markdown += '\n\n**根拠**:\n';
    issue.evidence.forEach((ev, index) => {
      markdown += `${index + 1}. \`${ev.file}:${ev.line}\` - ${ev.description}\n`;
      if (ev.code_snippet) {
        markdown += `\`\`\`typescript\n${ev.code_snippet}\n\`\`\`\n`;
      }
    });
  }

  markdown += `\n\n_- ${BOT_SIGNATURE}_`;

  return markdown;
}

/**
 * レビュー結果をMarkdown形式でフォーマット
 */
export function formatReviewAsMarkdown(result: ReviewResult): string {
  let markdown = '## 📊 検出された問題\n\n';

  // 統計サマリー
  markdown += `- 🔴 重大: ${result.stats.critical}件\n`;
  markdown += `- 🟠 重要: ${result.stats.high}件\n`;
  markdown += `- 🟡 中程度: ${result.stats.medium}件\n`;
  markdown += `- 🟢 軽微: ${result.stats.low}件\n\n`;

  if (result.issues.length === 0) {
    markdown += '_問題は検出されませんでした_ ✨\n\n';
  } else {
    // 重要度別にグループ化
    const issuesBySeverity = {
      critical: result.issues.filter(i => i.severity === 'critical'),
      high: result.issues.filter(i => i.severity === 'high'),
      medium: result.issues.filter(i => i.severity === 'medium'),
      low: result.issues.filter(i => i.severity === 'low')
    };

    // 重大から順に表示
    for (const [severity, issues] of Object.entries(issuesBySeverity)) {
      if (issues.length > 0) {
        const emoji = getSeverityEmoji(severity as ReviewSeverity);
        const label = getSeverityLabel(severity as ReviewSeverity);
        markdown += `### ${emoji} ${label} (${issues.length}件)\n\n`;

        for (const issue of issues) {
          markdown += formatIssue(issue) + '\n';
        }
      }
    }
  }

  // 総評
  markdown += `## 📝 総評\n\n${result.summary}\n`;

  return markdown;
}
