import { InvalidTransition } from './errors.js';
import type { Loop, LoopAction, LoopActionType, LoopStatus } from './types.js';

// The only legal transitions (architecture.md):
//   proposed --arm--> armed --fire--> fired --resolve--> closed(resolved)
//   proposed --cancel--> closed(cancelled)
//   armed    --cancel|expire--> closed(cancelled|expired)
// `watching` is not a stored state: an armed loop is being watched.
const ALLOWED_FROM: Record<LoopActionType, readonly LoopStatus[]> = {
  arm: ['proposed'],
  fire: ['armed'],
  resolve: ['fired'],
  cancel: ['proposed', 'armed'],
  expire: ['armed'],
};

/** Whether `action` is legal from the loop's current status (no throw). */
export function canApply(loop: Loop, action: LoopActionType): boolean {
  return ALLOWED_FROM[action].includes(loop.status);
}

/**
 * Apply a state change, returning a new Loop. Pure: never mutates the input,
 * never reads the clock (every timestamp is carried on the action).
 * Throws InvalidTransition on any illegal move.
 */
export function applyTransition(loop: Loop, action: LoopAction): Loop {
  if (!canApply(loop, action.type)) {
    throw new InvalidTransition(loop.status, action.type);
  }
  switch (action.type) {
    case 'arm':
      return { ...loop, status: 'armed', armedBy: action.by, armedAt: action.at };
    case 'fire':
      return { ...loop, status: 'fired', firedAt: action.at };
    case 'resolve':
      return { ...loop, status: 'closed', closedAt: action.at, closeReason: 'resolved' };
    case 'cancel':
      return { ...loop, status: 'closed', closedAt: action.at, closeReason: 'cancelled' };
    case 'expire':
      return { ...loop, status: 'closed', closedAt: action.at, closeReason: 'expired' };
  }
}
