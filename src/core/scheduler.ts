import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { readFile, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { getConfig, updateConfig } from './config';
import { getLogsDir, ensureDir } from '../utils/paths';
import type { Config } from './config';

/**
 * Scheduler status
 */
export interface SchedulerStatus {
  fetcherRunning: boolean;
  webserverRunning: boolean;
  scheduleTime: string;
  schedulePattern: 'daily' | 'weekday' | 'weekend' | 'custom';
  customDays: number[];
  lastFetchDate: string | null;
}

/**
 * Schedule pattern labels
 */
export const SCHEDULE_PATTERN_LABELS: Record<Config['scheduler']['pattern'], string> = {
  daily: '毎日',
  weekday: '平日（月〜金）',
  weekend: '休日（土・日）',
  custom: 'カスタム'
};

/**
 * Weekday labels (0=日曜, 1=月曜, ..., 6=土曜)
 */
export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * Scheduler class for managing launchd schedules
 */
export class Scheduler {
  private readonly launchAgentsDir: string;
  private readonly fetcherPlistPath: string;
  private readonly webserverPlistPath: string;
  private readonly fetcherLabel = 'com.cc-pulse.fetcher';
  private readonly webserverLabel = 'com.cc-pulse.webserver';

  constructor() {
    this.launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents');
    this.fetcherPlistPath = join(this.launchAgentsDir, `${this.fetcherLabel}.plist`);
    this.webserverPlistPath = join(this.launchAgentsDir, `${this.webserverLabel}.plist`);
  }

  /**
   * Get current scheduler status
   */
  async getStatus(): Promise<SchedulerStatus> {
    const config = await getConfig();
    const fetcherRunning = await this.isServiceRunning(this.fetcherLabel);
    const webserverRunning = await this.isServiceRunning(this.webserverLabel);
    const lastFetchDate = null; // TODO: Implement last fetch date tracking

    return {
      fetcherRunning,
      webserverRunning,
      scheduleTime: config.scheduler.time,
      schedulePattern: config.scheduler.pattern,
      customDays: config.scheduler.custom_days,
      lastFetchDate
    };
  }

  /**
   * Start scheduler (generate plists and load services)
   */
  async start(options: { noUi?: boolean } = {}): Promise<void> {
    const config = await getConfig();

    // Ensure LaunchAgents directory exists
    await ensureDir(this.launchAgentsDir);

    // Generate and load fetcher plist
    await this.generateFetcherPlist(config);
    await this.loadService(this.fetcherLabel, this.fetcherPlistPath);

    // Generate and load webserver plist (unless --no-ui)
    if (!options.noUi && config.scheduler.auto_start_webui) {
      await this.generateWebserverPlist(config);
      await this.loadService(this.webserverLabel, this.webserverPlistPath);
    }

    // Update config to mark scheduler as enabled
    await updateConfig({ scheduler: { ...config.scheduler, enabled: true } });
  }

  /**
   * Stop scheduler (unload services and remove plists)
   */
  async stop(): Promise<void> {
    const config = await getConfig();

    // Unload services
    await this.unloadService(this.fetcherLabel);
    await this.unloadService(this.webserverLabel);

    // Remove plist files
    if (existsSync(this.fetcherPlistPath)) {
      await unlink(this.fetcherPlistPath);
    }
    if (existsSync(this.webserverPlistPath)) {
      await unlink(this.webserverPlistPath);
    }

    // Update config to mark scheduler as disabled
    await updateConfig({ scheduler: { ...config.scheduler, enabled: false } });
  }

  /**
   * Update schedule time
   */
  async setScheduleTime(time: string): Promise<void> {
    const config = await getConfig();

    // Validate time format (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(time)) {
      throw new Error('Invalid time format. Expected HH:MM');
    }

    // Update config
    await updateConfig({ scheduler: { ...config.scheduler, time } });

    // Regenerate and reload fetcher plist if running
    if (config.scheduler.enabled) {
      const updatedConfig = await getConfig();
      await this.generateFetcherPlist(updatedConfig);
      await this.reloadService(this.fetcherLabel, this.fetcherPlistPath);
    }
  }

  /**
   * Update schedule pattern
   */
  async setSchedulePattern(
    pattern: 'daily' | 'weekday' | 'weekend' | 'custom',
    customDays?: number[]
  ): Promise<void> {
    const config = await getConfig();

    // Validate custom days if pattern is custom
    if (pattern === 'custom') {
      if (!customDays || customDays.length === 0) {
        throw new Error('Custom days must be specified for custom pattern');
      }
      await updateConfig({
        scheduler: { ...config.scheduler, pattern, custom_days: customDays }
      });
    } else {
      await updateConfig({
        scheduler: { ...config.scheduler, pattern, custom_days: [] }
      });
    }

    // Regenerate and reload fetcher plist if running
    if (config.scheduler.enabled) {
      const updatedConfig = await getConfig();
      await this.generateFetcherPlist(updatedConfig);
      await this.reloadService(this.fetcherLabel, this.fetcherPlistPath);
    }
  }

  /**
   * Start webserver only
   */
  async startWebUI(): Promise<void> {
    const config = await getConfig();
    await ensureDir(this.launchAgentsDir);
    await this.generateWebserverPlist(config);
    await this.loadService(this.webserverLabel, this.webserverPlistPath);
  }

  /**
   * Stop webserver only
   */
  async stopWebUI(): Promise<void> {
    await this.unloadService(this.webserverLabel);
    if (existsSync(this.webserverPlistPath)) {
      await unlink(this.webserverPlistPath);
    }
  }

  /**
   * Generate fetcher plist file
   */
  private async generateFetcherPlist(config: Config): Promise<void> {
    const templatePath = join(process.cwd(), 'src', 'templates', 'fetcher.plist.hbs');
    let template = await readFile(templatePath, 'utf-8');

    const { path: executablePath, isCompiled, cliPath } = await this.getExecutablePath();
    const logPath = getLogsDir();
    const workingDir = process.cwd();
    const userName = homedir().split('/').pop() || 'unknown';

    const timeParts = config.scheduler.time.split(':').map(Number);
    const hour = timeParts[0] ?? 9;
    const minute = timeParts[1] ?? 0;

    // Get schedule days based on pattern
    const scheduleDays = this.getScheduleDays(config.scheduler.pattern, config.scheduler.custom_days);
    const isDaily = config.scheduler.pattern === 'daily';

    // Replace template variables
    template = template.replace(/\{\{executablePath\}\}/g, executablePath);
    template = template.replace(/\{\{cliPath\}\}/g, cliPath || '');
    template = template.replace(/\{\{isCompiled\}\}/g, isCompiled.toString());
    template = template.replace(/\{\{logPath\}\}/g, logPath);
    template = template.replace(/\{\{workingDir\}\}/g, workingDir);
    template = template.replace(/\{\{userName\}\}/g, userName);
    template = template.replace(/\{\{scheduleHour\}\}/g, hour.toString());
    template = template.replace(/\{\{scheduleMinute\}\}/g, minute.toString());

    // Handle cliPath conditional
    if (isCompiled) {
      // Remove the entire {{#if cliPath}}...{{/if}} block (compiled binary doesn't need bun run)
      template = template.replace(/\{\{#if cliPath\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    } else {
      // Remove only the conditional tags, keep the content (development mode needs bun run)
      template = template.replace(/\{\{#if cliPath\}\}/g, '');
      template = template.replace(/\{\{\/if\}\}/g, '');
    }

    // Handle calendar interval (daily vs specific days)
    if (isDaily) {
      template = template.replace(/\{\{#if isDaily\}\}/g, '');
      template = template.replace(/\{\{else\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    } else {
      // Remove daily section
      template = template.replace(/\{\{#if isDaily\}\}[\s\S]*?\{\{else\}\}/g, '');
      template = template.replace(/\{\{\/if\}\}/g, '');

      // Build array of dicts for each day
      const daysXml = scheduleDays
        .map(
          (day) => `\t\t<dict>
\t\t\t<key>Weekday</key>
\t\t\t<integer>${day}</integer>
\t\t\t<key>Hour</key>
\t\t\t<integer>${hour}</integer>
\t\t\t<key>Minute</key>
\t\t\t<integer>${minute}</integer>
\t\t</dict>`
        )
        .join('\n');

      template = template.replace(/\{\{#each scheduleDays\}\}[\s\S]*?\{\{\/each\}\}/g, daysXml);
    }

    // Ensure log directory exists
    await ensureDir(logPath);

    // Write plist file
    await writeFile(this.fetcherPlistPath, template, 'utf-8');
  }

  /**
   * Generate webserver plist file
   */
  private async generateWebserverPlist(config: Config): Promise<void> {
    const templatePath = join(process.cwd(), 'src', 'templates', 'webserver.plist.hbs');
    let template = await readFile(templatePath, 'utf-8');

    const { path: executablePath, isCompiled, cliPath } = await this.getExecutablePath();
    const logPath = getLogsDir();
    const workingDir = process.cwd();

    // Replace template variables
    template = template.replace(/\{\{executablePath\}\}/g, executablePath);
    template = template.replace(/\{\{cliPath\}\}/g, cliPath || '');
    template = template.replace(/\{\{isCompiled\}\}/g, isCompiled.toString());
    template = template.replace(/\{\{logPath\}\}/g, logPath);
    template = template.replace(/\{\{workingDir\}\}/g, workingDir);

    // Handle cliPath conditional
    if (isCompiled) {
      // Remove the entire {{#if cliPath}}...{{/if}} block (compiled binary doesn't need bun run)
      template = template.replace(/\{\{#if cliPath\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    } else {
      // Remove only the conditional tags, keep the content (development mode needs bun run)
      template = template.replace(/\{\{#if cliPath\}\}/g, '');
      template = template.replace(/\{\{\/if\}\}/g, '');
    }

    // Ensure log directory exists
    await ensureDir(logPath);

    // Write plist file
    await writeFile(this.webserverPlistPath, template, 'utf-8');
  }

  /**
   * Get schedule days based on pattern
   */
  private getScheduleDays(pattern: Config['scheduler']['pattern'], customDays: number[]): number[] {
    switch (pattern) {
      case 'daily':
        return [0, 1, 2, 3, 4, 5, 6]; // All days
      case 'weekday':
        return [1, 2, 3, 4, 5]; // Monday to Friday
      case 'weekend':
        return [0, 6]; // Sunday and Saturday
      case 'custom':
        return customDays;
      default:
        return [0, 1, 2, 3, 4, 5, 6];
    }
  }

  /**
   * Get executable path (compiled binary or bun runtime)
   * @returns path and whether it's a compiled binary
   */
  private async getExecutablePath(): Promise<{ path: string; isCompiled: boolean; cliPath?: string }> {
    // Check for .app bundle in /Applications (primary)
    const appBundlePath = '/Applications/cc-pulse.app/Contents/MacOS/cc-pulse';
    if (existsSync(appBundlePath)) {
      return { path: appBundlePath, isCompiled: true };
    }

    // Check for .app bundle in ~/.local/bin (legacy)
    const localAppBundlePath = join(homedir(), '.local', 'bin', 'cc-pulse.app', 'Contents', 'MacOS', 'cc-pulse');
    if (existsSync(localAppBundlePath)) {
      return { path: localAppBundlePath, isCompiled: true };
    }

    // Check for standalone binary (legacy)
    const compiledBinaryPath = join(homedir(), '.local', 'bin', 'cc-pulse');
    if (existsSync(compiledBinaryPath)) {
      return { path: compiledBinaryPath, isCompiled: true };
    }

    // Development mode: use bun
    const bunPath = await new Promise<string>((resolve, reject) => {
      const proc = spawn('which', ['bun']);
      let stdout = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error('bun not found in PATH'));
        }
      });
    });

    const cliPath = join(process.cwd(), 'src', 'cli.ts');
    return { path: bunPath, isCompiled: false, cliPath };
  }

  /**
   * Get current user ID for launchctl
   */
  private async getUserId(): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('id', ['-u']);
      let stdout = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error('Failed to get user ID'));
        }
      });
    });
  }

  /**
   * Check if a launchd service is running
   */
  private async isServiceRunning(label: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('launchctl', ['list', label]);
      proc.on('close', (code) => {
        // Exit code 0 means service is loaded
        resolve(code === 0);
      });
    });
  }

  /**
   * Load a launchd service
   */
  private async loadService(label: string, plistPath: string): Promise<void> {
    // First, try to unload if already loaded (ignore errors)
    await this.unloadService(label).catch(() => {});

    return new Promise((resolve, reject) => {
      const proc = spawn('launchctl', ['load', '-w', plistPath]);

      let stderr = '';
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to load ${label}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Unload a launchd service
   */
  private async unloadService(label: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('launchctl', ['unload', '-w', this.getLabelPlistPath(label)]);

      let stderr = '';
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        // Exit code 0 or 3 (service not loaded) are both OK
        if (code === 0 || code === 3) {
          resolve();
        } else {
          reject(new Error(`Failed to unload ${label}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Reload a launchd service (unload + load)
   */
  private async reloadService(label: string, plistPath: string): Promise<void> {
    await this.unloadService(label);
    await this.loadService(label, plistPath);
  }

  /**
   * Get plist path for a label
   */
  private getLabelPlistPath(label: string): string {
    return join(this.launchAgentsDir, `${label}.plist`);
  }
}

/**
 * Global scheduler instance
 */
export const scheduler = new Scheduler();
