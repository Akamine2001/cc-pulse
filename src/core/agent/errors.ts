/**
 * cc-pulse基底エラークラス
 */
export class CCPulseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Claude Code CLI関連エラー
 */
export class ClaudeCodeError extends CCPulseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CLAUDE_CODE_ERROR', context);
  }
}

/**
 * ニュース収集エラー
 */
export class NewsCollectionError extends CCPulseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'NEWS_COLLECTION_ERROR', context);
  }
}

/**
 * MCPサーバーエラー
 */
export class MCPServerError extends CCPulseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'MCP_SERVER_ERROR', context);
  }
}

/**
 * Agent実行エラー
 */
export class AgentExecutionError extends CCPulseError {
  constructor(
    message: string,
    public readonly stderr?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'AGENT_EXECUTION_ERROR', context);
  }
}
