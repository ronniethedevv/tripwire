import {
  evaluateChecksGreen,
  evaluateIssueClosed,
  evaluatePrMerged,
  evaluateTimeAfter,
  evaluateUsageCount,
  parseChecksGreenParams,
  parseIssueClosedParams,
  parsePrMergedParams,
  parseTimeAfterParams,
  parseUsageCountParams,
  type Evaluation,
} from '../conditions/index.js';
import type { Loop } from '../core/index.js';
import { logger as defaultLogger, type Logger } from '../logger.js';
import { renderAgentWakeNote, renderReopenCard, type RoomPoster } from '../room/index.js';
import type { GithubClient } from '../sources/index.js';
import type { Store } from '../store/index.js';

/** The repo + number/ref a webhook event concerns. */
export interface EventTarget {
  readonly repo: string;
  readonly numberOrRef: string;
}

export type CheckOutcome = 'fired' | 'already_fired' | 'not_true' | 'unobserved';

/** Whether an armed loop's condition is about the thing this event touched. Pure. */
export function loopMatchesTarget(loop: Loop, target: EventTarget): boolean {
  const params = loop.condition.params;
  const repo = typeof params['repo'] === 'string' ? params['repo'] : null;
  if (repo === null || repo !== target.repo) {
    return false;
  }
  const number = params['number'];
  const ref = params['ref'];
  const loopTarget =
    typeof number === 'number' ? String(number) : typeof ref === 'string' ? ref : null;
  return loopTarget !== null && loopTarget === target.numberOrRef;
}

export interface EvaluatorDeps {
  readonly store: Store;
  readonly github: GithubClient;
  readonly poster: RoomPoster;
  readonly now?: () => number;
  readonly logger?: Logger;
  readonly zone?: string;
}

/**
 * Decides when an armed loop fires. The webhook (deviation) and the heartbeat
 * both route through here; every fire is preceded by a fresh live re-check, and
 * the fire-once gate is the store's unique firing row (I1). Never fires on
 * unobserved data (I2); every fire carries evidence (I4).
 */
export class Evaluator {
  private readonly deps: EvaluatorDeps;

  constructor(deps: EvaluatorDeps) {
    this.deps = deps;
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private get log(): Logger {
    return this.deps.logger ?? defaultLogger;
  }

  /** Live-fetch the loop's condition and evaluate it. An unwired type reads as unobserved. */
  private async observe(loop: Loop): Promise<Evaluation> {
    switch (loop.condition.type) {
      case 'github.pr_merged': {
        const params = parsePrMergedParams(loop.condition.params);
        const snapshot = await this.deps.github.fetchPrMerged(params.repo, params.number);
        return evaluatePrMerged(params, snapshot);
      }
      case 'github.issue_closed': {
        const params = parseIssueClosedParams(loop.condition.params);
        const snapshot = await this.deps.github.fetchIssueClosed(params.repo, params.number);
        return evaluateIssueClosed(params, snapshot);
      }
      case 'github.checks_green': {
        const params = parseChecksGreenParams(loop.condition.params);
        const snapshot = await this.deps.github.fetchChecksGreen(params.repo, params.ref);
        return evaluateChecksGreen(params, snapshot);
      }
      case 'usage.count_at_least': {
        const params = parseUsageCountParams(loop.condition.params);
        const snapshot = await this.deps.github.fetchUsageCount(params.needle, params.repos);
        return evaluateUsageCount(params, snapshot);
      }
      case 'time.after': {
        const params = parseTimeAfterParams(loop.condition.params);
        return evaluateTimeAfter(params, this.now());
      }
    }
  }

  /** Re-check one armed loop live and fire it exactly once if the condition is true. */
  async checkLoop(loop: Loop): Promise<CheckOutcome> {
    const evaluation = await this.observe(loop);
    if (evaluation.state === 'unobserved') {
      return 'unobserved';
    }
    if (evaluation.state !== 'true' || evaluation.evidence === null) {
      return 'not_true';
    }

    // Claim the fire atomically first (I1), then post. A losing racer gets
    // 'already_fired' and never posts, so the card appears at most once.
    const result = this.deps.store.recordFiring({ loopId: loop.id, firedAt: this.now() });
    if (result === 'already_fired') {
      return 'already_fired';
    }

    const content =
      loop.kind === 'agent_block'
        ? renderAgentWakeNote(loop, evaluation.evidence)
        : renderReopenCard(loop, evaluation.evidence, this.deps.zone ?? 'UTC');
    try {
      const ref = await this.deps.poster.post(loop.roomId, content);
      this.deps.store.setFiringMessageRef(loop.id, ref.id);
    } catch (error) {
      this.log.error(
        { loopId: loop.id, error: error instanceof Error ? error.message : String(error) },
        'loop fired but the room post failed',
      );
    }
    this.log.info({ loopId: loop.id, kind: loop.kind }, 'loop fired');
    return 'fired';
  }

  /** Deviation trigger: re-check the armed loops that match an incoming event. */
  async onEvent(target: EventTarget): Promise<void> {
    const loops = this.deps.store.listLoops('armed').filter((l) => loopMatchesTarget(l, target));
    for (const loop of loops) {
      await this.checkLoop(loop);
    }
  }

  /** Heartbeat: re-check every armed loop, in case a webhook was missed. */
  async runHeartbeat(): Promise<void> {
    for (const loop of this.deps.store.listLoops('armed')) {
      await this.checkLoop(loop);
    }
  }
}

/** Start the periodic heartbeat. Returns the timer; it is unref'd so it never holds the process open. */
export function startHeartbeat(
  evaluator: Evaluator,
  intervalMs: number,
  log: Logger = defaultLogger,
): NodeJS.Timeout {
  const timer = setInterval(() => {
    void evaluator.runHeartbeat().catch((error: unknown) => {
      log.error({ error: error instanceof Error ? error.message : String(error) }, 'heartbeat failed');
    });
  }, intervalMs);
  timer.unref();
  return timer;
}
