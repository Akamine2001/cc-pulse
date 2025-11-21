/**
 * ログ出力から機密情報をマスキングする
 *
 * Claude Code CLIの--verboseモードでは、MCPサーバー設定が詳細ログに出力される。
 * env フィールドに含まれるAPI KEYやトークンを保護するため、マスキング処理を実施。
 */

/**
 * stderr出力から機密情報を含むenvフィールドと環境変数名をマスキング
 *
 * MCPサーバー設定のJSON内にある"env":{...}の中身を***REDACTED***に置換
 * さらに、一般的な環境変数名も***ENV_VAR***にマスキング
 *
 * @param text ログテキスト
 * @returns マスキング済みテキスト
 *
 * @example
 * ```typescript
 * const log = '--mcp-config {"mcpServers":{"review-util":{"env":{"GITHUB_TOKEN":"secret"}}}}';
 * sanitizeSensitiveData(log);
 * // => '--mcp-config {"mcpServers":{"review-util":{"env":{"***REDACTED***"}}}}'
 * 
 * const error = 'Error: GITHUB_TOKEN is required';
 * sanitizeSensitiveData(error);
 * // => 'Error: ***ENV_VAR*** is required'
 * ```
 */
export function sanitizeSensitiveData(text: string): string {
  // 1. "env":{...} の中身全体をマスキング
  // ネストしたJSONも考慮し、対応する閉じ括弧まで検出
  let sanitized = text.replace(
    /"env":\s*\{[^}]*\}/g,
    '"env":{"***REDACTED***"}'
  );

  // 2. 一般的な環境変数名をマスキング
  const envVarPatterns = [
    'GITHUB_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN', 
    'ANTHROPIC_API_KEY',
    'JULES_API_KEY',
    'JULES_GITHUB_TOKEN',
    'API_KEY',
    'ACCESS_TOKEN',
    'SECRET_KEY',
    'PRIVATE_KEY',
    'PASSWORD',
    'CLAUDE_PATH'
  ];

  for (const envVar of envVarPatterns) {
    // 環境変数名の前後に境界があるパターンでマッチ（変数名の一部だけマッチしないよう）
    const regex = new RegExp(`\\b${envVar}\\b`, 'g');
    sanitized = sanitized.replace(regex, '***ENV_VAR***');
  }

  return sanitized;
}
