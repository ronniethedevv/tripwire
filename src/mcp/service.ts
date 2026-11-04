import { randomUUID } from 'node:crypto';
import { parsePrMergedParams } from '../conditions/index.js';
import {
  applyTransition,
  createLoop,
  LoopNotFound,
  NotAuthorized,
  type Condition,
  type Loop,
  type LoopKind,
  type LoopStatus,
  type WaiterType,
} from '../core/index.js';
import type { Store, StoredFiring } from '../store/index.js';

export interface LoopServiceDeps {
  readonly store: Store;
  /** Handles permitted to arm or cancel a decision loop (HUMAN_HANDLES). */
  readonly humanHandles: ReadonlySet<string>;
  readonly now?: () => number;
  readonly idFactory?: () => string;
}

export interface ProposeInput {
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

export interface ListFilter {
  readonly status?: LoopStatus;
  readonly roomId?: string;
}

export interface LoopExplanation {
  readonly loop: Loop;
  readonly firing: StoredFiring | null;
}

/**
 * The loop operations behind the MCP tools. Enforces access (only a human may
 * arm or cancel a decision loop) and the state machine, and writes an audit row
 * for every change (I7). It never fires a loop — only the watcher does (I6).
 */
export class LoopService {
  private readonly deps: LoopServiceDeps;

  constructor(deps: LoopServiceDeps) {
    this.deps = deps;
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private newId(): string {
    return (this.deps.idFactory ?? randomUUID)();
  }

  private mustGet(loopId: string): Loop {
    const loop = this.deps.store.getLoop(loopId);
    if (loop === null) {
      throw new LoopNotFound(loopId);
    }
    return loop;
  }

  private requireHumanForDecision(loop: Loop, actor: string, action: string): void {
    if (loop.kind === 'decision' && !this.deps.humanHandles.has(actor)) {
      throw new NotAuthorized(`${action} on a decision loop requires a human; '${actor}' is not in HUMAN_HANDLES`);
    }
  }

  propose(input: ProposeInput): Loop {
    // Validate the condition params at the boundary so a malformed loop is never stored.
    if (input.condition.type === 'github.pr_merged') {
      parsePrMergedParams(input.condition.params);
    }
    const loop = createLoop(
      {
        id: this.newId(),
        roomId: input.roomId,
        kind: input.kind,
        title: input.title,
        reason: input.reason,
        waiterType: input.waiterType,
        waiterHandle: input.waiterHandle,
        ownerHandle: input.ownerHandle,
        createdBy: input.createdBy,
        condition: input.condition,
        sourceRef: input.sourceRef ?? null,
        expiresAt: input.expiresAt ?? null,
      },
      this.now(),
    );
    this.deps.store.insertLoop(loop);
    this.deps.store.appendAudit({
      at: this.now(),
      actor: input.createdBy,
      action: loop.status === 'armed' ? 'propose_armed' : 'propose',
      loopId: loop.id,
    });
    return loop;
  }

  arm(loopId: string, confirmedBy: string, confirmMessageRef?: string | null): Loop {
    const loop = this.mustGet(loopId);
    this.requireHumanForDecision(loop, confirmedBy, 'arm');
    const armed = applyTransition(loop, { type: 'arm', by: confirmedBy, at: this.now() });
    this.deps.store.updateLoop(armed);
    this.deps.store.appendAudit({
      at: this.now(),
      actor: confirmedBy,
      action: 'arm',
      loopId,
      detail: confirmMessageRef != null ? { confirmMessageRef } : null,
    });
    return armed;
  }

  cancel(loopId: string, by: string, reason: string): Loop {
    const loop = this.mustGet(loopId);
    this.requireHumanForDecision(loop, by, 'cancel');
    const closed = applyTransition(loop, { type: 'cancel', by, at: this.now() });
    this.deps.store.updateLoop(closed);
    this.deps.store.appendAudit({ at: this.now(), actor: by, action: 'cancel', loopId, detail: { reason } });
    return closed;
  }

  resolve(loopId: string, by: string, outcome: string): Loop {
    const loop = this.mustGet(loopId);
    const closed = applyTransition(loop, { type: 'resolve', by, at: this.now() });
    this.deps.store.updateLoop(closed);
    this.deps.store.appendAudit({ at: this.now(), actor: by, action: 'resolve', loopId, detail: { outcome } });
    return closed;
  }

  list(filter: ListFilter = {}): Loop[] {
    const loops = this.deps.store.listLoops(filter.status);
    return filter.roomId === undefined ? loops : loops.filter((l) => l.roomId === filter.roomId);
  }

  explain(loopId: string): LoopExplanation {
    return { loop: this.mustGet(loopId), firing: this.deps.store.getFiring(loopId) };
  }
}
