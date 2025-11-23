/**
 * Retry Logic
 *
 * 指定された関数を指数バックオフでリトライする
 */
export async function retry<T>(retries: number, fn: () => Promise<T>): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      if (i < retries - 1) {
        const delay = 1000 * Math.pow(2, i);
        console.log(`Attempt ${i + 1} failed. Retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
}
