import { describe, expect, it } from 'vitest';
import type { Evidence } from '../../src/conditions/index.js';
import { createLoop, type Loop } from '../../src/core/index.js';
import {
  renderAgentWakeNote,
  renderArmed,
  renderLedger,
  renderProposal,
  renderReopenCard,
} from '../../src/room/index.js';

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

describe('renderProposal', () => {
  it('asks a human to confirm, in plain words', () => {
    const text = renderProposal(decisionLoop());
    expect(text).toContain('Proposed hold: pricing-page decision');
    expect(text).toContain('Waiting for: owner/repo PR #3 merges');
    expect(text).toContain("Why we're waiting: until design PR #3 merges");
    expect(text).toContain('Owner: @alice');
    expect(text).toContain('Reply "yes" to arm');
  });
});

describe('renderArmed', () => {
  it('confirms the hold with the condition in plain words', () => {
    expect(renderArmed(decisionLoop())).toBe(
      "⏳ Holding: pricing-page decision — until owner/repo PR #3 merges. I'll bring it back the moment that's true.",
    );
  });
});

describe('renderLedger', () => {
  it('numbers the open loops with condition, owner, and date', () => {
    const text = renderLedger([decisionLoop()], 'Africa/Lagos');
    expect(text).toContain('Open loops in this room (1):');
    expect(text).toContain('1. ⏳ pricing-page decision — until owner/repo PR #3 merges — owner @alice — since');
  });
});
