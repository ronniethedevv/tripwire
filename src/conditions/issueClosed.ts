import { z } from 'zod';
import type { Evaluation } from './types.js';

export const issueClosedParamsSchema = z.object({
  repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'repo must be "owner/name"'),
  number: z.number().int().positive(),
});
export type IssueClosedParams = z.infer<typeof issueClosedParamsSchema>;

export type IssueClosedSnapshot =
  | { readonly observed: true; readonly closed: boolean; readonly url: string; readonly observedAt: number }
  | { readonly observed: false };

export function parseIssueClosedParams(params: unknown): IssueClosedParams {
  return issueClosedParamsSchema.parse(params);
}

/** Pure. Unobserved → `unobserved` (never a false `false`, I2). */
export function evaluateIssueClosed(params: IssueClosedParams, snapshot: IssueClosedSnapshot): Evaluation {
  if (!snapshot.observed) {
    return { state: 'unobserved', evidence: null };
  }
  const where = `issue #${params.number} in ${params.repo}`;
  return snapshot.closed
    ? {
        state: 'true',
        evidence: { url: snapshot.url, observedAt: snapshot.observedAt, description: `${where} is closed` },
      }
    : {
        state: 'false',
        evidence: { url: snapshot.url, observedAt: snapshot.observedAt, description: `${where} is still open` },
      };
}
