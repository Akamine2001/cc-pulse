/**
 * Comment Resolver
 *
 * 前回のレビューコメントの修正状況をClaudeで判定し、適切に処理する
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { ClaudeAgent } from '../../shared/claude/agent';
import { loadResolveCommentPrompt } from '../lib/files';
import type { ReviewComment } from '../shared/schemas';
import type { FileDiff } from '../lib/files';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class CommentResolver {
  /**
   * 前回のレビューコメントを解決
   *
   * @param existingComments 既存コメント（threadId含む）
   * @param existingCommentsPath 既存コメントのJSONファイルパス
   * @param fileDiffs ファイル単位の差分情報の配列
   * @param owner リポジトリオーナー
   * @param repo リポジトリ名
   * @param prNumber PR番号
   * @param prAuthor PR作成者
   */
  async resolvePreviousComments(
    existingComments: ReviewComment[],
    existingCommentsPath: string,
    fileDiffs: FileDiff[],
    owner: string,
    repo: string,
    prNumber: number,
    prAuthor: string
  ): Promise<void> {
    if (existingComments.length === 0) {
      console.log('✅ No previous comments to resolve');
      return;
    }

    console.log(`📋 Resolving ${existingComments.length} previous comments...`);

    // プロンプトを構築
    const promptText = loadResolveCommentPrompt(fileDiffs);

    console.log('🤖 Starting comment resolution with Agent SDK...');

    // ClaudeAgentを初期化
    const agent = new ClaudeAgent({
      mcpServers: {
        'review-util': {
          command: 'bun',
          args: ['run', `${__dirname}/../mcp/review-util-mcp-server.ts`],
          env: {
            EXISTING_COMMENTS_PATH: existingCommentsPath,
            GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
            GITHUB_OWNER: owner,
            GITHUB_REPO: repo,
            PR_NUMBER: String(prNumber),
            PR_AUTHOR: prAuthor
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
        'mcp__review-util__get_comments_for_file',
        'mcp__review-util__update_conversation',
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
      maxTurns: 70
    });

    // ClaudeAgentでコメント解決を実行（最後まで実行）
    await agent.query({
      prompt: promptText
    });

    console.log('✅ Comment resolution completed');
  }
}
