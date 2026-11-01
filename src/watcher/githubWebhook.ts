import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verify } from '@octokit/webhooks-methods';
import { Hono } from 'hono';
import { z } from 'zod';
import { logger as defaultLogger, type Logger } from '../logger.js';
import type { Store } from '../store/index.js';

/** A GitHub event reduced to what the evaluator indexes on: repo + the number/ref it concerns. */
export interface NormalizedGithubEvent {
  readonly type: string;
  readonly repo: string;
  readonly numberOrRef: string;
}

const withRepo = z.object({ repository: z.object({ full_name: z.string() }) });
const prPayload = withRepo.extend({ number: z.number() });
const issuePayload = withRepo.extend({ issue: z.object({ number: z.number() }) });
const checkSuitePayload = withRepo.extend({ check_suite: z.object({ head_sha: z.string() }) });
const checkRunPayload = withRepo.extend({ check_run: z.object({ head_sha: z.string() }) });

/**
 * Reduce a raw GitHub webhook to the fields the conditions care about, or null
 * for an event type (or shape) we don't index. Pure — no I/O. `safeParse` keeps
 * a malformed payload from throwing: it is simply not indexed.
 */
export function normalizeGithubEvent(eventType: string, payload: unknown): NormalizedGithubEvent | null {
  switch (eventType) {
    case 'pull_request': {
      const p = prPayload.safeParse(payload);
      return p.success
        ? { type: eventType, repo: p.data.repository.full_name, numberOrRef: String(p.data.number) }
        : null;
    }
    case 'issues': {
      const p = issuePayload.safeParse(payload);
      return p.success
        ? { type: eventType, repo: p.data.repository.full_name, numberOrRef: String(p.data.issue.number) }
        : null;
    }
    case 'check_suite': {
      const p = checkSuitePayload.safeParse(payload);
      return p.success
        ? { type: eventType, repo: p.data.repository.full_name, numberOrRef: p.data.check_suite.head_sha }
        : null;
    }
    case 'check_run': {
      const p = checkRunPayload.safeParse(payload);
      return p.success
        ? { type: eventType, repo: p.data.repository.full_name, numberOrRef: p.data.check_run.head_sha }
        : null;
    }
    default:
      return null;
  }
}

export interface WebhookDeps {
  readonly secret: string;
  readonly store: Store;
  readonly evidenceDir: string;
  readonly now?: () => number;
  readonly logger?: Logger;
  /** Deviation trigger, invoked fire-and-forget after a new event is stored (keeps I3). */
  readonly onIndexed?: (target: { repo: string; numberOrRef: string }) => void;
}

// Delivery ids become a filename; keep them to a safe charset (defence in depth,
// even though the signature is already verified before we use it).
const SAFE_DELIVERY = /^[A-Za-z0-9._-]+$/;

/**
 * The GitHub webhook endpoint. It validates the signature, normalises and stores
 * the event (deduped on delivery id), and returns — nothing else (I3). No GitHub
 * calls, no room posts, no model work in the request; the evaluator does all
 * checking later off the events table.
 */
export function createWebhookApp(deps: WebhookDeps): Hono {
  const now = deps.now ?? Date.now;
  const log = deps.logger ?? defaultLogger;
  const eventsDir = join(deps.evidenceDir, 'events');
  mkdirSync(eventsDir, { recursive: true });

  const app = new Hono();

  app.post('/webhooks/github', async (c) => {
    const signature = c.req.header('x-hub-signature-256');
    const eventType = c.req.header('x-github-event');
    const delivery = c.req.header('x-github-delivery');
    if (!signature || !eventType || !delivery || !SAFE_DELIVERY.test(delivery)) {
      return c.json({ error: 'missing or invalid required headers' }, 400);
    }

    const body = await c.req.text();
    if (!(await verify(deps.secret, body, signature))) {
      log.warn({ delivery, event: eventType }, 'webhook signature rejected');
      return c.json({ error: 'invalid signature' }, 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return c.json({ error: 'invalid json' }, 400);
    }

    const normalized = normalizeGithubEvent(eventType, payload);
    if (normalized === null) {
      return c.json({ ok: true, indexed: false }, 200);
    }

    // Storage segregation: the raw payload goes to a file, referenced by path.
    const payloadPath = join(eventsDir, `${delivery}.json`);
    await writeFile(payloadPath, body, 'utf8');

    const result = deps.store.insertEvent({
      source: 'github',
      type: eventType,
      repo: normalized.repo,
      numberOrRef: normalized.numberOrRef,
      dedupeKey: delivery,
      payloadPath,
      receivedAt: now(),
    });
    log.info(
      { delivery, event: eventType, repo: normalized.repo, ref: normalized.numberOrRef, result },
      'webhook stored',
    );
    // Deviation trigger: schedule after the response, never awaited, so the
    // request only validates, stores and returns (I3).
    if (result === 'stored' && deps.onIndexed !== undefined) {
      const onIndexed = deps.onIndexed;
      const target = { repo: normalized.repo, numberOrRef: normalized.numberOrRef };
      queueMicrotask(() => {
        onIndexed(target);
      });
    }
    return c.json({ ok: true, indexed: true, duplicate: result === 'duplicate' }, 200);
  });

  return app;
}
