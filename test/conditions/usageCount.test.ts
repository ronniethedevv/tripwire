import { describe, expect, it } from 'vitest';
import {
  evaluateUsageCount,
  parseUsageCountParams,
  type UsageCountParams,
  type UsageCountSnapshot,
} from '../../src/conditions/index.js';

const params: UsageCountParams = { needle: 'move_ref', repos: ['owner/repo'], threshold: 3 };

describe('parseUsageCountParams', () => {
  it('accepts needle, repos and threshold', () => {
    expect(parseUsageCountParams({ needle: 'move_ref', repos: ['owner/repo'], threshold: 3 })).toEqual(params);
  });

  it('rejects an empty repos list', () => {
    expect(() => parseUsageCountParams({ needle: 'x', repos: [], threshold: 1 })).toThrow();
  });
});

describe('evaluateUsageCount', () => {
  const observed = (count: number): UsageCountSnapshot => ({
    observed: true,
    count,
    url: 'https://github.com/search?q=move_ref&type=code',
    observedAt: 100,
  });

  it('is true at or above the threshold', () => {
    expect(evaluateUsageCount(params, observed(3)).state).toBe('true');
    expect(evaluateUsageCount(params, observed(5)).state).toBe('true');
  });

  it('is false below the threshold', () => {
    expect(evaluateUsageCount(params, observed(2)).state).toBe('false');
  });

  it('is unobserved when the count could not be read', () => {
    expect(evaluateUsageCount(params, { observed: false }).state).toBe('unobserved');
  });
});
