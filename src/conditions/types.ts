import type { ConditionState } from '../core/index.js';

/** A link + timestamp proving what was observed (I4). Null only when unobserved. */
export interface Evidence {
  readonly url: string;
  readonly observedAt: number;
  readonly description: string;
}

/** The result of evaluating a condition against a source snapshot. */
export interface Evaluation {
  readonly state: ConditionState;
  readonly evidence: Evidence | null;
}
