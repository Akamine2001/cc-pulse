import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'child_process';
import { join } from 'path';
import { NewsAgent } from '../core/agent';
import { getConfig } from '../core/config';
import { fetcherLogger } from '../utils/logger';
import { getNewsDataPath, ensureDir, getNewsDataDir } from '../utils/paths';
import { CCPulseDatetime } from '../utils/CCPulseDatetime';
import { notifyFetchSuccess, notifyFetchError } from '../core/notification';
import type { DailyNewsData } from '../schemas/news-schemas';

/**
 * Fetch command - Collect news articles
 */
export async function fetchCommand(): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // Load configuration
    const config = await getConfig();
    spinner.succeed('Configuration loaded');

    console.log(chalk.cyan('\n=== CC Pulse - News Fetcher ==='));
    console.log(chalk.gray(`Keywords: ${config.keywords.join(', ')}`));
    console.log(chalk.gray(`Target count: ${config.count}`));
    console.log(chalk.gray(`Language: ${config.language}\n`));

    // Initialize agent
    const agent = new NewsAgent();
    await fetcherLogger.info(`News fetch started - Keywords: ${config.keywords.join(', ')}, Count: ${config.count}`);

    // Fetch news
    spinner.start('Fetching news articles...');
    const result = await agent.fetchNews(config.keywords, config.count);
    spinner.succeed(`Fetched ${result.news.length} articles`);

    // Save to JSON file
    spinner.start('Saving news data...');
    const savedPath = await saveNewsData(result);
    spinner.succeed('News data saved');

    // Generate embeddings and save to database
    spinner.start('Generating embeddings and saving to database...');
    await embedArticles(savedPath);
    spinner.succeed('Embeddings saved to database');

    // Display summary
    console.log(chalk.green('\n=== News collection complete! ===\n'));
    console.log(chalk.bold('Summary:'));
    console.log(chalk.gray(`  Articles collected: ${result.stats.total_collected}`));
    console.log(chalk.gray(`  Unique articles: ${result.stats.unique_articles}`));
    console.log(chalk.gray(`  Duplicates removed: ${result.stats.duplicate_removed}`));
    console.log(chalk.gray(`  Agent iterations: ${result.stats.iterations}`));
    console.log(chalk.gray(`  Duration: ${(result.stats.duration_ms / 1000).toFixed(2)}s`));
    console.log(chalk.gray(`  Saved to: ${savedPath}\n`));

    await fetcherLogger.info(`News fetch completed - ${result.news.length} articles saved`);

    // Send success notification
    await notifyFetchSuccess(result.news.length, result.stats.duration_ms);

  } catch (error) {
    spinner.fail('News fetch failed');
    console.error(chalk.red(`
Error: ${error}
`));
    await fetcherLogger.error(`News fetch failed: ${error}`);
    
    // Send error notification
    await notifyFetchError(String(error));
    
    throw error;
  }
}

/**
 * Save news data to JSON file with datetime format
 */
async function saveNewsData(data: DailyNewsData): Promise<string> {
  // Generate filename with datetime: YYYY-MM-DD_HHMMSS.json
  const datetime = new CCPulseDatetime(data.fetched_at);
  const dateStr = datetime.toDateString(); // YYYY-MM-DD
  const timeStr = datetime.format('HHmmss'); // HHMMSS
  const filename = `${dateStr}_${timeStr}.json`;
  const filePath = join(getNewsDataDir(), filename);

  // Ensure directory exists
  await ensureDir(getNewsDataDir());

  // Write JSON file
  await Bun.write(filePath, JSON.stringify(data, null, 2));

  await fetcherLogger.info(`News data saved to ${filePath}`);

  return filePath;
}

/**
 * Generate embeddings and save articles to database
 */
async function embedArticles(jsonPath: string): Promise<void> {
  const mcpDir = join(process.cwd(), 'mcp');
  const batchScript = join(mcpDir, 'batch_embed.py');

  return new Promise((resolve, reject) => {
    const proc = spawn('uv', ['run', 'python', 'batch_embed.py', jsonPath], {
      cwd: mcpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        // Log stdout for debugging
        if (stdout) {
          console.log(chalk.gray('\nEmbedding process output:'));
          console.log(chalk.gray(stdout.trim()));
        }
        resolve();
      } else {
        const error = new Error(`Embedding process failed with exit code ${code}\n${stderr}`);
        reject(error);
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}
