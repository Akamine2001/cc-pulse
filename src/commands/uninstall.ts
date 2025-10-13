import chalk from 'chalk';
import prompts from 'prompts';
import ora from 'ora';
import { Scheduler } from '../core/scheduler';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { getConfigDir, getDataDir, getStateDir } from '../utils/paths';

/**
 * Uninstall command - Remove all cc-pulse data and schedules
 */
export async function uninstallCommand(): Promise<void> {
  console.log(chalk.cyan('\n╔══════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║         CC Pulse アンインストール              ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════════╝\n'));

  console.log(chalk.yellow('⚠️  以下のデータが削除されます:\n'));
  console.log(chalk.gray('  - スケジューラー設定（launchd plist）'));
  console.log(chalk.gray('  - 設定ファイル（~/.config/cc-pulse/）'));
  console.log(chalk.gray('  - ニュースデータ（~/.local/share/cc-pulse/）'));
  console.log(chalk.gray('  - ログファイル（~/.local/state/cc-pulse/）'));
  console.log();

  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: '本当にアンインストールしますか?',
    initial: false
  });

  if (!confirm) {
    console.log(chalk.gray('\nキャンセルしました。\n'));
    return;
  }

  // Double confirmation
  const { doubleConfirm } = await prompts({
    type: 'confirm',
    name: 'doubleConfirm',
    message: chalk.red('すべてのデータが失われます。続行しますか?'),
    initial: false
  });

  if (!doubleConfirm) {
    console.log(chalk.gray('\nキャンセルしました。\n'));
    return;
  }

  let spinner = ora('スケジューラーを停止しています...').start();

  try {
    // 1. Stop scheduler
    const scheduler = new Scheduler();
    await scheduler.stop();
    spinner.succeed('スケジューラーを停止しました');

    // 2. Remove config directory
    const configDir = getConfigDir();
    if (existsSync(configDir)) {
      spinner = ora('設定ファイルを削除しています...').start();
      await rm(configDir, { recursive: true, force: true });
      spinner.succeed('設定ファイルを削除しました');
    }

    // 3. Remove data directory
    const dataDir = getDataDir();
    if (existsSync(dataDir)) {
      spinner = ora('ニュースデータを削除しています...').start();
      await rm(dataDir, { recursive: true, force: true });
      spinner.succeed('ニュースデータを削除しました');
    }

    // 4. Remove state directory
    const stateDir = getStateDir();
    if (existsSync(stateDir)) {
      spinner = ora('ログファイルを削除しています...').start();
      await rm(stateDir, { recursive: true, force: true });
      spinner.succeed('ログファイルを削除しました');
    }

    console.log(chalk.green('\n✅ アンインストールが完了しました\n'));

  } catch (error) {
    spinner.fail('アンインストールに失敗しました');
    console.error(chalk.red(`\nError: ${error}\n`));
    throw error;
  }
}
