import { describe, expect, it } from 'vitest';
import {
  applyTransition,
  canApply,
  createLoop,
  InvalidTransition,
  type Loop,
  type LoopAction,
  type LoopStatus,
} from '../../src/core/index.js';

function loopIn(status: LoopStatus): Loop {
  const base = createLoop(
    {
      id: 'l',
      roomId: 'r',
      kind: 'decision',
      title: 't',
      reason: 'why',
      waiterType: 'human',
      waiterHandle: '@a',
      ownerHandle: '@a',
      createdBy: '@a',
      condition: { type: 'github.pr_merged', params: { repo: 'o/r', number: 1 } },
    },
    1000,
  );
  return { ...base, status };
}

describe('applyTransition — allowed moves', () => {
  it('proposed --arm--> armed', () => {
    const l = applyTransition(loopIn('proposed'), { type: 'arm', by: '@a', at: 10 });
    expect(l.status).toBe('armed');
    expect(l.armedBy).toBe('@a');
    expect(l.armedAt).toBe(10);
  });

  it('armed --fire--> fired', () => {
    const l = applyTransition(loopIn('armed'), { type: 'fire', at: 20 });
    expect(l.status).toBe('fired');
    expect(l.firedAt).toBe(20);
  });

  it('fired --resolve--> closed(resolved)', () => {
    const l = applyTransition(loopIn('fired'), { type: 'resolve', by: '@a', at: 30 });
    expect(l.status).toBe('closed');
    expect(l.closeReason).toBe('resolved');
    expect(l.closedAt).toBe(30);
  });

  it('proposed --cancel--> closed(cancelled)', () => {
    const l = applyTransition(loopIn('proposed'), { type: 'cancel', by: '@a', at: 40 });
    expect(l.status).toBe('closed');
    expect(l.closeReason).toBe('cancelled');
    expect(l.closedAt).toBe(40);
  });

  it('armed --cancel--> closed(cancelled)', () => {
    const l = applyTransition(loopIn('armed'), { type: 'cancel', by: '@a', at: 41 });
    expect(l.status).toBe('closed');
    expect(l.closeReason).toBe('cancelled');
  });

  it('armed --expire--> closed(expired)', () => {
    const l = applyTransition(loopIn('armed'), { type: 'expire', at: 50 });
    expect(l.status).toBe('closed');
    expect(l.closeReason).toBe('expired');
    expect(l.closedAt).toBe(50);
  });

  it('does not mutate the input loop', () => {
    const before = loopIn('proposed');
    applyTransition(before, { type: 'arm', by: '@a', at: 10 });
    expect(before.status).toBe('proposed');
    expect(before.armedAt).toBeNull();
  });
});

describe('applyTransition — rejected moves throw InvalidTransition', () => {
  const cases: ReadonlyArray<readonly [LoopStatus, LoopAction]> = [
    ['armed', { type: 'arm', by: '@a', at: 1 }],
    ['fired', { type: 'arm', by: '@a', at: 1 }],
    ['closed', { type: 'arm', by: '@a', at: 1 }],
    ['proposed', { type: 'fire', at: 1 }],
    ['fired', { type: 'fire', at: 1 }],
    ['closed', { type: 'fire', at: 1 }],
    ['proposed', { type: 'resolve', by: '@a', at: 1 }],
    ['armed', { type: 'resolve', by: '@a', at: 1 }],
    ['closed', { type: 'resolve', by: '@a', at: 1 }],
    ['fired', { type: 'cancel', by: '@a', at: 1 }],
    ['closed', { type: 'cancel', by: '@a', at: 1 }],
    ['proposed', { type: 'expire', at: 1 }],
    ['fired', { type: 'expire', at: 1 }],
    ['closed', { type: 'expire', at: 1 }],
  ];

  for (const [status, action] of cases) {
    it(`rejects ${action.type} from ${status}`, () => {
      expect(() => applyTransition(loopIn(status), action)).toThrow(InvalidTransition);
      expect(canApply(loopIn(status), action.type)).toBe(false);
    });
  }
});
