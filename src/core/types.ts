// Core domain types for Tripwire loops. Pure data — no I/O, no clock, no zod.
// The per-condition params schemas live in src/conditions (validated there).

// Const tuples are the single source of truth: the union types derive from them,
// and the store's zod row schemas reuse the same arrays, so they can't drift.
export const LOOP_KINDS = ['decision', 'agent_block'] as const;
export type LoopKind = (typeof LOOP_KINDS)[number];

export const WAITER_TYPES = ['human', 'agent'] as const;
export type WaiterType = (typeof WAITER_TYPES)[number];

export const LOOP_STATUSES = ['proposed', 'armed', 'fired', 'closed'] as const;
export type LoopStatus = (typeof LOOP_STATUSES)[number];

export const CLOSE_REASONS = ['resolved', 'cancelled', 'expired'] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

/** The result of evaluating a condition. `unobserved` is never treated as true or false. */
export const CONDITION_STATES = ['true', 'false', 'unobserved'] as const;
export type ConditionState = (typeof CONDITION_STATES)[number];

export const CONDITION_TYPES = [
  'github.pr_merged',
  'github.issue_closed',
  'github.checks_green',
  'usage.count_at_least',
  'time.after',
] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

/** A loop's unblock condition: its type tag plus opaque params (shape checked in src/conditions). */
export interface Condition {
  readonly type: ConditionType;
  readonly params: Readonly<Record<string, unknown>>;
}

/** An open loop: something waiting, who waits, the condition, the reason, an owner. */
export interface Loop {
  readonly id: string;
  readonly roomId: string;
  readonly kind: LoopKind;
  readonly title: string;
  readonly reason: string;
  readonly waiterType: WaiterType;
  readonly waiterHandle: string;
  readonly ownerHandle: string;
  readonly sourceRef: string | null;
  readonly status: LoopStatus;
  readonly createdBy: string;
  readonly createdAt: number;
  readonly armedBy: string | null;
  readonly armedAt: number | null;
  readonly firedAt: number | null;
  readonly closedAt: number | null;
  readonly closeReason: CloseReason | null;
  readonly expiresAt: number | null;
  readonly condition: Condition;
}

/** A requested state change. `fire` is the watcher's alone; all timestamps are epoch ms, passed in. */
export type LoopAction =
  | { readonly type: 'arm'; readonly by: string; readonly at: number }
  | { readonly type: 'fire'; readonly at: number }
  | { readonly type: 'resolve'; readonly by: string; readonly at: number }
  | { readonly type: 'cancel'; readonly by: string; readonly at: number }
  | { readonly type: 'expire'; readonly at: number };

export type LoopActionType = LoopAction['type'];
