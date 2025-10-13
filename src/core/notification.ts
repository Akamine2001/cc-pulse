import { spawn } from 'child_process';

/**
 * Send macOS notification
 */
export async function sendNotification(title: string, message: string, subtitle?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Escape special characters for AppleScript
    const escapedTitle = escapeAppleScript(title);
    const escapedMessage = escapeAppleScript(message);
    const escapedSubtitle = subtitle ? escapeAppleScript(subtitle) : '';

    // Build AppleScript command
    let script = `display notification "${escapedMessage}" with title "${escapedTitle}"`;
    if (subtitle) {
      script += ` subtitle "${escapedSubtitle}"`;
    }

    const proc = spawn('osascript', ['-e', script]);

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        // Don't reject - notification failure shouldn't block the main flow
        console.warn(`Failed to send notification: ${stderr}`);
        resolve();
      }
    });

    proc.on('error', (error) => {
      // Don't reject - notification failure shouldn't block the main flow
      console.warn(`Failed to send notification: ${error.message}`);
      resolve();
    });
  });
}

/**
 * Escape special characters for AppleScript
 */
function escapeAppleScript(text: string): string {
  return text
    .replace(/\\/g, '\\\\')  // Backslash
    .replace(/"/g, '\\"')    // Double quote
    .replace(/\n/g, '\\n')   // Newline
    .replace(/\r/g, '\\r')   // Carriage return
    .replace(/\t/g, '\\t');  // Tab
}

/**
 * Send success notification for news fetch
 */
export async function notifyFetchSuccess(articleCount: number, duration: number): Promise<void> {
  const durationSec = (duration / 1000).toFixed(1);
  await sendNotification(
    'CC Pulse',
    `${articleCount}件の記事を収集しました`,
    `所要時間: ${durationSec}秒`
  );
}

/**
 * Send error notification for news fetch
 */
export async function notifyFetchError(error: string): Promise<void> {
  await sendNotification(
    'CC Pulse',
    'ニュース収集に失敗しました',
    error.length > 50 ? error.substring(0, 50) + '...' : error
  );
}
