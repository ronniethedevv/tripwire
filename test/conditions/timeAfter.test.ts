import { describe, expect, it } from 'vitest';
import { evaluateTimeAfter, parseTimeAfterParams } from '../../src/conditions/index.js';

const at = '2026-12-01T00:00:00.000Z';
const atMs = Date.parse(at);

describe('parseTimeAfterParams', () => {
  it('accepts an ISO 8601 datetime', () => {
    expect(parseTimeAfterParams({ at })).toEqual({ at });
  });

  it('rejects a non-datetime', () => {
    expect(() => parseTimeAfterParams({ at: 'next month' })).toThrow();
  });
});

describe('evaluateTimeAfter', () => {
  it('is false before the time', () => {
    const result = evaluateTimeAfter({ at }, atMs - 1000);
    expect(result.state).toBe('false');
    expect(result.evidence?.url).toBeNull();
  });

  it('is true at or after the time', () => {
    expect(evaluateTimeAfter({ at }, atMs).state).toBe('true');
    expect(evaluateTimeAfter({ at }, atMs + 1000).state).toBe('true');
  });

  it('true evidence has no url but carries a description and timestamp', () => {
    expect(evaluateTimeAfter({ at }, atMs + 1000).evidence).toEqual({
      url: null,
      observedAt: atMs + 1000,
      description: `the time ${at} has passed`,
    });
  });
});
