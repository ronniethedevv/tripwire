import type { Condition } from '../core/index.js';

/** A condition in plain words, for proposal/armed/ledger cards. Pure. */
export function describeCondition(condition: Condition): string {
  const p = condition.params;
  const v = (key: string): string => String(p[key]);
  switch (condition.type) {
    case 'github.pr_merged':
      return `${v('repo')} PR #${v('number')} merges`;
    case 'github.issue_closed':
      return `${v('repo')} issue #${v('number')} closes`;
    case 'github.checks_green':
      return `checks go green on ${v('repo')}@${v('ref')}`;
    case 'usage.count_at_least':
      return `${v('needle')} is used at least ${v('threshold')}x across the watched repos`;
    case 'time.after':
      return `the clock passes ${v('at')}`;
  }
}
