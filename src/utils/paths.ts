import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

/**
 * XDG Base Directory compliant path management for CC Pulse
 * All paths follow the XDG specification with fixed locations (no environment variable override)
 */

const APP_NAME = 'cc-pulse';

/**
 * Get project root directory
 * Works in both development and compiled binary mode
 */
export function getProjectRoot(): string {
  // In Bun, import.meta.url is available
  if (import.meta.url) {
    // This file is at src/utils/paths.ts
    // So project root is ../../ from here
    const currentFile = fileURLToPath(import.meta.url);
    return join(dirname(currentFile), '..', '..');
  }
  // Fallback to process.cwd() (less reliable but better than nothing)
  return process.cwd();
}

/**
 * Get templates directory (src/templates/)
 */
export function getTemplatesDir(): string {
  return join(getProjectRoot(), 'src', 'templates');
}

/**
 * Get template file path
 * @param filename Template filename (e.g., 'index.html')
 */
export function getTemplatePath(filename: string): string {
  return join(getTemplatesDir(), filename);
}

/**
 * Get user home directory and expand ~ if present
 */
function getHomeDir(): string {
  return homedir();
}

/**
 * Expand ~ to home directory
 */
export function expandTilde(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return path.replace('~', getHomeDir());
  }
  return path;
}

/**
 * Get config directory (~/.config/cc-pulse/)
 */
export function getConfigDir(): string {
  return join(getHomeDir(), '.config', APP_NAME);
}

/**
 * Get data directory (~/.local/share/cc-pulse/)
 */
export function getDataDir(): string {
  return join(getHomeDir(), '.local', 'share', APP_NAME);
}

/**
 * Get state directory (~/.local/state/cc-pulse/)
 */
export function getStateDir(): string {
  return join(getHomeDir(), '.local', 'state', APP_NAME);
}

/**
 * Get cache directory (~/.cache/cc-pulse/)
 */
export function getCacheDir(): string {
  return join(getHomeDir(), '.cache', APP_NAME);
}

/**
 * Get config file path (~/.config/cc-pulse/config.yml)
 */
export function getConfigFilePath(): string {
  return join(getConfigDir(), 'config.yml');
}

/**
 * Get news data directory (~/.local/share/cc-pulse/news/)
 */
export function getNewsDataDir(): string {
  return join(getDataDir(), 'news');
}

/**
 * Get news data file path for a specific date
 * @param date Date string in YYYY-MM-DD format
 */
export function getNewsDataPath(date: string): string {
  return join(getNewsDataDir(), `${date}.json`);
}

/**
 * Get database file path (~/.cc-pulse/articles.db)
 * Note: This is a legacy path, not XDG compliant
 */
export function getDatabasePath(): string {
  // This path is intentionally not in XDG directories for legacy reasons
  return join(getHomeDir(), '.cc-pulse', 'articles.db');
}

/**
 * Get logs directory (~/.local/state/cc-pulse/logs/)
 */
export function getLogsDir(): string {
  return join(getStateDir(), 'logs');
}

/**
 * Get log file path
 * @param name Log file name (e.g., 'fetcher', 'webserver')
 */
export function getLogPath(name: string): string {
  return join(getLogsDir(), `${name}.log`);
}

/**
 * Get orchestration state directory (~/.local/state/cc-pulse/orchestration/)
 */
export function getOrchestrationStateDir(): string {
  return join(getStateDir(), 'orchestration');
}

/**
 * Ensure directory exists, create if not
 * @param dirPath Directory path to ensure
 */
export async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

/**
 * Initialize all required directories
 * Creates all XDG directories if they don't exist
 */
export async function initializeDirectories(): Promise<void> {
  await Promise.all([
    ensureDir(getConfigDir()),
    ensureDir(getDataDir()),
    ensureDir(getNewsDataDir()),
    ensureDir(getStateDir()),
    ensureDir(getLogsDir()),
    ensureDir(getOrchestrationStateDir()),
    ensureDir(getCacheDir())
  ]);
}

/**
 * Get all CC Pulse directories
 */
export function getAllDirectories() {
  return {
    config: getConfigDir(),
    data: getDataDir(),
    newsData: getNewsDataDir(),
    state: getStateDir(),
    logs: getLogsDir(),
    orchestration: getOrchestrationStateDir(),
    cache: getCacheDir()
  };
}

/**
 * Get Claude Code executable path
 * Priority: CLAUDE_PATH env var > which claude > default path
 * @returns Path to Claude Code CLI executable, or null if not found
 */
export function getClaudeCodeExecutablePath(): string | null {
  // 1. Check CLAUDE_PATH environment variable
  const claudePathEnv = process.env.CLAUDE_PATH;
  if (claudePathEnv && existsSync(claudePathEnv)) {
    return claudePathEnv;
  }

  // 2. Try `which claude`
  try {
    const whichResult = execSync('which claude', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const claudePath = whichResult.trim();
    if (claudePath && existsSync(claudePath)) {
      return claudePath;
    }
  } catch (error) {
    // `which` failed, continue to default path
  }

  // 3. Try default path (~/.local/bin/claude)
  const defaultPath = join(getHomeDir(), '.local', 'bin', 'claude');
  if (existsSync(defaultPath)) {
    return defaultPath;
  }

  // Claude Code CLI not found
  return null;
}
