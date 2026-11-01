import { z } from 'zod';
import type { Evaluation } from './types.js';

export const timeAfterParamsSchema = z.object({ at: z.string().datetime() });
export type TimeAfterParams = z.infer<typeof timeAfterParamsSchema>;

export function parseTimeAfterParams(params: unknown): TimeAfterParams {
  return timeAfterParamsSchema.parse(params);
}

/**
 * Pure. The clock is always observable, so this is only ever true or false —
 * never unobserved. `now` is passed in (no clock read here).
 */
export function evaluateTimeAfter(params: TimeAfterParams, now: number): Evaluation {
  const at = Date.parse(params.at);
  if (now >= at) {
    return { state: 'true', evidence: { url: null, observedAt: now, description: `the time ${params.at} has passed` } };
  }
  return { state: 'false', evidence: { url: null, observedAt: now, description: `waiting until ${params.at}` } };
}
