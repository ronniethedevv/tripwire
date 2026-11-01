import { z } from 'zod';
import type { Evaluation } from './types.js';

export const prMergedParamsSchema = z.object({
  repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'repo must be "owner/name"'),
  number: z.number().int().positive(),
});
export type PrMergedParams = z.infer<typeof prMergedParamsSchema>;

/** What the GitHub source observed for a PR, or that it could not observe it. */
export type PrMergedSnapshot =
  | { readonly observed: true; readonly merged: boolean; readonly url: string; readonly observedAt: number }
  | { readonly observed: false };

export function parsePrMergedParams(params: unknown): PrMergedParams {
  return prMergedParamsSchema.parse(params);
}

/**
 * Pure. Maps a snapshot to true/false/unobserved. An unobserved snapshot yields
 * `unobserved` with no evidence — never `false` (I2). No I/O, no clock.
 */
export function evaluatePrMerged(params: PrMergedParams, snapshot: PrMergedSnapshot): Evaluation {
  if (!snapshot.observed) {
    return { state: 'unobserved', evidence: null };
  }
  const where = `PR #${params.number} in ${params.repo}`;
  return snapshot.merged
    ? {
        state: 'true',
        evidence: { url: snapshot.url, observedAt: snapshot.observedAt, description: `${where} is merged` },
      }
    : {
        state: 'false',
        evidence: { url: snapshot.url, observedAt: snapshot.observedAt, description: `${where} is not merged yet` },
      };
}
