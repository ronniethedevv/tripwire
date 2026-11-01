import { describe, expect, it } from 'vitest';
import {
  evaluateIssueClosed,
  parseIssueClosedParams,
  type IssueClosedParams,
  type IssueClosedSnapshot,
} from '../../src/conditions/index.js';

const params: IssueClosedParams = { repo: 'owner/repo', number: 7 };

describe('parseIssueClosedParams', () => {
  it('accepts a well-formed repo and number', () => {
    expect(parseIssueClosedParams({ repo: 'owner/repo', number: 7 })).toEqual(params);
  });

  it('rejects a malformed repo', () => {
    expect(() => parseIssueClosedParams({ repo: 'nope', number: 7 })).toThrow();
  });
});

describe('evaluateIssueClosed', () => {
  const observed = (closed: boolean): IssueClosedSnapshot => ({
    observed: true,
    closed,
    url: 'https://github.com/owner/repo/issues/7',
    observedAt: 100,
  });

  it('is true when the issue is closed', () => {
    expect(evaluateIssueClosed(params, observed(true)).state).toBe('true');
  });

  it('is false when the issue is still open', () => {
    expect(evaluateIssueClosed(params, observed(false)).state).toBe('false');
  });

  it('is unobserved when the source could not be read', () => {
    const result = evaluateIssueClosed(params, { observed: false });
    expect(result.state).toBe('unobserved');
    expect(result.evidence).toBeNull();
  });
});
