/**
 * PRレビュアークラス
 * Claude Agent SDKを使用してコードレビューを実施
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { ClaudeAgent } from '../../shared/claude/agent';
import { loadReviewPrompt, type FileDiff } from '../lib/files';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class PRReviewer {
  private agent: ClaudeAgent;

  constructor(
    existingCommentsPath: string,
    headSha: string,
    owner: string,
    repo: string,
    prNumber: number
  ) {
    this.agent = new ClaudeAgent({
      mcpServers: {
        'review-util': {
          command: 'bun',
          args: ['run', `${__dirname}/../mcp/review-util-mcp-server.ts`],
          env: {
            EXISTING_COMMENTS_PATH: existingCommentsPath,
            HEAD_SHA: headSha,
            GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
            GITHUB_OWNER: owner,
            GITHUB_REPO: repo,
            PR_NUMBER: String(prNumber)
          }
        },
        'serena': {
          command: 'uvx',
          args: [
            '--from',
            'git+https://github.com/oraios/serena',
            'serena',
            'start-mcp-server',
            '--context',
            'ide-assistant',
            '--project',
            process.cwd()
          ]
        }
      },
      allowedTools: [
        'Read',  // 差分ファイル読み込み用
        'mcp__review-util__format_review',
        'mcp__review-util__submit_review',
        'mcp__review-util__get_comments_for_file',
        // Serena MCP tools - All default tools
        'mcp__serena__activate_project',
        'mcp__serena__check_onboarding_performed',
        'mcp__serena__create_text_file',
        'mcp__serena__delete_memory',
        'mcp__serena__find_referencing_code_snippets',
        'mcp__serena__find_referencing_symbols',
        'mcp__serena__find_symbol',
        'mcp__serena__get_symbols_overview',
        'mcp__serena__insert_after_symbol',
        'mcp__serena__insert_before_symbol',
        'mcp__serena__list_dir',
        'mcp__serena__list_memories',
        'mcp__serena__onboarding',
        'mcp__serena__prepare_for_new_conversation',
        'mcp__serena__read_file',
        'mcp__serena__read_memory',
        'mcp__serena__remove_project',
        'mcp__serena__replace_lines',
        'mcp__serena__replace_symbol_body',
        'mcp__serena__rename_symbol',
        'mcp__serena__replace_regex',
        'mcp__serena__restart_language_server',
        'mcp__serena__search_for_pattern',
        'mcp__serena__summarize_changes',
        'mcp__serena__switch_modes',
        'mcp__serena__think_about_collected_information',
        'mcp__serena__think_about_task_adherence',
        'mcp__serena__think_about_whether_you_are_done',
        'mcp__serena__write_memory',
        // Serena MCP tools - Optional tools
        'mcp__serena__delete_lines',
        'mcp__serena__execute_shell_command',
        'mcp__serena__get_current_config',
        'mcp__serena__initial_instructions',
        'mcp__serena__insert_at_line'
      ],
      maxTurns: 150
    });
  }

  /**
   * PRの差分をレビューしてGitHubにコメント投稿
   *
   * @param diffFiles 差分ファイル情報の配列
   * @param reviewGuidelines レビュー観点
   */
  async review(
    diffFiles: FileDiff[],
    reviewGuidelines: string
  ): Promise<void> {
    // プロンプトを生成（ファイル単位の差分リストを渡す）
    const promptText = this.buildPrompt(diffFiles, reviewGuidelines);

    console.log('🤖 Starting Claude code review with Agent SDK...');

    // ClaudeAgentでレビューを実行（submit_review内でGitHub投稿）
    await this.agent.query({
      prompt: promptText
    });

    console.log('✅ Review agent execution completed');
  }

  /**
   * レビュー用のプロンプトを構築
   */
  private buildPrompt(
    fileDiffs: FileDiff[],
    reviewGuidelines: string
  ): string {
    // 外部プロンプトMDファイルから読み込み（差分はファイルリストで指定）
    return loadReviewPrompt(fileDiffs, reviewGuidelines);
  }
}
