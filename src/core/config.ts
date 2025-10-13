import { z } from 'zod';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { getConfigFilePath, getConfigDir, ensureDir, getNewsDataDir } from '../utils/paths';

/**
 * CC Pulse configuration schema
 */
export const ConfigSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1).max(10),
  language: z.string().default('ja'),
  count: z.number().positive().default(5),
  port: z.number().positive().default(5775),
  output_dir: z.string().default(getNewsDataDir()),
  scheduler: z.object({
    enabled: z.boolean().default(false),
    time: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
    pattern: z.enum(['daily', 'weekday', 'weekend', 'custom']).default('daily'),
    custom_days: z.array(z.number().min(0).max(6)).default([]),
    auto_start_webui: z.boolean().default(true)
  }).default({
    enabled: false,
    time: '09:00',
    pattern: 'daily',
    custom_days: [],
    auto_start_webui: true
  })
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: Config = {
  keywords: ['AI', 'Machine Learning', 'Claude'],
  language: 'ja',
  count: 5,
  port: 5775,
  output_dir: getNewsDataDir(),
  scheduler: {
    enabled: false,
    time: '09:00',
    pattern: 'daily',
    custom_days: [],
    auto_start_webui: true
  }
};;

/**
 * Configuration manager
 */
export class ConfigManager {
  private configPath: string;
  private config: Config | null = null;

  constructor() {
    this.configPath = getConfigFilePath();
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<Config> {
    // Ensure config directory exists
    await ensureDir(getConfigDir());

    // If config file doesn't exist, create default
    if (!existsSync(this.configPath)) {
      await this.save(DEFAULT_CONFIG);
      this.config = DEFAULT_CONFIG;
      return DEFAULT_CONFIG;
    }

    try {
      const content = await readFile(this.configPath, 'utf-8');
      const parsed = yamlLoad(content);

      // Validate with Zod schema
      this.config = ConfigSchema.parse(parsed);
      return this.config;
    } catch (error) {
      throw new Error(`Failed to load config: ${error}`);
    }
  }

  /**
   * Save configuration to file
   */
  async save(config: Config): Promise<void> {
    try {
      // Validate before saving
      const validated = ConfigSchema.parse(config);

      // Convert to YAML
      const yamlContent = yamlDump(validated, {
        indent: 2,
        lineWidth: 80,
        noRefs: true
      });

      // Ensure directory exists
      await ensureDir(getConfigDir());

      // Write to file (using Bun.write for better UTF-8 handling)
      await Bun.write(this.configPath, yamlContent);
      this.config = validated;
    } catch (error) {
      throw new Error(`Failed to save config: ${error}`);
    }
  }

  /**
   * Get current configuration (load if not cached)
   */
  async get(): Promise<Config> {
    if (!this.config) {
      return await this.load();
    }
    return this.config;
  }

  /**
   * Update configuration
   */
  async update(updates: Partial<Config>): Promise<Config> {
    const current = await this.get();
    const updated = { ...current, ...updates };
    await this.save(updated);
    return updated;
  }

  /**
   * Reset to default configuration
   */
  async reset(): Promise<Config> {
    await this.save(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  /**
   * Check if config file exists
   */
  exists(): boolean {
    return existsSync(this.configPath);
  }

  /**
   * Get config file path
   */
  getPath(): string {
    return this.configPath;
  }
}

/**
 * Global config manager instance
 */
export const configManager = new ConfigManager();

/**
 * Helper functions
 */
export async function loadConfig(): Promise<Config> {
  return await configManager.load();
}

export async function saveConfig(config: Config): Promise<void> {
  await configManager.save(config);
}

export async function getConfig(): Promise<Config> {
  return await configManager.get();
}

export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  return await configManager.update(updates);
}
