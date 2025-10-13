import chalk from 'chalk';
import { appendFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { CCPulseDatetime } from './CCPulseDatetime';
import { getLogPath, ensureDir, getLogsDir } from './paths';

/**
 * Log levels
 */
export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

/**
 * Logger configuration
 */
interface LoggerConfig {
  name: string;
  consoleOutput: boolean;
  fileOutput: boolean;
}

/**
 * CC Pulse Logger
 * Provides structured logging with console and file output
 */
export class Logger {
  private config: LoggerConfig;
  private logFilePath: string;

  constructor(name: string, consoleOutput = true, fileOutput = true) {
    this.config = {
      name,
      consoleOutput,
      fileOutput
    };
    this.logFilePath = getLogPath(name);
  }

  /**
   * Format log message
   * Format: [2025-10-04 09:00:00] [INFO] message
   */
  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = CCPulseDatetime.now().toJST('yyyy-MM-dd HH:mm:ss');
    return `[${timestamp}] [${level}] ${message}`;
  }

  /**
   * Write to log file
   */
  private async writeToFile(formattedMessage: string): Promise<void> {
    if (!this.config.fileOutput) return;

    try {
      await ensureDir(getLogsDir());
      await appendFile(this.logFilePath, formattedMessage + '\n', 'utf-8');
    } catch (error) {
      console.error(chalk.red(`Failed to write to log file: ${error}`));
    }
  }

  /**
   * Write to console with color
   */
  private writeToConsole(level: LogLevel, formattedMessage: string): void {
    if (!this.config.consoleOutput) return;

    switch (level) {
      case LogLevel.INFO:
        console.log(chalk.blue(formattedMessage));
        break;
      case LogLevel.WARN:
        console.warn(chalk.yellow(formattedMessage));
        break;
      case LogLevel.ERROR:
        console.error(chalk.red(formattedMessage));
        break;
    }
  }

  /**
   * Log at specified level
   */
  private async log(level: LogLevel, message: string): Promise<void> {
    const formattedMessage = this.formatMessage(level, message);

    this.writeToConsole(level, formattedMessage);
    await this.writeToFile(formattedMessage);
  }

  /**
   * Log info message
   */
  async info(message: string): Promise<void> {
    await this.log(LogLevel.INFO, message);
  }

  /**
   * Log warning message
   */
  async warn(message: string): Promise<void> {
    await this.log(LogLevel.WARN, message);
  }

  /**
   * Log error message
   */
  async error(message: string): Promise<void> {
    await this.log(LogLevel.ERROR, message);
  }

  /**
   * Rotate log file (delete if older than 3 days)
   */
  async rotate(): Promise<void> {
    if (!existsSync(this.logFilePath)) return;

    try {
      const stats = statSync(this.logFilePath);
      const threeDaysAgo = CCPulseDatetime.now().subDays(3).getTime();

      if (stats.mtimeMs < threeDaysAgo) {
        await Bun.write(this.logFilePath, ''); // Clear log file
        await this.info('Log file rotated (older than 3 days)');
      }
    } catch (error) {
      console.error(chalk.red(`Failed to rotate log file: ${error}`));
    }
  }

  /**
   * Get log file path
   */
  getLogFilePath(): string {
    return this.logFilePath;
  }
}

/**
 * Create logger instance
 */
export function createLogger(name: string, consoleOutput = true, fileOutput = true): Logger {
  return new Logger(name, consoleOutput, fileOutput);
}

/**
 * Default loggers
 */
export const fetcherLogger = createLogger('fetcher');
export const webserverLogger = createLogger('webserver');
export const setupLogger = createLogger('setup');
