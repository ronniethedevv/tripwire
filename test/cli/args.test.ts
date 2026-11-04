import { describe, expect, it } from 'vitest';
import { conditionFromFlags } from '../../src/cli/args.js';

describe('conditionFromFlags', () => {
  it('builds github.pr_merged from pr', () => {
    expect(conditionFromFlags({ condition: 'pr', repo: 'owner/repo', number: '3' })).toEqual({
      type: 'github.pr_merged',
      params: { repo: 'owner/repo', number: 3 },
    });
  });

  it('builds github.issue_closed from issue', () => {
    expect(conditionFromFlags({ condition: 'issue', repo: 'owner/repo', number: '7' })).toEqual({
      type: 'github.issue_closed',
      params: { repo: 'owner/repo', number: 7 },
    });
  });

  it('builds github.checks_green from checks', () => {
    expect(conditionFromFlags({ condition: 'checks', repo: 'owner/repo', ref: 'main' })).toEqual({
      type: 'github.checks_green',
      params: { repo: 'owner/repo', ref: 'main' },
    });
  });

  it('builds usage.count_at_least from usage, splitting repos', () => {
    expect(
      conditionFromFlags({ condition: 'usage', needle: 'move_ref', repos: 'a/b, c/d', threshold: '3' }),
    ).toEqual({
      type: 'usage.count_at_least',
      params: { needle: 'move_ref', repos: ['a/b', 'c/d'], threshold: 3 },
    });
  });

  it('builds time.after from time', () => {
    expect(conditionFromFlags({ condition: 'time', at: '2026-12-01T00:00:00Z' })).toEqual({
      type: 'time.after',
      params: { at: '2026-12-01T00:00:00Z' },
    });
  });

  it('rejects an unknown condition', () => {
    expect(() => conditionFromFlags({ condition: 'wat' })).toThrow(/unknown --condition/);
  });

  it('rejects a missing required flag', () => {
    expect(() => conditionFromFlags({ condition: 'pr', repo: 'owner/repo' })).toThrow(/--number/);
    expect(() => conditionFromFlags({ condition: 'pr', number: '3' })).toThrow(/--repo/);
  });

  it('rejects a non-integer number', () => {
    expect(() => conditionFromFlags({ condition: 'pr', repo: 'owner/repo', number: 'x' })).toThrow(/integer/);
  });
});
