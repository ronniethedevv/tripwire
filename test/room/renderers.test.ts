import { describe, expect, it } from 'vitest';
import type { Evidence } from '../../src/conditions/index.js';
import { createLoop, type Loop } from '../../src/core/index.js';
import { renderAgentWakeNote, renderReopenCard } from '../../src/room/index.js';

const evidence: Evidence = {
  url: 'https://github.com/owner/repo/pull/3',
  observedAt: Date.UTC(2026, 10, 1, 3, 40),
  description: 'PR #3 in owner/repo is merged',
};

function decisionLoop(): Loop {
  return createLoop(
    {
      id: 'l1',
      roomId: 'room-1',
      kind: 'decision',
      title: 'pricing-page decision',
      reason: 'until design PR #3 merges',
      waiterType: 'human',
      waiterHandle: '@alice',
      ownerHandle: '@alice',
      createdBy: '@alice',
      sourceRef: 'https://discuss/1',
      condition: { type: 'github.pr_merged', params: { repo: 'owner/repo', number: 3 } },
    },
    1000,
  );
}

function agentLoop(): Loop {
  return createLoop(
    {
      id: 'l2',
      roomId: 'room-1',
      kind: 'agent_block',
      title: 'open the pricing-page PR',
      reason: 'blocked on design PR #3',
      waiterType: 'agent',
      waiterHandle: '@builder',
      ownerHandle: '@builder',
      createdBy: '@builder',
      condition: { type: 'github.pr_merged', params: { repo: 'owner/repo', number: 3 } },
    },
    1000,
  );
}

describe('renderReopenCard', () => {
  it('includes title, evidence link, reason, owner, and source', () => {
    const card = renderReopenCard(decisionLoop(), evidence, 'Africa/Lagos');
    expect(card).toContain('🔔 Ready to decide: pricing-page decision');
    expect(card).toContain('https://github.com/owner/repo/pull/3');
    expect(card).toContain('Why we waited: until design PR #3 merges');
    expect(card).toContain('Decide: @alice');
    expect(card).toContain('Original discussion: https://discuss/1');
  });
});

describe('renderAgentWakeNote', () => {
  it('mentions the agent, the evidence, and the resume title', () => {
    expect(renderAgentWakeNote(agentLoop(), evidence)).toBe(
      "@builder you're unblocked: PR #3 in owner/repo is merged — https://github.com/owner/repo/pull/3. Resume: open the pricing-page PR.",
    );
  });
});
