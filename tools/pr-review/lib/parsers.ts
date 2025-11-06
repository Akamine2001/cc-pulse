/**
 * Parsing Operations
 *
 * パース・変換処理を集約（DiffParser + ConversationCollector）
 */

import { readFileSync, existsSync } from 'fs';
import type { Octokit } from 'octokit';
import { BOT_SIGNATURE } from '../../shared/constants';
import type { ReviewComment } from '../shared/schemas';

// ============================================================================
// Diff Parser
// ============================================================================

/**
 * PR差分から該当箇所のコードを取得
 */
export class DiffParser {
  private readonly MAX_SNIPPET_LINES = 30; // コメントに含める最大行数
  private readonly SNIPPET_HEAD_LINES = 10; // スニペット省略時の先頭行数
  private readonly SNIPPET_TAIL_LINES = 10; // スニペット省略時の末尾行数
  private readonly CONTEXT_LINES = 5; // コンテキスト行数
  private diff: string = '';

  /**
   * @param diff PRの差分（`git diff` の出力）
   */
  constructor(diff: string = '') {
    this.diff = diff;
  }

  /**
   * PR差分から変更されたファイルパスのリストを抽出
   * @returns ファイルパスの配列 (e.g., ["src/core/agent.ts"])
   */
  getModifiedFiles(): string[] {
    if (!this.diff) {
      return [];
    }
    const files = new Set<string>();
    const lines = this.diff.split('\n');
    for (const line of lines) {
      const match = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
      if (match) {
        const filePath = match[2]; // b側のパス（新しい方）
        if (filePath !== '/dev/null') {
          files.add(filePath);
        } else {
          // ファイルが削除された場合 (b/ が /dev/null)、a/ のパスを使用
          files.add(match[1]);
        }
      }
    }
    return Array.from(files);
  }

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
      // ファイルが存在しない場合、削除されたファイルか実装エラーかを区別
      if (error instanceof Error && (error as any).code === 'ENOENT') {
        if (!existsSync(filePath)) {
          // 削除されたファイル（PRで削除された）
          console.error(`⚠️ Deleted file (cannot read): ${filePath}`);
          console.error(`   This file was deleted in this PR`);
          return `[このファイルは削除されました]`;
        } else {
          // 実装エラー（存在するのに読めない）
          console.error(`❌ Implementation error: ${filePath}`);
          console.error(`   File exists but cannot be read`);
          console.error(`   Error: ${error.message}`);
          return `[実装エラー: ファイル読み込み失敗]`;
        }
      }

      // その他のエラー
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

// ============================================================================
// Conversation Collector
// ============================================================================

/**
 * 既存のレビューコメントを収集
 *
 * @param octokit Octokitインスタンス
 * @param owner リポジトリオーナー
 * @param repo リポジトリ名
 * @param prNumber PR番号
 * @returns 既存レビューコメントのリスト
 */
export async function collectExistingConversations(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<ReviewComment[]> {
  const previousComments = await octokit.rest.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber
  });

  // 自動レビューのコメントのみ抽出
  const autoReviewComments = previousComments.data.filter(
    c => c.body.includes(BOT_SIGNATURE)
  );

  if (autoReviewComments.length === 0) {
    return [];
  }

  console.log(`📋 Found ${autoReviewComments.length} existing review comments`);

  const parser = new DiffParser(); // diffなしで初期化
  const reviewComments: ReviewComment[] = [];

  for (const comment of autoReviewComments) {
    const issueData = parser.extractIssueFromComment(comment.body);
    if (issueData) {
      reviewComments.push({
        comment_id: comment.id,
        file_path: comment.path,
        line: comment.line ?? null,
        category: issueData.category,
        severity: issueData.severity,
        description: issueData.description,
        original_comment: comment.body,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        thread_id: null,  // orchestrator.tsで後から設定される
        is_resolved: false  // orchestrator.tsで後から設定される
      });
    }
  }

  return reviewComments;
}
