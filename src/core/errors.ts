import type { LoopStatus } from './types.js';

/** Base class for every typed Tripwire error. No silent catches anywhere. */
export class TripwireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown when a loop state change is not allowed from the loop's current status. */
export class InvalidTransition extends TripwireError {
  readonly from: LoopStatus;
  readonly action: string;

  constructor(from: LoopStatus, action: string) {
    super(`Cannot '${action}' a loop in status '${from}'`);
    this.from = from;
    this.action = action;
  }
}

/** Thrown when an actor is not permitted to perform an action (e.g. a non-human arming a decision). */
export class NotAuthorized extends TripwireError {}

/** Thrown when a loop id does not exist. */
export class LoopNotFound extends TripwireError {
  readonly loopId: string;

  constructor(loopId: string) {
    super(`No loop with id '${loopId}'`);
    this.loopId = loopId;
  }
}
