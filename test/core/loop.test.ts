import { describe, expect, it } from 'vitest';
import { createLoop, type Condition, type NewLoopInput } from '../../src/core/index.js';

const condition: Condition = {
  type: 'github.pr_merged',
  params: { repo: 'owner/repo', number: 3 },
};

function input(overrides: Partial<NewLoopInput> = {}): NewLoopInput {
  return {
    id: 'loop-1',
    roomId: 'room-1',
    kind: 'decision',
    title: 'pricing-page decision',
    reason: 'waiting on design PR #3',
    waiterType: 'human',
    waiterHandle: '@alice',
    ownerHandle: '@alice',
    createdBy: '@alice',
    condition,
    ...overrides,
  };
}

describe('createLoop', () => {
  it('creates a decision loop as proposed with null lifecycle fields', () => {
    const loop = createLoop(input({ kind: 'decision' }), 1000);
    expect(loop.status).toBe('proposed');
    expect(loop.createdAt).toBe(1000);
    expect(loop.armedBy).toBeNull();
    expect(loop.armedAt).toBeNull();
    expect(loop.firedAt).toBeNull();
    expect(loop.closedAt).toBeNull();
    expect(loop.closeReason).toBeNull();
    expect(loop.expiresAt).toBeNull();
    expect(loop.condition).toEqual(condition);
  });

  it('auto-arms an agent_block when the waiter is its creator', () => {
    const loop = createLoop(
      input({ kind: 'agent_block', waiterType: 'agent', waiterHandle: '@builder', createdBy: '@builder' }),
      2000,
    );
    expect(loop.status).toBe('armed');
    expect(loop.armedBy).toBe('@builder');
    expect(loop.armedAt).toBe(2000);
  });

  it('leaves an agent_block proposed when the creator is not the waiter', () => {
    const loop = createLoop(
      input({ kind: 'agent_block', waiterType: 'agent', waiterHandle: '@builder', createdBy: '@alice' }),
      3000,
    );
    expect(loop.status).toBe('proposed');
    expect(loop.armedBy).toBeNull();
    expect(loop.armedAt).toBeNull();
  });

  it('passes through sourceRef and expiresAt, defaulting them to null', () => {
    const withRefs = createLoop(input({ sourceRef: 'msg-42', expiresAt: 9999 }), 1000);
    expect(withRefs.sourceRef).toBe('msg-42');
    expect(withRefs.expiresAt).toBe(9999);

    const withoutRefs = createLoop(input(), 1000);
    expect(withoutRefs.sourceRef).toBeNull();
    expect(withoutRefs.expiresAt).toBeNull();
  });
});
