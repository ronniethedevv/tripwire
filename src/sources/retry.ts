export interface RetryOptions {
  /** Number of retries after the first attempt. Default 3 (4 attempts total). */
  readonly retries?: number;
  /** Delay before each retry, by retry index. Default 1s, 4s, 16s. */
  readonly delaysMs?: readonly number[];
  /** Injected for tests so no real time passes. Default is setTimeout. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly onRetry?: (error: unknown, attempt: number) => void;
}

const DEFAULT_DELAYS = [1000, 4000, 16000] as const;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn`, retrying on throw with growing waits. After the last retry still
 * fails, the final error is rethrown for the caller to turn into `unobserved`.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const delays = opts.delaysMs ?? DEFAULT_DELAYS;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        opts.onRetry?.(error, attempt + 1);
        await sleep(delays[Math.min(attempt, delays.length - 1)] ?? 0);
      }
    }
  }
  throw lastError;
}
