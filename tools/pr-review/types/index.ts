/**
 * PR Review Tool - Type Definitions
 *
 * 型定義のエクスポート（shared/schemas.tsから型のみを再エクスポート）
 */

export type {
  ReviewSeverity,
  ReviewIssue,
  ReviewStats,
  ReviewResult,
  ResolutionStatus,
  IssueResolution
} from '../shared/schemas';

/**
 * GitHub関連の型定義
 */
export interface InlineComment {
  path: string;
  line: number;
  body: string;
}

export interface CommentState {
  comment: any;
  status: 'fixed' | 'todo_added' | 'needs_decision' | 'implementation_changed' | 'not_fixed';
  threadId: string | undefined;
  message: string;
}

export interface ExcludedLocation {
  file: string;
  line: number;
  status: string;
}

/**
 * Conversation差分チェック結果
 */
export type ConversationAction =
  | 'no_diff'                  // 差分なし → 修正されていない
  | 'major_change'             // 大幅に実装が変わっている → クローズ
  | 'todo_added'               // TODO/コメントで対応計画記載 → クローズ
  | 'not_resolved'             // 根本的解決でない → 再コメント
  | 'has_replies';             // Conversationへ返信あり → オーナーメンション、クローズしない

export interface ConversationCheckResult {
  action: ConversationAction;
  reasoning: string;           // 判定理由
  fileDiff: string;           // ファイル差分（判定の証拠）
  hasReplies: boolean;        // 返信が存在するか
}
