import type { Condition, Loop, LoopKind, WaiterType } from './types.js';

/** Everything needed to draft a loop. `id` and `now` are supplied by the caller (pure). */
export interface NewLoopInput {
  readonly id: string;
  readonly roomId: string;
  readonly kind: LoopKind;
  readonly title: string;
  readonly reason: string;
  readonly waiterType: WaiterType;
  readonly waiterHandle: string;
  readonly ownerHandle: string;
  readonly createdBy: string;
  readonly condition: Condition;
  readonly sourceRef?: string | null;
  readonly expiresAt?: number | null;
}

/**
 * Build a new loop. A `decision` starts `proposed` and needs human confirmation
 * to arm. An `agent_block` whose waiter is its own creator arms immediately,
 * because arming it only wakes that same agent.
 */
export function createLoop(input: NewLoopInput, now: number): Loop {
  const loop: Loop = {
    id: input.id,
    roomId: input.roomId,
    kind: input.kind,
    title: input.title,
    reason: input.reason,
    waiterType: input.waiterType,
    waiterHandle: input.waiterHandle,
    ownerHandle: input.ownerHandle,
    sourceRef: input.sourceRef ?? null,
    status: 'proposed',
    createdBy: input.createdBy,
    createdAt: now,
    armedBy: null,
    armedAt: null,
    firedAt: null,
    closedAt: null,
    closeReason: null,
    expiresAt: input.expiresAt ?? null,
    condition: input.condition,
  };

  if (input.kind === 'agent_block' && input.waiterHandle === input.createdBy) {
    return { ...loop, status: 'armed', armedBy: input.createdBy, armedAt: now };
  }
  return loop;
}
