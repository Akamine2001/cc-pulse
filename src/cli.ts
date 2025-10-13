#!/usr/bin/env bun
import { Command } from 'commander';
import { query } from '@anthropic-ai/claude-agent-sdk';
import chalk from 'chalk';
import { createOutputToolsServer } from './core/output-tools-server';
import { AGENT_NAMES } from './constants/agent-names';
import { fetchCommand } from './commands/fetch';
import { serveCommand } from './commands/serve';
import { setupCommand } from './commands/setup';
import { scheduleCommand } from './commands/schedule';
import { statusCommand } from './commands/status';
import { uninstallCommand } from './commands/uninstall';

const program = new Command();

program
  .name('cc-pulse')
  .version('0.1.0')
  .description('macOS向け自動ニュース収集CLIツール');

program
  .command('hello')
  .description('Test Claude Agent SDK')
  .action(async () => {
    console.log(chalk.cyan('Testing Claude Agent SDK...\n'));

    try {
      const stream = await query({
        prompt: 'Please introduce yourself briefly in 3 lines.',
        options: {
          maxTurns: 5
        }
      });

      for await (const message of stream) {
        // Show all messages
        console.log(chalk.yellow('--- Message Received ---'));
        console.log(JSON.stringify(message, null, 2));
        console.log(chalk.yellow('------------------------\n'));

        // Process "result" type messages
        if (message && typeof message === 'object' && message.type === 'result') {
          console.log(chalk.green('Final Result:'), (message as any).result);
          console.log(chalk.gray(`Duration: ${message.duration_ms}ms`));
          console.log(chalk.gray(`Turns: ${message.num_turns}`));
        }
      }

      console.log(chalk.cyan('\nClaude Agent SDK test completed!'));
    } catch (error) {
      console.error(chalk.red('Error occurred:'), error);
      process.exit(1);
    }
  });

program
  .command('test-mcp')
  .description('MCP Server with structured output validation test')
  .action(async () => {
    console.log(chalk.cyan('MCP Server + Subagent Test\n'));

    try {
      const masterPrompt = `
You are a news collection orchestrator.

Task:
1. Use the Task tool to delegate to the news-collector subagent
2. The news-collector will collect 3 news articles about "AI"
3. Monitor the news-collector's progress and handle any errors

Important Instructions:
- The news-collector subagent will use WebSearch and WebFetch tools
- The news-collector MUST call mcp__output__output_collected_news tool to output results
- If the news-collector encounters an error with mcp__output__output_collected_news, it will automatically retry with corrected format
- Wait for the news-collector to complete successfully

The news-collector knows how to properly format the output. Your job is to:
1. Delegate the task
2. Wait for completion
3. Report the final results back to me

Start the task now.
`;

      const stream = query({
        prompt: masterPrompt,
        options: {
          agents: {
            [AGENT_NAMES.NEWS_COLLECTOR]: {
              description: 'News collection specialist. Uses WebSearch/WebFetch to collect articles.',
              prompt: `You are a news collection specialist.

Task:
1. Use WebSearch to find articles about the keywords
2. Use WebFetch to get full article content
3. Call mcp__output__output_collected_news tool to output results

CRITICAL - Tool Input Format:
When calling mcp__output__output_collected_news, you MUST pass data as ACTUAL objects/arrays, NOT as JSON strings.

CORRECT FORMAT:
{
  "articles": [
    {
      "title": "Article title",
      "content": "Article content...",
      "url": "https://example.com",
      "language": "en",
      "source_domain": "example.com",
      "fetched_at": "2025-10-04T09:00:00+09:00"
    }
  ],
  "total_found": 3,
  "keywords_used": ["AI"]
}

WRONG - Do NOT stringify:
{
  "articles": "[{...}]",      // String - WRONG!
  "total_found": "3",         // String - WRONG!
  "keywords_used": "[\"AI\"]" // String - WRONG!
}

ERROR HANDLING:
If you receive an error from mcp__output__output_collected_news:
1. Read the error message carefully
2. Check your data format - make sure you're passing objects/arrays, not strings
3. Fix the format issue
4. Retry the tool call immediately
5. Keep retrying until the tool accepts your input - do NOT give up

Data Requirements:
- title: non-empty string
- content: non-empty string
- url: valid URL format
- language: two-letter code (en, ja, zh, etc)
- source_domain: domain name only (e.g., "example.com")
- fetched_at: ISO 8601 format with timezone (e.g., "2025-10-04T09:00:00+09:00")`,
              tools: ['WebSearch', 'WebFetch', 'mcp__output__output_collected_news']
            }
          },
          mcpServers: {
            'output': createOutputToolsServer()
          },
          allowedTools: [
            'Task',
            'WebSearch',
            'WebFetch',
            'mcp__output__output_collected_news',
            'mcp__output__output_translation',
            'mcp__output__output_duplicate_check',
            'mcp__output__output_aggregated_news'
          ]
        }
      });

      let toolUsageCount = 0;
      let finalOutput = null;

      for await (const message of stream) {
        console.log(chalk.yellow('--- Message Received ---'));
        console.log(JSON.stringify(message, null, 2));
        console.log(chalk.yellow('--------------------\n'));

        // Monitor tool usage
        if (message?.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              toolUsageCount++;
              console.log(chalk.blue(`[Tool ${toolUsageCount}] ${block.name}`));

              if (block.name === 'output_collected_news') {
                finalOutput = block.input;
                console.log(chalk.green('Structured output validated!'));
              }
            }
          }
        }

        // Final result
        if (message?.type === 'result') {
          console.log(chalk.green('\nFinal Result:'));
          console.log(chalk.gray(`Duration: ${message.duration_ms}ms`));
          console.log(chalk.gray(`Turns: ${message.num_turns}`));
        }
      }

      if (finalOutput) {
        console.log(chalk.cyan('\nValidated Output:'));
        console.log(JSON.stringify(finalOutput, null, 2));
      }

      console.log(chalk.cyan('\nMCP Server test completed!'));

    } catch (error) {
      console.error(chalk.red('Error occurred:'), error);
      process.exit(1);
    }
  });

program
  .command('fetch')
  .description('Fetch news articles based on configuration')
  .action(async () => {
    try {
      await fetchCommand();
    } catch (error) {
      console.error(chalk.red('Fetch command failed:'), error);
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('Start web UI server to view collected news')
  .action(async () => {
    try {
      await serveCommand();
    } catch (error) {
      console.error(chalk.red('Serve command failed:'), error);
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('初期セットアップ（設定ファイル作成・モデルダウンロード）')
  .action(async () => {
    try {
      await setupCommand();
    } catch (error) {
      console.error(chalk.red('Setup command failed:'), error);
      process.exit(1);
    }
  });

program
  .command('schedule')
  .description('スケジューラー設定（対話的）')
  .option('--no-ui', 'WebUIなしでスケジュールのみ起動')
  .option('--stop', 'スケジュールとWebUIを停止')
  .action(async (options) => {
    try {
      await scheduleCommand(options);
    } catch (error) {
      console.error(chalk.red('Schedule command failed:'), error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('システムステータス表示')
  .action(async () => {
    try {
      await statusCommand();
    } catch (error) {
      console.error(chalk.red('Status command failed:'), error);
      process.exit(1);
    }
  });

program
  .command('uninstall')
  .description('アンインストール（全データ削除）')
  .action(async () => {
    try {
      await uninstallCommand();
    } catch (error) {
      console.error(chalk.red('Uninstall command failed:'), error);
      process.exit(1);
    }
  });

program.parse();
