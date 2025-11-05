import chalk from 'chalk';
import { Database } from 'bun:sqlite';
import { homedir } from 'os';
import { z } from 'zod';
import { getConfig } from '../core/config';
import { getNewsDataDir } from '../utils/paths';
import { existsSync, readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { DailyNewsData, FinalNewsItemWithFeedback } from '../schemas/news-schemas';

// Import the HTML file for Bun's automatic bundling
// Bun will automatically bundle React, TypeScript, and Tailwind CSS
import indexHTML from '../templates/index.html';

// Request validation schemas
const FeedbackRequestSchema = z.object({
  id: z.string().uuid(),
  feedback: z.enum(['good', 'bad'])
});

/**
 * Serve command - Start web UI server
 */
export async function serveCommand(): Promise<void> {
  const config = await getConfig();
  const port = config.port;
  const newsDir = getNewsDataDir();

  // Check if database exists
  const dbPath = join(homedir(), '.cc-pulse', 'articles.db');
  if (!existsSync(dbPath)) {
    console.error(chalk.red(`\nError: Database file does not exist`));
    console.error(chalk.gray(`Expected: ${dbPath}`));
    console.error(chalk.yellow(`\nHint: Run "bun run dev fetch" to collect news first\n`));
    process.exit(1);
  }

  // Initialize SQLite database
  const db = new Database(dbPath);

  // Check if news directory exists
  if (!existsSync(newsDir)) {
    console.error(chalk.red(`\nError: News data directory does not exist`));
    console.error(chalk.gray(`Expected: ${newsDir}`));
    console.error(chalk.yellow(`\nHint: Run "bun run dev fetch" to collect news first\n`));
    process.exit(1);
  }

  console.log(chalk.cyan('\n=== CC Pulse - Web UI Server ==='));
  console.log(chalk.gray(`Port: ${port}`));
  console.log(chalk.gray(`News directory: ${newsDir}\n`));

  const server = Bun.serve({
    port,
    hostname: 'localhost', // localhost only for security

    routes: {
      '/': indexHTML,
      '/api/dates': {
        GET: () => handleGetDates(newsDir),
      },
      '/api/news/:datetime': {
        GET: (req) => {
          const datetime = req.params.datetime || '';
          return handleGetNews(newsDir, datetime, db);
        },
      },
      '/api/feedback': {
        POST: async (req) => {
          return handleFeedback(req, db);
        },
      },
    },

    development: {
      hmr: true,
      console: true
    }
  });

  console.log(chalk.green(` Server running at http://localhost:${port}`));
  console.log(chalk.gray('Press Ctrl+C to stop\n'));

  // Keep the process running
  await new Promise(() => {});
}

/**
 * Get list of available datetime collections
 * Returns datetime strings in format: YYYY-MM-DD_HHMMSS
 */
async function handleGetDates(newsDir: string): Promise<Response> {
  try {
    if (!existsSync(newsDir)) {
      return Response.json({ dates: [] });
    }

    const files = readdirSync(newsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort((a, b) => b.localeCompare(a)); // Descending order (newest first)

    return Response.json({ dates: files });
  } catch (error) {
    console.error('Error getting dates:', error);
    return Response.json({ error: 'Failed to get dates' }, { status: 500 });
  }
}

/**
 * Get news data for a specific datetime
 * @param datetime Format: YYYY-MM-DD_HHMMSS
 */
async function handleGetNews(newsDir: string, datetime: string, db: Database): Promise<Response> {
  try {
    const filePath = join(newsDir, `${datetime}.json`);

    if (!existsSync(filePath)) {
      return Response.json({ error: 'News data not found' }, { status: 404 });
    }

    const content = await readFile(filePath, 'utf-8');
    const data: DailyNewsData = JSON.parse(content);

    // If there's no news, no need to merge feedback
    if (data.news.length === 0) {
      return Response.json(data);
    }

    // Merge is_good from SQLite (optimized: single query with IN clause)
    const ids = data.news.map(a => a.id);
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT id, is_good FROM articles WHERE id IN (${placeholders})`);
    const rows = stmt.all(...ids) as Array<{ id: string; is_good: number | null }>;

    // Create feedback map for O(1) lookup
    const feedbackMap = new Map(rows.map(r => [r.id, r.is_good]));

    // Create a new array with feedback merged
    const newsWithFeedback: FinalNewsItemWithFeedback[] = data.news.map(article => ({
      ...article,
      is_good: feedbackMap.get(article.id) ?? null,
    }));

    return Response.json({ ...data, news: newsWithFeedback });
  } catch (error) {
    console.error('Error getting news:', error);
    return Response.json({ error: 'Failed to get news data' }, { status: 500 });
  }
}

/**
 * Handle feedback submission
 */
async function handleFeedback(req: Request, db: Database): Promise<Response> {
  try {
    const json = await req.json();

    // Validate request body with zod
    const parseResult = FeedbackRequestSchema.safeParse(json);
    if (!parseResult.success) {
      return Response.json({
        error: 'Invalid request body',
        details: parseResult.error.format()
      }, { status: 400 });
    }

    const { id, feedback } = parseResult.data;

    // Update is_good in SQLite
    const is_good = feedback === 'good' ? 1 : 0;
    const stmt = db.prepare('UPDATE articles SET is_good = ? WHERE id = ?');
    const result = stmt.run(is_good, id);

    if (result.changes === 0) {
      return Response.json({
        error: 'Article not found in database'
      }, { status: 404 });
    }

    return Response.json({
      success: true,
      message: `Feedback "${feedback}" recorded for article`
    });

  } catch (error) {
    console.error('Error handling feedback:', error);
    return Response.json({ error: 'Failed to record feedback' }, { status: 500 });
  }
}
