import chalk from 'chalk';
import prompts from 'prompts';
import ora from 'ora';
import { Scheduler, SCHEDULE_PATTERN_LABELS, WEEKDAY_LABELS } from '../core/scheduler';
import { getConfig } from '../core/config';

/**
 * Schedule command - Interactive scheduler setup
 */
export async function scheduleCommand(options: { noUi?: boolean; stop?: boolean } = {}): Promise<void> {
  const scheduler = new Scheduler();
  const status = await scheduler.getStatus();

  // Display header
  console.log(chalk.cyan('\n╔══════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║       CC Pulse スケジューラー設定              ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════════╝\n'));

  // Handle --stop option
  if (options.stop) {
    await stopScheduler(scheduler);
    return;
  }

  // Check if already running
  if (status.fetcherRunning || status.webserverRunning) {
    // Already running - show status and settings menu
    await showSettingsMenu(scheduler, status);
  } else {
    // Not running - configure and start interactively
    await configureAndStart(scheduler, options);
  }
}

/**
 * Start scheduler
 */
async function startScheduler(scheduler: Scheduler, options: { noUi?: boolean }): Promise<void> {
  console.log(chalk.gray('📊 現在の状態: ❌ 停止中\n'));

  const spinner = ora('スケジューラーを起動しています...').start();

  try {
    await scheduler.start({ noUi: options.noUi });

    const config = await getConfig();
    const patternLabel = SCHEDULE_PATTERN_LABELS[config.scheduler.pattern];

    spinner.succeed('スケジューラー起動完了！\n');

    console.log(chalk.green('  スケジュール: ') + chalk.white(`${patternLabel} ${config.scheduler.time}`));
    if (!options.noUi) {
      console.log(chalk.green('  WebUIサーバー: ') + chalk.white(`http://localhost:${config.port}`));
    }
    console.log();
  } catch (error) {
    spinner.fail('起動に失敗しました');
    console.error(chalk.red(`
Error: ${error}
`));
    throw error;
  }
}

/**
 * Configure and start scheduler (when stopped)
 */
async function configureAndStart(scheduler: Scheduler, options: { noUi?: boolean }): Promise<void> {
  const config = await getConfig();

  console.log(chalk.gray('📊 現在の状態: ❌ 停止中\n'));
  console.log(chalk.cyan('スケジュール設定を行います\n'));

  // 1. Select schedule pattern
  const { pattern } = await prompts({
    type: 'select',
    name: 'pattern',
    message: 'スケジュールパターンを選択',
    choices: [
      { title: '毎日', value: 'daily' },
      { title: '平日（月〜金）', value: 'weekday' },
      { title: '休日（土・日）', value: 'weekend' },
      { title: 'カスタム（曜日を個別選択）', value: 'custom' }
    ],
    initial: ['daily', 'weekday', 'weekend', 'custom'].indexOf(config.scheduler.pattern)
  });

  if (!pattern) {
    console.log(chalk.gray('\nキャンセルしました。\n'));
    return;
  }

  let customDays: number[] = [];

  // If custom, select weekdays
  if (pattern === 'custom') {
    const { selectedDays } = await prompts({
      type: 'multiselect',
      name: 'selectedDays',
      message: '実行する曜日を選択（スペースキーで選択/解除、Enterで決定）',
      choices: WEEKDAY_LABELS.map((label, index) => ({
        title: `${label}曜日`,
        value: index,
        selected: config.scheduler.custom_days.includes(index)
      })),
      min: 1
    });

    if (!selectedDays || selectedDays.length === 0) {
      console.log(chalk.gray('\nキャンセルしました。\n'));
      return;
    }

    customDays = selectedDays;
  }

  // 2. Select time
  const timeParts = config.scheduler.time.split(':').map(Number);
  const currentHour = timeParts[0] ?? 9;
  const currentMinute = timeParts[1] ?? 0;

  // Select hour
  const { hour } = await prompts({
    type: 'select',
    name: 'hour',
    message: '時を選択 (↑↓キーで選択、Enterで決定)',
    choices: Array.from({ length: 24 }, (_, i) => ({
      title: i.toString().padStart(2, '0'),
      value: i
    })),
    initial: currentHour
  });

  if (hour === undefined) {
    console.log(chalk.gray('\nキャンセルしました。\n'));
    return;
  }

  // Select minute (5-minute intervals)
  const minuteChoices = Array.from({ length: 12 }, (_, i) => i * 5);
  const initialMinuteIndex = minuteChoices.findIndex((m) => m >= currentMinute);

  const { minute } = await prompts({
    type: 'select',
    name: 'minute',
    message: '分を選択 (↑↓キーで選択、Enterで決定)',
    choices: minuteChoices.map((m) => ({
      title: m.toString().padStart(2, '0'),
      value: m
    })),
    initial: initialMinuteIndex >= 0 ? initialMinuteIndex : 0
  });

  if (minute === undefined) {
    console.log(chalk.gray('\nキャンセルしました。\n'));
    return;
  }

  const newTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

  // 3. Save settings and start
  console.log();
  const spinner = ora('設定を保存しています...').start();

  try {
    // Update config
    await scheduler.setSchedulePattern(pattern, customDays);
    await scheduler.setScheduleTime(newTime);

    spinner.succeed('設定を保存しました');

    // Start scheduler
    spinner.start('スケジューラーを起動しています...');
    await scheduler.start({ noUi: options.noUi });

    const updatedConfig = await getConfig();
    const patternLabel = SCHEDULE_PATTERN_LABELS[updatedConfig.scheduler.pattern];

    spinner.succeed('スケジューラー起動完了！\n');

    console.log(chalk.green('  スケジュール: ') + chalk.white(`${patternLabel} ${newTime}`));
    if (!options.noUi) {
      console.log(chalk.green('  WebUIサーバー: ') + chalk.white(`http://localhost:${updatedConfig.port}`));
    }
    console.log();
  } catch (error) {
    spinner.fail('起動に失敗しました');
    console.error(chalk.red(`
Error: ${error}
`));
    throw error;
  }
}

/**
 * Show settings menu (when already running)
 */
async function showSettingsMenu(scheduler: Scheduler, status: Awaited<ReturnType<typeof scheduler.getStatus>>): Promise<void> {
  const config = await getConfig();
  const patternLabel = SCHEDULE_PATTERN_LABELS[status.schedulePattern];

  // Display current status
  console.log(chalk.gray('📊 現在の状態:'));
  console.log(
    chalk.gray('  ニュース収集: ') +
      (status.fetcherRunning ? chalk.green('✅ 稼働中') : chalk.red('❌ 停止中')) +
      chalk.gray(` （${patternLabel} ${status.scheduleTime}）`)
  );
  console.log(
    chalk.gray('  WebUIサーバー: ') +
      (status.webserverRunning ? chalk.green('✅ 稼働中') : chalk.red('❌ 停止中')) +
      chalk.gray(` (http://localhost:${config.port})`)
  );
  if (status.lastFetchDate) {
    console.log(chalk.gray(`  最終実行: ${status.lastFetchDate}`));
  }
  console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

  // Show menu
  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'スケジュール設定を変更しますか?',
    choices: [
      { title: 'スケジュール時刻を変更', value: 'change_time' },
      { title: 'スケジュールパターンを変更', value: 'change_pattern' },
      { title: '停止する', value: 'stop' },
      { title: '終了', value: 'exit' }
    ]
  });

  if (!action || action === 'exit') {
    console.log(chalk.gray('\n終了します。\n'));
    return;
  }

  switch (action) {
    case 'change_time':
      await changeScheduleTime(scheduler);
      break;
    case 'change_pattern':
      await changeSchedulePattern(scheduler);
      break;
    case 'stop':
      await stopScheduler(scheduler);
      break;
  }
}

/**
 * Change schedule time (interactive hour/minute selection)
 */
async function changeScheduleTime(scheduler: Scheduler): Promise<void> {
  const config = await getConfig();
  const timeParts = config.scheduler.time.split(':').map(Number);
  const currentHour = timeParts[0] ?? 9;
  const currentMinute = timeParts[1] ?? 0;

  console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  console.log(chalk.gray(`現在の設定: ${config.scheduler.time}\n`));

  // Select hour
  const { hour } = await prompts({
    type: 'select',
    name: 'hour',
    message: '時を選択 (↑↓キーで選択、Enterで決定)',
    choices: Array.from({ length: 24 }, (_, i) => ({
      title: i.toString().padStart(2, '0'),
      value: i
    })),
    initial: currentHour
  });

  if (hour === undefined) {
    console.log(chalk.gray('\nキャンセルしました。\n'));
    return;
  }

  // Select minute (5-minute intervals)
  const minuteChoices = Array.from({ length: 12 }, (_, i) => i * 5);
  const initialMinuteIndex = minuteChoices.findIndex((m) => m >= currentMinute);

  const { minute } = await prompts({
    type: 'select',
    name: 'minute',
    message: '分を選択 (↑↓キーで選択、Enterで決定)',
    choices: minuteChoices.map((m) => ({
      title: m.toString().padStart(2, '0'),
      value: m
    })),
    initial: initialMinuteIndex >= 0 ? initialMinuteIndex : 0
  });

  if (minute === undefined) {
    console.log(chalk.gray('\nキャンセルしました。\n'));
    return;
  }

  // Update schedule time
  const newTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

  const spinner = ora('スケジュール時刻を更新しています...').start();
  try {
    await scheduler.setScheduleTime(newTime);
    spinner.succeed(`スケジュール時刻を ${newTime} に変更しました\n`);
  } catch (error) {
    spinner.fail('時刻変更に失敗しました');
    console.error(chalk.red(`\nError: ${error}\n`));
  }
}

/**
 * Change schedule pattern
 */
async function changeSchedulePattern(scheduler: Scheduler): Promise<void> {
  const config = await getConfig();

  console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

  // Select pattern
  const { pattern } = await prompts<'pattern'>({
    type: 'select',
    name: 'pattern',
    message: 'スケジュールパターンを選択',
    choices: [
      { title: '毎日', value: 'daily' },
      { title: '平日（月〜金）', value: 'weekday' },
      { title: '休日（土・日）', value: 'weekend' },
      { title: 'カスタム（曜日を個別選択）', value: 'custom' }
    ],
    initial: ['daily', 'weekday', 'weekend', 'custom'].indexOf(config.scheduler.pattern)
  }) as { pattern: 'daily' | 'weekday' | 'weekend' | 'custom' };

  if (!pattern) {
    console.log(chalk.gray('\nキャンセルしました。\n'));
    return;
  }

  let customDays: number[] = [];

  // If custom, select weekdays
  if (pattern === 'custom') {
    const { selectedDays } = await prompts({
      type: 'multiselect',
      name: 'selectedDays',
      message: '実行する曜日を選択（スペースキーで選択/解除、Enterで決定）',
      choices: WEEKDAY_LABELS.map((label, index) => ({
        title: `${label}曜日`,
        value: index,
        selected: config.scheduler.custom_days.includes(index)
      })),
      min: 1
    });

    if (!selectedDays || selectedDays.length === 0) {
      console.log(chalk.gray('\nキャンセルしました。\n'));
      return;
    }

    customDays = selectedDays;
  }

  // Update schedule pattern
  const spinner = ora('スケジュールパターンを更新しています...').start();
  try {
    await scheduler.setSchedulePattern(pattern, customDays);

    const patternLabel = SCHEDULE_PATTERN_LABELS[pattern];
    let customInfo = '';
    if (pattern === 'custom') {
      const dayLabels = customDays.map((d) => WEEKDAY_LABELS[d]).join('・');
      customInfo = ` (${dayLabels})`;
    }

    spinner.succeed(`スケジュールパターンを ${patternLabel}${customInfo} に変更しました\n`);
  } catch (error) {
    spinner.fail('パターン変更に失敗しました');
    console.error(chalk.red(`\nError: ${error}\n`));
  }
}

/**
 * Stop scheduler
 */
async function stopScheduler(scheduler: Scheduler): Promise<void> {
  console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  console.log(chalk.yellow('⚠️  以下を停止します:'));
  console.log(chalk.gray('  - ニュース収集スケジュール'));
  console.log(chalk.gray('  - WebUIサーバー\n'));

  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: '本当に停止しますか?',
    initial: false
  });

  if (!confirm) {
    console.log(chalk.gray('\nキャンセルしました。\n'));
    return;
  }

  const spinner = ora('スケジューラーを停止しています...').start();
  try {
    await scheduler.stop();
    spinner.succeed('停止完了\n');
  } catch (error) {
    spinner.fail('停止に失敗しました');
    console.error(chalk.red(`\nError: ${error}\n`));
  }
}
