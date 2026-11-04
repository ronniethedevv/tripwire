import type { ConditionState } from '../core/index.js';

/** A link + timestamp proving what was observed (I4). `url` is null for sourceless
 * conditions like the clock, where the timestamp itself is the evidence. */
export interface Evidence {
  readonly url: string | null;
  readonly observedAt: number;
  readonly description: string;
}

/** The result of evaluating a condition against a source snapshot. */
export interface Evaluation {
  readonly state: ConditionState;
  readonly evidence: Evidence | null;
}
