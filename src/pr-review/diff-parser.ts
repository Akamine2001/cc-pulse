import { readFileSync } from 'fs';

/**
 * PR差分から該当箇所のコードを取得
 */
export class DiffParser {
  /**
   * 指定されたファイル・行範囲の現在のコードを取得
   */
  async getCurrentCode(
    filePath: string,
    lineStart: number,
    lineEnd: number,
    contextLines: number = 5
  ): Promise<string> {
    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n');

      // コンテキストを含めた範囲を取得（前後5行ずつ）
      const start = Math.max(0, lineStart - 1 - contextLines);
      const end = Math.min(lines.length, lineEnd + contextLines);

      const codeLines = lines.slice(start, end);

      // 行番号付きで返す
      return codeLines
        .map((line, index) => {
          const lineNumber = start + index + 1;
          const marker = lineNumber >= lineStart && lineNumber <= lineEnd ? '→' : ' ';
          return `${lineNumber.toString().padStart(4)}${marker} ${line}`;
        })
        .join('\n');
    } catch (error) {
      console.error(`❌ Failed to read file ${filePath}:`, error);
      return `[ファイル読み込みエラー: ${filePath}]`;
    }
  }

  /**
   * コメント本文から前回の問題情報を抽出
   */
  extractIssueFromComment(commentBody: string): {
    description: string;
    category: string;
    severity: string;
  } | null {
    // コメント形式の例:
    // 🔴 **[重大] セキュリティ**: API KEYがハードコードされています
    // - **影響**: ...
    // - **推奨対応**: ...

    const match = commentBody.match(/[🔴🟠🟡🟢]\s*\*\*\[(.+?)\]\s*(.+?)\*\*:\s*(.+?)(?:\n|$)/);
    if (!match) {
      return null;
    }

    const [, severityLabel, category, description] = match;

    // 日本語ラベル → 英語severity
    const severityMap: Record<string, string> = {
      '重大': 'critical',
      '重要': 'high',
      '中程度': 'medium',
      '軽微': 'low'
    };

    return {
      description: description.trim(),
      category: category.trim(),
      severity: severityMap[severityLabel] || 'medium'
    };
  }
}
