import { describe, expect, it } from 'vitest';
import {
  evaluateChecksGreen,
  parseChecksGreenParams,
  type ChecksGreenParams,
  type ChecksGreenSnapshot,
} from '../../src/conditions/index.js';

const params: ChecksGreenParams = { repo: 'owner/repo', ref: 'main' };

describe('parseChecksGreenParams', () => {
  it('accepts a repo and a ref (branch or sha)', () => {
    expect(parseChecksGreenParams({ repo: 'owner/repo', ref: 'main' })).toEqual(params);
  });

  it('rejects a missing ref', () => {
    expect(() => parseChecksGreenParams({ repo: 'owner/repo', ref: '' })).toThrow();
  });
});

describe('evaluateChecksGreen', () => {
  const observed = (allGreen: boolean): ChecksGreenSnapshot => ({
    observed: true,
    allGreen,
    url: 'https://github.com/owner/repo/commits/main',
    observedAt: 100,
  });

  it('is true when all checks are green', () => {
    expect(evaluateChecksGreen(params, observed(true)).state).toBe('true');
  });

  it('is false when not all checks are green', () => {
    expect(evaluateChecksGreen(params, observed(false)).state).toBe('false');
  });

  it('is unobserved when the source could not be read', () => {
    expect(evaluateChecksGreen(params, { observed: false }).state).toBe('unobserved');
  });
});
