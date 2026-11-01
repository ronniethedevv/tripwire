import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { GithubClient, withRetry, type FetchPullRequest } from '../../src/sources/index.js';

const silent = pino({ level: 'silent' });
const noSleep = async (): Promise<void> => {};

describe('withRetry', () => {
  it('returns the first success without sleeping', async () => {
    const sleep = vi.fn(async () => {});
    const result = await withRetry(async () => 'ok', { sleep });
    expect(result).toBe('ok');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('flaky');
        return calls;
      },
      { sleep: noSleep },
    );
    expect(result).toBe(3);
  });

  it('uses 1s/4s/16s backoff and rethrows after exhausting retries', async () => {
    const delays: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      delays.push(ms);
    };
    await expect(
      withRetry(
        async () => {
          throw new Error('down');
        },
        { sleep },
      ),
    ).rejects.toThrow('down');
    expect(delays).toEqual([1000, 4000, 16000]);
  });
});

describe('GithubClient.fetchPrMerged', () => {
  it('reports observed + merged with a timestamp on success', async () => {
    const fetchPr: FetchPullRequest = async () => ({ merged: true, htmlUrl: 'https://gh/pr/3' });
    const client = new GithubClient(fetchPr, { now: () => 777, sleep: noSleep, logger: silent });
    expect(await client.fetchPrMerged('owner/repo', 3)).toEqual({
      observed: true,
      merged: true,
      url: 'https://gh/pr/3',
      observedAt: 777,
    });
  });

  it('passes the parsed owner/repo/number through to the fetch', async () => {
    const fetchPr = vi.fn<FetchPullRequest>(async () => ({ merged: false, htmlUrl: 'u' }));
    const client = new GithubClient(fetchPr, { sleep: noSleep, logger: silent });
    await client.fetchPrMerged('acme/widgets', 42);
    expect(fetchPr).toHaveBeenCalledWith('acme', 'widgets', 42);
  });

  it('returns an unobserved snapshot when GitHub cannot be reached (never a false false)', async () => {
    const fetchPr: FetchPullRequest = async () => {
      throw new Error('ETIMEDOUT');
    };
    const client = new GithubClient(fetchPr, { sleep: noSleep, logger: silent });
    expect(await client.fetchPrMerged('owner/repo', 3)).toEqual({ observed: false });
  });
});
