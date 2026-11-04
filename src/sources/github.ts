import { Octokit } from '@octokit/rest';
import type {
  ChecksGreenSnapshot,
  IssueClosedSnapshot,
  PrMergedSnapshot,
  UsageCountSnapshot,
} from '../conditions/index.js';
import { logger as defaultLogger, type Logger } from '../logger.js';
import { withRetry } from './retry.js';

export interface PullRequestState {
  readonly merged: boolean;
  readonly htmlUrl: string;
}
export interface IssueState {
  readonly closed: boolean;
  readonly htmlUrl: string;
}
export interface ChecksState {
  readonly allGreen: boolean;
  readonly htmlUrl: string;
}

/** The low-level fetches, split out so tests can stub them without network. */
export interface GithubFetchers {
  readonly pullRequest: (owner: string, repo: string, number: number) => Promise<PullRequestState>;
  readonly issue: (owner: string, repo: string, number: number) => Promise<IssueState>;
  readonly checks: (owner: string, repo: string, ref: string) => Promise<ChecksState>;
  /** Number of files matching `needle` in `repo` (owner/name). */
  readonly searchCode: (needle: string, repo: string) => Promise<number>;
}

export interface GithubClientOptions {
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly retries?: number;
  readonly logger?: Logger;
}

function splitRepo(repo: string): readonly [string, string] {
  const slash = repo.indexOf('/');
  return [repo.slice(0, slash), repo.slice(slash + 1)];
}

/** Reads GitHub for condition checks. Network failure becomes `unobserved`, never a false `false` (I2). */
export class GithubClient {
  private readonly fetchers: GithubFetchers;
  private readonly opts: GithubClientOptions;

  constructor(fetchers: GithubFetchers, opts: GithubClientOptions = {}) {
    this.fetchers = fetchers;
    this.opts = opts;
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** Retry then, on persistent failure, return null (the caller maps that to unobserved). */
  private async tryFetch<T>(fn: () => Promise<T>, what: string): Promise<T | null> {
    try {
      return await withRetry(fn, {
        retries: this.opts.retries ?? 3,
        ...(this.opts.sleep ? { sleep: this.opts.sleep } : {}),
      });
    } catch (error) {
      (this.opts.logger ?? defaultLogger).warn(
        { what, error: error instanceof Error ? error.message : String(error) },
        'github source unobserved after retries',
      );
      return null;
    }
  }

  async fetchPrMerged(repo: string, pullNumber: number): Promise<PrMergedSnapshot> {
    const [owner, name] = splitRepo(repo);
    const pr = await this.tryFetch(() => this.fetchers.pullRequest(owner, name, pullNumber), `pr ${repo}#${pullNumber}`);
    return pr === null ? { observed: false } : { observed: true, merged: pr.merged, url: pr.htmlUrl, observedAt: this.now() };
  }

  async fetchIssueClosed(repo: string, issueNumber: number): Promise<IssueClosedSnapshot> {
    const [owner, name] = splitRepo(repo);
    const issue = await this.tryFetch(() => this.fetchers.issue(owner, name, issueNumber), `issue ${repo}#${issueNumber}`);
    return issue === null ? { observed: false } : { observed: true, closed: issue.closed, url: issue.htmlUrl, observedAt: this.now() };
  }

  async fetchChecksGreen(repo: string, ref: string): Promise<ChecksGreenSnapshot> {
    const [owner, name] = splitRepo(repo);
    const checks = await this.tryFetch(() => this.fetchers.checks(owner, name, ref), `checks ${repo}@${ref}`);
    return checks === null ? { observed: false } : { observed: true, allGreen: checks.allGreen, url: checks.htmlUrl, observedAt: this.now() };
  }

  /**
   * Sum matches for `needle` across the watched repos. If any repo search can't
   * be read after retries the whole result is unobserved — a partial count must
   * never fire (I2).
   */
  async fetchUsageCount(needle: string, repos: readonly string[]): Promise<UsageCountSnapshot> {
    let count = 0;
    for (const repo of repos) {
      const n = await this.tryFetch(() => this.fetchers.searchCode(needle, repo), `search "${needle}" in ${repo}`);
      if (n === null) {
        return { observed: false };
      }
      count += n;
    }
    const url = `https://github.com/search?q=${encodeURIComponent(needle)}&type=code`;
    return { observed: true, count, url, observedAt: this.now() };
  }
}

const GREEN_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);

/** Wire real fetchers from a read-only token. */
export function octokitFetchers(token: string): GithubFetchers {
  const octokit = new Octokit({ auth: token });
  return {
    pullRequest: async (owner, repo, pullNumber) => {
      const res = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
      return { merged: res.data.merged === true, htmlUrl: res.data.html_url };
    },
    issue: async (owner, repo, issueNumber) => {
      const res = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber });
      return { closed: res.data.state === 'closed', htmlUrl: res.data.html_url };
    },
    checks: async (owner, repo, ref) => {
      const res = await octokit.rest.checks.listForRef({ owner, repo, ref });
      const runs = res.data.check_runs;
      const allGreen =
        runs.length > 0 &&
        runs.every((c) => c.status === 'completed' && c.conclusion !== null && GREEN_CONCLUSIONS.has(c.conclusion));
      return { allGreen, htmlUrl: `https://github.com/${owner}/${repo}/commits/${ref}` };
    },
    searchCode: async (needle, repo) => {
      const res = await octokit.rest.search.code({ q: `${needle} repo:${repo}` });
      return res.data.total_count;
    },
  };
}
