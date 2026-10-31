import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLoop, type Loop, type NewLoopInput } from '../../src/core/index.js';
import { openStore, type Store } from '../../src/store/index.js';

let dir: string;
let dbPath: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tripwire-store-'));
  dbPath = join(dir, 'test.sqlite');
  store = openStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

function sampleLoop(overrides: Partial<NewLoopInput> = {}, now = 1000): Loop {
  return createLoop(
    {
      id: 'loop-1',
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
    },
    now,
  );
}

describe('openStore / migrations', () => {
  it('creates the schema so a loop can be written and read', () => {
    store.insertLoop(sampleLoop());
    expect(store.getLoop('loop-1')).not.toBeNull();
  });

  it('is idempotent and durable when reopened on the same file', () => {
    store.insertLoop(sampleLoop());
    store.close();
    const reopened = openStore(dbPath);
    try {
      expect(reopened.getLoop('loop-1')?.title).toBe('pricing-page decision');
    } finally {
      reopened.close();
    }
  });
});

describe('insertLoop / getLoop / listLoops', () => {
  it('round-trips a loop with its condition', () => {
    store.insertLoop(sampleLoop());
    const loop = store.getLoop('loop-1');
    expect(loop?.status).toBe('proposed');
    expect(loop?.waiterHandle).toBe('@alice');
    expect(loop?.condition).toEqual({
      type: 'github.pr_merged',
      params: { repo: 'owner/repo', number: 3 },
    });
  });

  it('returns null for an unknown id', () => {
    expect(store.getLoop('nope')).toBeNull();
  });

  it('lists loops filtered by status', () => {
    store.insertLoop(sampleLoop({ id: 'a' }));
    store.insertLoop(
      sampleLoop({
        id: 'b',
        kind: 'agent_block',
        waiterType: 'agent',
        waiterHandle: '@builder',
        createdBy: '@builder',
      }),
    );
    expect(store.listLoops('proposed').map((l) => l.id)).toEqual(['a']);
    expect(store.listLoops('armed').map((l) => l.id)).toEqual(['b']);
    expect(store.listLoops()).toHaveLength(2);
  });
});

describe('recordFiring — fire once (I1)', () => {
  it('fires once and marks the loop fired', () => {
    store.insertLoop(sampleLoop());
    expect(store.recordFiring({ loopId: 'loop-1', firedAt: 5000 })).toBe('fired');
    expect(store.getLoop('loop-1')?.status).toBe('fired');
    expect(store.getLoop('loop-1')?.firedAt).toBe(5000);
  });

  it('ignores a second fire and keeps the first fired_at', () => {
    store.insertLoop(sampleLoop());
    store.recordFiring({ loopId: 'loop-1', firedAt: 5000 });
    expect(store.recordFiring({ loopId: 'loop-1', firedAt: 6000 })).toBe('already_fired');
    expect(store.getLoop('loop-1')?.firedAt).toBe(5000);
  });

  it('enforces fire-once across two connections to the same database', () => {
    store.insertLoop(sampleLoop());
    const other = openStore(dbPath);
    try {
      const a = store.recordFiring({ loopId: 'loop-1', firedAt: 5000 });
      const b = other.recordFiring({ loopId: 'loop-1', firedAt: 6000 });
      expect([a, b].sort()).toEqual(['already_fired', 'fired']);
    } finally {
      other.close();
    }
  });
});
