/**
 * レビュー観点のJSON形式定義
 */

/**
 * 観点の検証タイプ
 * - diff_check: PR差分に含まれる場合のみ確認
 * - codebase_check: 差分に関わらず必ず確認（修正漏れ検出用）
 */
export type VerificationType = 'diff_check' | 'codebase_check';

/**
 * 観点のチェック方法
 * - diff: PR差分で確認
 * - mcp__serena__read_file: ファイル全体を読み込んで確認
 * - mcp__serena__find_symbol: シンボル定義を検索
 * - mcp__serena__search_for_pattern: パターン検索
 */
export type CheckMethod =
  | 'diff'
  | 'mcp__serena__read_file'
  | 'mcp__serena__find_symbol'
  | 'mcp__serena__search_for_pattern';

/**
 * 個別の観点
 */
export interface Guideline {
  /** 観点ID（一意） */
  id: number;
  /** カテゴリ（例: "型安全性", "実装方針", "ビジネスルール"） */
  category: string;
  /** 対象ファイル名 */
  file: string;
  /** 検証タイプ */
  verification_type: VerificationType;
  /** 確認する観点（短文） */
  rule: string;
  /** チェック方法 */
  check_method: CheckMethod;
  /** 対象ファイルの相対パス（codebase_checkの場合） */
  target_path?: string;
  /** 期待されるパターン（正規表現） */
  expected_pattern?: string;
  /** 期待される内容（文字列） */
  expected?: string;
  /** 参考情報（ファイルパス、行番号など） */
  reference?: string;
  /** 理由・背景 */
  reason: string;
  /** チェック済みフラグ */
  checked: boolean;
  /** 適用可能フラグ（PR差分に含まれているか） */
  applicable?: boolean;
}

/**
 * レビュー観点ファイル全体
 */
export interface GuidelinesFile {
  /** PR番号 */
  pr_number: number;
  /** 親Issue番号 */
  parent_issue?: number;
  /** サブIssue番号 */
  sub_issue?: number;
  /** 基底観点の説明 */
  base_description: string;
  /** 観点リスト */
  guidelines: Guideline[];
}
