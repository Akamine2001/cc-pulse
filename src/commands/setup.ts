import chalk from 'chalk';
import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, writeFile, copyFile, chmod } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import ora from 'ora';
import prompts from 'prompts';
import {
  getConfigDir,
  getConfigFilePath,
  getDataDir,
  getStateDir,
  getNewsDataDir,
  getLogsDir,
  ensureDir,
} from '../utils/paths';

/**
 * Default configuration file content
 */
const DEFAULT_CONFIG = `# cc-pulse configuration

# Keywords for news collection
keywords:
  - AI
  - Machine Learning
  - Claude

# Target article count
count: 5

# Language
language: ja

# Web server port
port: 5775

# Output directory (optional, defaults to ~/.local/share/cc-pulse/news)
# output_dir: ~/.local/share/cc-pulse/news

# Scheduler settings
scheduler:
  enabled: false
  time: "09:00"
  pattern: daily  # daily | weekday | weekend | custom
  custom_days: []
  auto_start_webui: true
`;

/**
 * Setup command: Initialize cc-pulse
 */
export async function setupCommand(): Promise<void> {
  console.log(chalk.cyan('🚀 cc-pulse Setup\n'));

  try {
    // Step 1: Create directories
    await setupDirectories();

    // Step 2: Create config file
    await setupConfigFile();

    // Step 3: Setup Python MCP environment
    await setupPythonEnvironment();

    // Step 4: Download embedding model
    await downloadEmbeddingModel();

    // Step 5: Build and install binary (optional)
    await buildAndInstallBinary();

    // Success message
    console.log(chalk.green('\nSetup completed successfully!\n'));
    console.log(chalk.cyan('Next steps:'));
    console.log(chalk.gray('  1. Edit config: ~/.config/cc-pulse/config.yml'));
    console.log(chalk.gray('  2. Schedule news collection: bun run schedule'));
    console.log(chalk.gray('  3. Or collect news now: bun run fetch'));
    console.log(chalk.gray('  4. View results: bun run serve\n'));

  } catch (error) {
    console.error(chalk.red('\nSetup failed:'), error);
    process.exit(1);
  }
}

/**
 * Create directory structure
 */
async function setupDirectories(): Promise<void> {
  const spinner = ora('Creating directories...').start();

  try {
    const dirs = [
      getConfigDir(),
      getDataDir(),
      getStateDir(),
      getNewsDataDir(),
      getLogsDir(),
      join(getStateDir(), 'orchestration'),
    ];

    for (const dir of dirs) {
      await ensureDir(dir);
    }

    spinner.succeed('Directories created');
  } catch (error) {
    spinner.fail('Failed to create directories');
    throw error;
  }
}

/**
 * Create configuration file
 */
async function setupConfigFile(): Promise<void> {
  const configPath = getConfigFilePath();

  if (existsSync(configPath)) {
    console.log(chalk.yellow('⚠️  Config file already exists (skipped)'));
    console.log(chalk.gray(`   ${configPath}`));
    return;
  }

  const spinner = ora('Creating config file...').start();

  try {
    await writeFile(configPath, DEFAULT_CONFIG, 'utf-8');
    spinner.succeed(`Config file created: ${configPath}`);
  } catch (error) {
    spinner.fail('Failed to create config file');
    throw error;
  }
}

/**
 * Setup Python MCP environment (uv sync)
 */
async function setupPythonEnvironment(): Promise<void> {
  const spinner = ora('Setting up Python MCP environment...').start();

  try {
    const mcpDir = join(process.cwd(), 'mcp');

    if (!existsSync(mcpDir)) {
      spinner.warn('mcp directory not found (skipped)');
      return;
    }

    // Check if uv command exists
    const uvCheck = await checkCommandExists('uv');
    if (!uvCheck) {
      spinner.warn('uv command not found (skipped)');
      console.log(chalk.yellow('  ℹ️  Install uv: https://docs.astral.sh/uv/'));
      return;
    }

    // Run uv sync
    await runCommand('uv', ['sync'], mcpDir);

    spinner.succeed('Python MCP environment ready');
  } catch (error) {
    spinner.fail('Failed to setup Python MCP environment');
    throw error;
  }
}

/**
 * Download EmbeddingGemma Q4 model
 */
async function downloadEmbeddingModel(): Promise<void> {
  const spinner = ora('Downloading EmbeddingGemma Q4 model...').start();

  try {
    const mcpDir = join(process.cwd(), 'mcp');
    const downloadScript = join(mcpDir, 'download_model.py');

    if (!existsSync(downloadScript)) {
      spinner.warn('download_model.py not found (skipped)');
      return;
    }

    // Check if uv command exists
    const uvCheck = await checkCommandExists('uv');
    if (!uvCheck) {
      spinner.warn('uv command not found (skipped)');
      return;
    }

    spinner.text = 'Downloading EmbeddingGemma Q4 model (~188MB, may take a few minutes)...';

    // Execute model download
    await runCommand('uv', ['run', 'python', 'download_model.py'], mcpDir, {
      stdio: 'inherit' // Show progress
    });

    spinner.succeed('EmbeddingGemma Q4 model downloaded');
  } catch (error) {
    spinner.fail('Failed to download model');
    throw error;
  }
}

/**
 * Check if command exists
 */
async function checkCommandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', [command]);
    proc.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

/**
 * Run command
 */
async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  options: { stdio?: 'inherit' | 'pipe'; shell?: boolean } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: options.stdio || 'pipe',
      shell: options.shell ?? true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Build and install compiled binary as .app bundle
 */
async function buildAndInstallBinary(): Promise<void> {
  const appBundlePath = '/Applications/cc-pulse.app';

  // Check if app bundle already exists (installed from release)
  if (existsSync(appBundlePath)) {
    console.log(chalk.green('✓ アプリケーションは既にインストールされています'));
    console.log(chalk.gray(`  ${appBundlePath}`));
    return;
  }

  // Check if we're in development mode (source code exists)
  const isDevelopment = existsSync(join(process.cwd(), 'src', 'cli.ts'));

  if (!isDevelopment) {
    console.log(chalk.yellow('\n⚠️  アプリケーションバンドルが見つかりません'));
    console.log(chalk.gray('  /Applications/cc-pulse.app にインストールしてください\n'));
    return;
  }

  // Development mode: Build and install from source
  console.log(chalk.cyan('\n📦 開発モード: ソースからビルドします\n'));

  const contentsDir = join(appBundlePath, 'Contents');
  const macosDir = join(contentsDir, 'MacOS');
  const binaryPath = join(macosDir, 'cc-pulse');
  const registerHelperPath = join(macosDir, 'cc-pulse-register');

  const spinner = ora('バイナリをビルドしています...').start();

  try {
    // 1. Build TypeScript CLI binary
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const distBinaryName = `cc-pulse-darwin-${arch}`;
    const distBinaryPath = join(process.cwd(), 'dist', distBinaryName);

    await runCommand('bun', ['run', `build:${arch}`], process.cwd());

    if (!existsSync(distBinaryPath)) {
      throw new Error(`Binary not found at ${distBinaryPath}`);
    }

    spinner.succeed('CLIバイナリのビルドが完了しました');

    // 2. Build Swift login item registration helper
    spinner.start('登録ヘルパーをビルドしています...');

    const swiftSourcePath = join(process.cwd(), 'swift/LoginItemRegistration/main.swift');
    const tmpRegisterPath = '/tmp/cc-pulse-register';

    await runCommand('swiftc', [
      '-O',
      '-o', tmpRegisterPath,
      swiftSourcePath
    ], process.cwd());

    spinner.succeed('登録ヘルパーのビルドが完了しました');

    // 3. Create .app bundle structure
    spinner.start('.appバンドルを作成しています...');

    await ensureDir(macosDir);

    // Copy CLI binary
    await copyFile(distBinaryPath, binaryPath);
    await chmod(binaryPath, 0o755);

    // Copy registration helper
    await copyFile(tmpRegisterPath, registerHelperPath);
    await chmod(registerHelperPath, 0o755);

    // Copy Info.plist
    const infoPlistTemplate = join(process.cwd(), 'src', 'templates', 'MainApp-Info.plist');
    await copyFile(infoPlistTemplate, join(contentsDir, 'Info.plist'));

    spinner.succeed('.appバンドルを作成しました');

    // 4. Note about signing (signing should be done separately for release)
    console.log(chalk.yellow('\n⚠️  署名が必要です'));
    console.log(chalk.gray('   開発者向け: scripts/build-release.sh を実行してください'));
    console.log(chalk.gray('   または手動で署名: codesign --force --deep --sign "..." /Applications/cc-pulse.app\n'));

    // 5. Create CLI symlink (optional, may require sudo)
    spinner.start('CLIコマンドを設定しています...');

    try {
      execSync(`ln -sf "${binaryPath}" /usr/local/bin/cc-pulse`, {
        stdio: 'pipe'
      });
      spinner.succeed('CLIコマンドを設定しました');
    } catch {
      spinner.warn('CLIコマンドの設定をスキップしました（手動設定が必要）');
      console.log(chalk.gray('  手動設定: sudo ln -sf /Applications/cc-pulse.app/Contents/MacOS/cc-pulse /usr/local/bin/cc-pulse'));
    }

    console.log(chalk.green(`\n✓ バイナリをインストールしました: ${appBundlePath}\n`));
  } catch (error) {
    spinner.fail('バイナリのインストールに失敗しました');
    console.log(chalk.yellow('  ℹ️  開発モードでも動作します'));

    if (error instanceof Error) {
      console.log(chalk.red(`\n     エラー詳細: ${error.message}`));
      if (error.stack) {
        console.log(chalk.gray(`     ${error.stack}`));
      }
    } else {
      console.log(chalk.gray(`     エラー: ${error}`));
    }
  }
}
