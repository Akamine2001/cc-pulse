/**
 * Issue分析クラス
 * Claude Agent SDKを使用してIssueを分析し、レビュー・テスト観点を生成
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ClaudeAgent } from '../../shared/claude/agent';
import type { GuidelinesOutput } from '../shared/schemas';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class IssueAnalyzer {
  private agent: ClaudeAgent;
  private issueNumber: number;

  constructor(issueNumber: number) {
    this.issueNumber = issueNumber;

    this.agent = new ClaudeAgent({
      mcpServers: {
        'feature-review': {
          command: 'bun',
          args: ['run', `${__dirname}/../mcp/feature-review-mcp-server.ts`]
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
        // Feature Review MCP
        'mcp__feature-review__create_review_guidelines',
        // Serena MCP tools - 読み取り系のみ
        'mcp__serena__activate_project',
        'mcp__serena__check_onboarding_performed',
        'mcp__serena__find_referencing_symbols',
        'mcp__serena__find_symbol',
        'mcp__serena__get_symbols_overview',
        'mcp__serena__list_dir',
        'mcp__serena__list_memories',
        'mcp__serena__read_file',
        'mcp__serena__read_memory',
        'mcp__serena__search_for_pattern',
        'mcp__serena__find_file'
      ],
      maxTurns: 150
    });
  }

  /**
   * Issueを分析してレビュー・テスト観点を生成
   */
  async analyze(issue: { number: number; title: string; body: string }): Promise<GuidelinesOutput> {
    console.log(`[Analyzer] Starting analysis for Issue #${issue.number}`);

    // プロンプトテンプレートを読み込み
    const promptTemplate = await this.loadPromptTemplate();

    // 変数を置換
    const prompt = promptTemplate
      .replace(/\{\{ISSUE_NUMBER\}\}/g, String(issue.number))
      .replace(/\{\{ISSUE_TITLE\}\}/g, issue.title)
      .replace(/\{\{ISSUE_BODY\}\}/g, issue.body);

    console.log(`[Analyzer] Executing Claude Agent...`);

    // MCPツールの出力をキャプチャする変数
    let capturedGuidelines: GuidelinesOutput | null = null;

    try {
      // Claude Agent実行（onToolUseでMCPツールの出力をキャプチャ）
      await this.agent.query({
        prompt,
        onToolUse: (toolName: string, input: any) => {
          console.log(`[Analyzer] Tool called: ${toolName}`);

          // create_review_guidelinesが呼ばれた時、そのinputをキャプチャ
          if (toolName === 'mcp__feature-review__create_review_guidelines') {
            console.log(`[Analyzer] Capturing guidelines from MCP tool...`);
            capturedGuidelines = input as GuidelinesOutput;
          }
        }
      });

      console.log(`[Analyzer] Claude Agent execution completed`);

      // キャプチャしたguidelinesを検証
      if (!capturedGuidelines) {
        throw new Error(
          'MCPツール "create_review_guidelines" が呼び出されませんでした。\n' +
          'Claude AIが分析を完了できなかった可能性があります。'
        );
      }

      console.log(`[Analyzer] Successfully captured guidelines from MCP tool`);

      return capturedGuidelines;
    } catch (error) {
      console.error(`[Analyzer] Failed to analyze issue:`, error);
      throw error;
    }
  }

  /**
   * プロンプトテンプレートを読み込み
   */
  private async loadPromptTemplate(): Promise<string> {
    const promptPath = join(__dirname, '../prompts/analysis-prompt.md');

    if (!existsSync(promptPath)) {
      throw new Error(`Prompt template not found: ${promptPath}`);
    }

    return await Bun.file(promptPath).text();
  }
}
