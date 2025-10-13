import chalk from 'chalk';
import { Scheduler, SCHEDULE_PATTERN_LABELS } from '../core/scheduler';
import { getConfig } from '../core/config';
import { existsSync } from 'fs';
import { getNewsDataDir } from '../utils/paths';
import { readdir } from 'fs/promises';

/**
 * Status command - Display overall system status
 */
export async function statusCommand(): Promise<void> {
  const scheduler = new Scheduler();
  const config = await getConfig();
  const status = await scheduler.getStatus();

  console.log(chalk.cyan('\n╔══════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║           CC Pulse ステータス                   ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════════╝\n'));

  // Scheduler status
  console.log(chalk.bold('📅 スケジューラー:'));
  const patternLabel = SCHEDULE_PATTERN_LABELS[status.schedulePattern];
  
  if (status.fetcherRunning) {
    console.log(chalk.green('  ✅ 稼働中'));
    console.log(chalk.gray(`     パターン: ${patternLabel}`));
    console.log(chalk.gray(`     時刻: ${status.scheduleTime}`));
    
    if (status.schedulePattern === 'custom' && status.customDays.length > 0) {
      const { WEEKDAY_LABELS } = await import('../core/scheduler');
      const dayLabels = status.customDays.map(d => WEEKDAY_LABELS[d]).join('・');
      console.log(chalk.gray(`     曜日: ${dayLabels}`));
    }
  } else {
    console.log(chalk.red('  ❌ 停止中'));
    console.log(chalk.gray(`     起動するには: ${chalk.white('cc-pulse schedule')}`));
  }

  // WebUI status
  console.log(chalk.bold('\n🌐 Web UI:'));
  if (status.webserverRunning) {
    console.log(chalk.green('  ✅ 稼働中'));
    console.log(chalk.gray(`     URL: ${chalk.white(`http://localhost:${config.port}`)}`));
  } else {
    console.log(chalk.red('  ❌ 停止中'));
  }

  // News data status
  console.log(chalk.bold('\n📰 ニュースデータ:'));
  const newsDataDir = getNewsDataDir();
  
  if (existsSync(newsDataDir)) {
    try {
      const files = await readdir(newsDataDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      if (jsonFiles.length > 0) {
        console.log(chalk.green(`  ✅ ${jsonFiles.length}件のデータファイル`));

        // Show latest file
        const sortedFiles = jsonFiles.sort().reverse();
        const latestFile = sortedFiles[0];
        if (latestFile) {
          const latestDate = latestFile.replace('.json', '');
          console.log(chalk.gray(`     最新: ${latestDate}`));
          console.log(chalk.gray(`     保存先: ${newsDataDir}`));
        }
      } else {
        console.log(chalk.yellow('  ⚠️  データなし'));
        console.log(chalk.gray(`     収集するには: ${chalk.white('cc-pulse fetch')}`));
      }
    } catch (error) {
      console.log(chalk.red('  ❌ データディレクトリの読み込みエラー'));
    }
  } else {
    console.log(chalk.yellow('  ⚠️  データディレクトリなし'));
    console.log(chalk.gray(`     セットアップするには: ${chalk.white('cc-pulse setup')}`));
  }

  // Configuration
  console.log(chalk.bold('\n⚙️  設定:'));
  console.log(chalk.gray(`  キーワード: ${config.keywords.join(', ')}`));
  console.log(chalk.gray(`  記事数: ${config.count}`));
  console.log(chalk.gray(`  言語: ${config.language}`));
  console.log(chalk.gray(`  ポート: ${config.port}`));

  console.log();
}
