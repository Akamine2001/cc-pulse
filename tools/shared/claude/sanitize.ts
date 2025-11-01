/**
 * ログ出力から機密情報をマスキングする
 *
 * Claude Code CLIの--verboseモードでは、MCPサーバー設定が詳細ログに出力される。
 * env フィールドに含まれるAPI KEYやトークンを保護するため、マスキング処理を実施。
 */

/**
 * stderr出力から機密情報を含むenvフィールドをマスキング
 *
 * MCPサーバー設定のJSON内にある"env":{...}の中身を***REDACTED***に置換
 *
 * @param text ログテキスト
 * @returns マスキング済みテキスト
 *
 * @example
 * ```typescript
 * const log = '--mcp-config {"mcpServers":{"review-util":{"env":{"GITHUB_TOKEN":"secret"}}}}';
 * sanitizeSensitiveData(log);
 * // => '--mcp-config {"mcpServers":{"review-util":{"env":{"***REDACTED***"}}}}'
 * ```
 */
export function sanitizeSensitiveData(text: string): string {
  // "env":{...} の中身全体をマスキング
  // ネストしたJSONも考慮し、対応する閉じ括弧まで検出
  return text.replace(
    /"env":\s*\{[^}]*\}/g,
    '"env":{"***REDACTED***"}'
  );
}
