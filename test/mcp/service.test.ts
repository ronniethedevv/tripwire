import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LoopNotFound, NotAuthorized } from '../../src/core/index.js';
import { openStore, type Store } from '../../src/store/index.js';
import { LoopService, type ProposeInput } from '../../src/mcp/service.js';

let dir: string;
let store: Store;
let service: LoopService;
let seq = 0;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tripwire-mcp-'));
  store = openStore(join(dir, 'db.sqlite'));
  seq = 0;
  service = new LoopService({
    store,
    humanHandles: new Set(['@alice']),
    now: () => 1000,
    idFactory: () => `loop-${++seq}`,
  });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

function decisionInput(overrides: Partial<ProposeInput> = {}): ProposeInput {
  return {
    roomId: 'room-1',
    kind: 'decision',
    title: 'pricing-page decision',
    reason: 'until design PR #3 merges',
    waiterType: 'human',
    waiterHandle: '@alice',
    ownerHandle: '@alice',
    createdBy: '@alice',
    condition: { type: 'github.pr_merged', params: { repo: 'owner/repo', number: 3 } },
    ...overrides,
  };
}

describe('propose', () => {
  it('creates a decision loop as proposed', () => {
    const loop = service.propose(decisionInput());
    expect(loop.id).toBe('loop-1');
    expect(loop.status).toBe('proposed');
    expect(store.getLoop('loop-1')?.status).toBe('proposed');
  });

  it('auto-arms an agent_block whose waiter is its creator', () => {
    const loop = service.propose(
      decisionInput({ kind: 'agent_block', waiterType: 'agent', waiterHandle: '@builder', createdBy: '@builder' }),
    );
    expect(loop.status).toBe('armed');
  });

  it('rejects a malformed pr_merged condition', () => {
    expect(() =>
      service.propose(decisionInput({ condition: { type: 'github.pr_merged', params: { repo: 'bad', number: 0 } } })),
    ).toThrow();
  });
});

describe('arm — access control', () => {
  it('a human in HUMAN_HANDLES can arm a decision loop', () => {
    service.propose(decisionInput());
    const armed = service.arm('loop-1', '@alice', 'msg-1');
    expect(armed.status).toBe('armed');
    expect(armed.armedBy).toBe('@alice');
    expect(store.getLoop('loop-1')?.status).toBe('armed');
  });

  it('a non-human cannot arm a decision loop', () => {
    service.propose(decisionInput());
    expect(() => service.arm('loop-1', '@builder')).toThrow(NotAuthorized);
    expect(store.getLoop('loop-1')?.status).toBe('proposed');
  });

  it('throws LoopNotFound for an unknown id', () => {
    expect(() => service.arm('nope', '@alice')).toThrow(LoopNotFound);
  });
});

describe('cancel / resolve', () => {
  it('a human can cancel a decision loop', () => {
    service.propose(decisionInput());
    const closed = service.cancel('loop-1', '@alice', 'changed our minds');
    expect(closed.status).toBe('closed');
    expect(closed.closeReason).toBe('cancelled');
  });

  it('a non-human cannot cancel a decision loop', () => {
    service.propose(decisionInput());
    expect(() => service.cancel('loop-1', '@builder', 'nope')).toThrow(NotAuthorized);
  });

  it('resolves a fired loop', () => {
    service.propose(decisionInput());
    service.arm('loop-1', '@alice');
    store.recordFiring({ loopId: 'loop-1', firedAt: 2000 });
    const resolved = service.resolve('loop-1', '@alice', 'shipped the redesign');
    expect(resolved.status).toBe('closed');
    expect(resolved.closeReason).toBe('resolved');
  });
});

describe('list / explain', () => {
  it('lists loops filtered by status and room', () => {
    service.propose(decisionInput({ roomId: 'room-1' }));
    service.propose(decisionInput({ roomId: 'room-2' }));
    service.arm('loop-1', '@alice');

    expect(service.list({ status: 'armed' }).map((l) => l.id)).toEqual(['loop-1']);
    expect(service.list({ roomId: 'room-2' }).map((l) => l.id)).toEqual(['loop-2']);
    expect(service.list()).toHaveLength(2);
  });

  it('explains a loop, including its firing once fired', () => {
    service.propose(decisionInput());
    service.arm('loop-1', '@alice');
    expect(service.explain('loop-1').firing).toBeNull();

    store.recordFiring({ loopId: 'loop-1', firedAt: 2000 });
    const explained = service.explain('loop-1');
    expect(explained.loop.id).toBe('loop-1');
    expect(explained.firing?.firedAt).toBe(2000);
  });
});
