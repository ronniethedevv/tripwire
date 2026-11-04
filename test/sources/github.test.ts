import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { GithubClient, withRetry, type GithubFetchers } from '../../src/sources/index.js';

const silent = pino({ level: 'silent' });
const noSleep = async (): Promise<void> => {};

function fetchers(over: Partial<GithubFetchers> = {}): GithubFetchers {
  return {
    pullRequest: over.pullRequest ?? (async () => { throw new Error('no pullRequest stub'); }),
    issue: over.issue ?? (async () => { throw new Error('no issue stub'); }),
    checks: over.checks ?? (async () => { throw new Error('no checks stub'); }),
    searchCode: over.searchCode ?? (async () => { throw new Error('no searchCode stub'); }),
  };
}

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
      withRetry(async () => {
        throw new Error('down');
      }, { sleep }),
    ).rejects.toThrow('down');
    expect(delays).toEqual([1000, 4000, 16000]);
  });
});

describe('GithubClient.fetchPrMerged', () => {
  it('reports observed + merged with a timestamp on success', async () => {
    const client = new GithubClient(
      fetchers({ pullRequest: async () => ({ merged: true, htmlUrl: 'https://gh/pr/3' }) }),
      { now: () => 777, sleep: noSleep, logger: silent },
    );
    expect(await client.fetchPrMerged('owner/repo', 3)).toEqual({
      observed: true,
      merged: true,
      url: 'https://gh/pr/3',
      observedAt: 777,
    });
  });

  it('passes the parsed owner/repo/number through to the fetch', async () => {
    const pullRequest = vi.fn(async () => ({ merged: false, htmlUrl: 'u' }));
    const client = new GithubClient(fetchers({ pullRequest }), { sleep: noSleep, logger: silent });
    await client.fetchPrMerged('acme/widgets', 42);
    expect(pullRequest).toHaveBeenCalledWith('acme', 'widgets', 42);
  });

  it('returns an unobserved snapshot when GitHub cannot be reached (never a false false)', async () => {
    const client = new GithubClient(
      fetchers({ pullRequest: async () => { throw new Error('ETIMEDOUT'); } }),
      { sleep: noSleep, logger: silent },
    );
    expect(await client.fetchPrMerged('owner/repo', 3)).toEqual({ observed: false });
  });
});

describe('GithubClient.fetchIssueClosed', () => {
  it('maps the closed state', async () => {
    const client = new GithubClient(
      fetchers({ issue: async () => ({ closed: true, htmlUrl: 'https://gh/i/7' }) }),
      { now: () => 1, sleep: noSleep, logger: silent },
    );
    expect(await client.fetchIssueClosed('owner/repo', 7)).toEqual({
      observed: true,
      closed: true,
      url: 'https://gh/i/7',
      observedAt: 1,
    });
  });

  it('is unobserved when the fetch fails', async () => {
    const client = new GithubClient(
      fetchers({ issue: async () => { throw new Error('down'); } }),
      { sleep: noSleep, logger: silent },
    );
    expect(await client.fetchIssueClosed('owner/repo', 7)).toEqual({ observed: false });
  });
});

describe('GithubClient.fetchChecksGreen', () => {
  it('maps the allGreen flag', async () => {
    const client = new GithubClient(
      fetchers({ checks: async () => ({ allGreen: true, htmlUrl: 'https://gh/commits/abc' }) }),
      { now: () => 1, sleep: noSleep, logger: silent },
    );
    expect(await client.fetchChecksGreen('owner/repo', 'abc')).toEqual({
      observed: true,
      allGreen: true,
      url: 'https://gh/commits/abc',
      observedAt: 1,
    });
  });

  it('is unobserved when the fetch fails', async () => {
    const client = new GithubClient(
      fetchers({ checks: async () => { throw new Error('down'); } }),
      { sleep: noSleep, logger: silent },
    );
    expect(await client.fetchChecksGreen('owner/repo', 'abc')).toEqual({ observed: false });
  });
});

describe('GithubClient.fetchUsageCount', () => {
  it('sums matches across the watched repos', async () => {
    const searchCode = vi.fn(async (_needle: string, repo: string) => (repo === 'a/b' ? 2 : 3));
    const client = new GithubClient(fetchers({ searchCode }), { now: () => 9, sleep: noSleep, logger: silent });
    expect(await client.fetchUsageCount('move_ref', ['a/b', 'c/d'])).toEqual({
      observed: true,
      count: 5,
      url: 'https://github.com/search?q=move_ref&type=code',
      observedAt: 9,
    });
    expect(searchCode).toHaveBeenCalledTimes(2);
  });

  it('is unobserved if any repo search fails (no partial count fires)', async () => {
    const client = new GithubClient(
      fetchers({
        searchCode: async (_needle, repo) => {
          if (repo === 'c/d') throw new Error('rate limited');
          return 2;
        },
      }),
      { sleep: noSleep, logger: silent },
    );
    expect(await client.fetchUsageCount('move_ref', ['a/b', 'c/d'])).toEqual({ observed: false });
  });
});
