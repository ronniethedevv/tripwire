import type { Condition, ConditionType } from '../core/index.js';

export interface ConditionFlags {
  readonly condition?: string | undefined;
  readonly repo?: string | undefined;
  readonly number?: string | undefined;
  readonly ref?: string | undefined;
  readonly needle?: string | undefined;
  readonly repos?: string | undefined;
  readonly threshold?: string | undefined;
  readonly at?: string | undefined;
}

const ALIASES: Readonly<Record<string, ConditionType>> = {
  pr: 'github.pr_merged',
  pr_merged: 'github.pr_merged',
  issue: 'github.issue_closed',
  issue_closed: 'github.issue_closed',
  checks: 'github.checks_green',
  checks_green: 'github.checks_green',
  usage: 'usage.count_at_least',
  count: 'usage.count_at_least',
  time: 'time.after',
};

function req(value: string | undefined, name: string): string {
  if (value === undefined || value === '') {
    throw new Error(`--${name} is required`);
  }
  return value;
}

function reqInt(value: string | undefined, name: string): number {
  const n = Number(req(value, name));
  if (!Number.isInteger(n)) {
    throw new Error(`--${name} must be an integer`);
  }
  return n;
}

/** Build a Condition from CLI flags. Pure; throws a clear error on bad input. */
export function conditionFromFlags(flags: ConditionFlags): Condition {
  const key = flags.condition ?? '';
  const type = ALIASES[key];
  if (type === undefined) {
    throw new Error(`unknown --condition "${key}" (use pr | issue | checks | usage | time)`);
  }
  switch (type) {
    case 'github.pr_merged':
    case 'github.issue_closed':
      return { type, params: { repo: req(flags.repo, 'repo'), number: reqInt(flags.number, 'number') } };
    case 'github.checks_green':
      return { type, params: { repo: req(flags.repo, 'repo'), ref: req(flags.ref, 'ref') } };
    case 'usage.count_at_least':
      return {
        type,
        params: {
          needle: req(flags.needle, 'needle'),
          repos: req(flags.repos, 'repos')
            .split(',')
            .map((r) => r.trim())
            .filter((r) => r.length > 0),
          threshold: reqInt(flags.threshold, 'threshold'),
        },
      };
    case 'time.after':
      return { type, params: { at: req(flags.at, 'at') } };
  }
}
