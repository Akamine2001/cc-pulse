
import type { ReviewContext } from './context/review-context';

/**
 * MCPツールの実行結果
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * MCPツールハンドラーのインターフェース
 *
 * 各ツールはこのインターフェースを実装する
 */
export interface ToolHandler {
  /** ツール名（例: 'add_review_comment'） */
  name: string;

  /** ツールの説明（Claude向け） */
  description: string;

  /** 入力スキーマ（JSON Schema形式） */
  inputSchema: object;

  /**
   * ツールの実行
   * @param args 入力パラメータ（unknown型、各ハンドラーでバリデーション）
   * @param context 共有コンテキスト
   */
  execute(args: unknown, context: ReviewContext): Promise<ToolResult>;
}

/**
 * ReviewContextの設定（環境変数から読み込む）
 */
export interface ReviewContextConfig {
  /** PR番号 */
  prNumber: number;
  /** PR作成者 */
  prAuthor: string;
  /** 最新コミットSHA */
  headSha: string;
  /** リポジトリオーナー */
  owner: string;
  /** リポジトリ名 */
  repo: string;
  /** ガイドラインファイルパス */
  guidelinesFilePath: string;
  /** 既存コメントファイルパス */
  existingCommentsPath: string;
  /** ローカルモードフラグ */
  isLocalMode: boolean;
  /** Julesセッションが見つかったか */
  julesSessionFound: boolean;
  /** GitHubトークン */
  githubToken: string;
}

/**
 * ツールハンドラーのレジストリ
 */
export type ToolRegistry = Map<string, ToolHandler>;

/**
 * ツール定義のリスト（ListTools用）
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}
