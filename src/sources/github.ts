import { Octokit } from '@octokit/rest';
import type { PrMergedSnapshot } from '../conditions/index.js';
import { logger as defaultLogger, type Logger } from '../logger.js';
import { withRetry } from './retry.js';

export interface PullRequestState {
  readonly merged: boolean;
  readonly htmlUrl: string;
}

/** The low-level fetch, split out so tests can stub it without network. */
export type FetchPullRequest = (owner: string, repo: string, number: number) => Promise<PullRequestState>;

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
  private readonly fetchPr: FetchPullRequest;
  private readonly opts: GithubClientOptions;

  constructor(fetchPr: FetchPullRequest, opts: GithubClientOptions = {}) {
    this.fetchPr = fetchPr;
    this.opts = opts;
  }

  async fetchPrMerged(repo: string, pullNumber: number): Promise<PrMergedSnapshot> {
    const [owner, name] = splitRepo(repo);
    const now = this.opts.now ?? Date.now;
    try {
      const pr = await withRetry(() => this.fetchPr(owner, name, pullNumber), {
        retries: this.opts.retries ?? 3,
        ...(this.opts.sleep ? { sleep: this.opts.sleep } : {}),
      });
      return { observed: true, merged: pr.merged, url: pr.htmlUrl, observedAt: now() };
    } catch (error) {
      (this.opts.logger ?? defaultLogger).warn(
        { repo, number: pullNumber, error: error instanceof Error ? error.message : String(error) },
        'github pr unobserved after retries',
      );
      return { observed: false };
    }
  }
}

/** Wire a real client from a read-only token. */
export function octokitFetchPullRequest(token: string): FetchPullRequest {
  const octokit = new Octokit({ auth: token });
  return async (owner, repo, pullNumber) => {
    const res = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
    return { merged: res.data.merged === true, htmlUrl: res.data.html_url };
  };
}
