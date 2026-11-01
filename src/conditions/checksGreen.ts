import { z } from 'zod';
import type { Evaluation } from './types.js';

export const checksGreenParamsSchema = z.object({
  repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'repo must be "owner/name"'),
  ref: z.string().min(1),
});
export type ChecksGreenParams = z.infer<typeof checksGreenParamsSchema>;

export type ChecksGreenSnapshot =
  | { readonly observed: true; readonly allGreen: boolean; readonly url: string; readonly observedAt: number }
  | { readonly observed: false };

export function parseChecksGreenParams(params: unknown): ChecksGreenParams {
  return checksGreenParamsSchema.parse(params);
}

/** Pure. `allGreen` is computed by the source (every check completed and successful). */
export function evaluateChecksGreen(params: ChecksGreenParams, snapshot: ChecksGreenSnapshot): Evaluation {
  if (!snapshot.observed) {
    return { state: 'unobserved', evidence: null };
  }
  const where = `checks on ${params.repo}@${params.ref}`;
  return snapshot.allGreen
    ? {
        state: 'true',
        evidence: { url: snapshot.url, observedAt: snapshot.observedAt, description: `${where} are green` },
      }
    : {
        state: 'false',
        evidence: { url: snapshot.url, observedAt: snapshot.observedAt, description: `${where} are not all green yet` },
      };
}
