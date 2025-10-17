import { readFileSync } from 'fs';

/**
 * PR差分から該当箇所のコードを取得
 */
export class DiffParser {
  private readonly MAX_SNIPPET_LINES = 30; // コメントに含める最大行数
  private readonly SNIPPET_HEAD_LINES = 10; // スニペット省略時の先頭行数
  private readonly SNIPPET_TAIL_LINES = 10; // スニペット省略時の末尾行数
  private readonly CONTEXT_LINES = 5; // コンテキスト行数

  /**
   * コメント用のコードスニペットを整形（長い場合は省略）
   */
  formatCodeSnippet(
    filePath: string,
    lineStart: number,
    lineEnd: number
  ): string {
    const totalLines = lineEnd - lineStart + 1;

    if (totalLines <= this.MAX_SNIPPET_LINES) {
      // 全行表示
      return this.getCodeLines(filePath, lineStart, lineEnd);
    } else {
      // 先頭部分 + ... + 末尾部分
      const headLines = this.SNIPPET_HEAD_LINES;
      const tailLines = this.SNIPPET_TAIL_LINES;
      const head = this.getCodeLines(filePath, lineStart, lineStart + headLines - 1);
      const tail = this.getCodeLines(filePath, lineEnd - tailLines + 1, lineEnd);
      const omitted = totalLines - headLines - tailLines;

      return `${head}\n...\n... (${omitted} lines omitted) ...\n...\n${tail}`;
    }
  }

  /**
   * 指定範囲のコードを行番号付きで取得
   */
  private getCodeLines(
    filePath: string,
    lineStart: number,
    lineEnd: number
  ): string {
    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n');

      const codeLines = lines.slice(lineStart - 1, lineEnd);

      return codeLines
        .map((line, index) => {
          const lineNumber = lineStart + index;
          return `${lineNumber.toString().padStart(4)}: ${line}`;
        })
        .join('\n');
    } catch (error) {
      console.error(`❌ Failed to read file ${filePath}`);
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
        console.error(`   Error code: ${(error as any).code}`);
      } else {
        console.error(`   Error:`, error);
      }
      return `[ファイル読み込みエラー: ${filePath}]`;
    }
  }

  /**
   * 指定されたファイル・行範囲の現在のコードを取得
   */
  async getCurrentCode(
    filePath: string,
    lineStart: number,
    lineEnd: number,
    contextLines: number = this.CONTEXT_LINES
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
      console.error(`❌ Failed to read file ${filePath}`);
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
        console.error(`   Error code: ${(error as any).code}`);
      } else {
        console.error(`   Error:`, error);
      }
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
    if (!match || !match[1] || !match[2] || !match[3]) {
      return null;
    }

    const severityLabel = match[1];
    const category = match[2];
    const description = match[3];

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

  /**
   * コメント本文から該当コードスニペットを抽出
   */
  extractCodeSnippetFromComment(commentBody: string): string | null {
    // コメント形式の例:
    // **該当コード**:
    // ```typescript
    // 100: const apiKey = "hardcoded-key";
    // ```

    const match = commentBody.match(/\*\*該当コード\*\*:\s*```(?:typescript|javascript|python|)?\s*\n([\s\S]*?)```/);
    if (!match || !match[1]) {
      return null;
    }

    return match[1].trim();
  }
}
