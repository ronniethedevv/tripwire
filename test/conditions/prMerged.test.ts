import { describe, expect, it } from 'vitest';
import {
  evaluatePrMerged,
  parsePrMergedParams,
  type PrMergedParams,
  type PrMergedSnapshot,
} from '../../src/conditions/index.js';

const params: PrMergedParams = { repo: 'owner/repo', number: 3 };

describe('parsePrMergedParams', () => {
  it('accepts a well-formed repo and number', () => {
    expect(parsePrMergedParams({ repo: 'owner/repo', number: 3 })).toEqual(params);
  });

  it('rejects a malformed repo', () => {
    expect(() => parsePrMergedParams({ repo: 'not-a-repo', number: 3 })).toThrow();
  });

  it('rejects a non-positive / non-integer number', () => {
    expect(() => parsePrMergedParams({ repo: 'owner/repo', number: 0 })).toThrow();
    expect(() => parsePrMergedParams({ repo: 'owner/repo', number: 1.5 })).toThrow();
  });
});

describe('evaluatePrMerged', () => {
  it('is true with evidence when the PR is merged', () => {
    const snapshot: PrMergedSnapshot = {
      observed: true,
      merged: true,
      url: 'https://github.com/owner/repo/pull/3',
      observedAt: 100,
    };
    const result = evaluatePrMerged(params, snapshot);
    expect(result.state).toBe('true');
    expect(result.evidence).toEqual({
      url: 'https://github.com/owner/repo/pull/3',
      observedAt: 100,
      description: 'PR #3 in owner/repo is merged',
    });
  });

  it('is false with evidence when the PR is observed but not merged', () => {
    const snapshot: PrMergedSnapshot = {
      observed: true,
      merged: false,
      url: 'https://github.com/owner/repo/pull/3',
      observedAt: 100,
    };
    const result = evaluatePrMerged(params, snapshot);
    expect(result.state).toBe('false');
    expect(result.evidence?.url).toBe('https://github.com/owner/repo/pull/3');
  });

  it('is unobserved with no evidence when the source could not be read (I2)', () => {
    const result = evaluatePrMerged(params, { observed: false });
    expect(result.state).toBe('unobserved');
    expect(result.evidence).toBeNull();
  });
});
