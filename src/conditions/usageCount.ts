import { z } from 'zod';
import type { Evaluation } from './types.js';

export const usageCountParamsSchema = z.object({
  needle: z.string().min(1),
  repos: z.array(z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'repo must be "owner/name"')).min(1),
  threshold: z.number().int().positive(),
});
export type UsageCountParams = z.infer<typeof usageCountParamsSchema>;

export type UsageCountSnapshot =
  | { readonly observed: true; readonly count: number; readonly url: string; readonly observedAt: number }
  | { readonly observed: false };

export function parseUsageCountParams(params: unknown): UsageCountParams {
  return usageCountParamsSchema.parse(params);
}

/** Pure. True once the needle appears in at least `threshold` files across the watched repos. */
export function evaluateUsageCount(params: UsageCountParams, snapshot: UsageCountSnapshot): Evaluation {
  if (!snapshot.observed) {
    return { state: 'unobserved', evidence: null };
  }
  const used = `"${params.needle}" is used ${snapshot.count}x across ${params.repos.length} watched repo(s)`;
  return snapshot.count >= params.threshold
    ? {
        state: 'true',
        evidence: { url: snapshot.url, observedAt: snapshot.observedAt, description: `${used} (>= ${params.threshold})` },
      }
    : {
        state: 'false',
        evidence: { url: snapshot.url, observedAt: snapshot.observedAt, description: `${used} (< ${params.threshold})` },
      };
}
