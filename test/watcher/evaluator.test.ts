import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyTransition, createLoop, type Loop } from '../../src/core/index.js';
import { type RoomMessageRef, type RoomPoster } from '../../src/room/index.js';
import { GithubClient, type FetchPullRequest } from '../../src/sources/index.js';
import { openStore, type Store } from '../../src/store/index.js';
import { Evaluator } from '../../src/watcher/evaluator.js';

const silent = pino({ level: 'silent' });
const noSleep = async (): Promise<void> => {};

class FakePoster implements RoomPoster {
  readonly posts: Array<{ roomId: string; content: string }> = [];
  async post(roomId: string, content: string): Promise<RoomMessageRef> {
    this.posts.push({ roomId, content });
    return { id: `ref-${this.posts.length}` };
  }
}

function githubReturning(merged: boolean): GithubClient {
  const fetchPr: FetchPullRequest = async () => ({ merged, htmlUrl: 'https://github.com/owner/repo/pull/3' });
  return new GithubClient(fetchPr, { now: () => 500, sleep: noSleep, logger: silent });
}

function githubDown(): GithubClient {
  const fetchPr: FetchPullRequest = async () => {
    throw new Error('ETIMEDOUT');
  };
  return new GithubClient(fetchPr, { sleep: noSleep, logger: silent });
}

let dir: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tripwire-eval-'));
  store = openStore(join(dir, 'db.sqlite'));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

function insertArmedDecision(id = 'l1'): void {
  const proposed = createLoop(
    {
      id,
      roomId: 'room-1',
      kind: 'decision',
      title: 'pricing decision',
      reason: 'until design PR #3',
      waiterType: 'human',
      waiterHandle: '@alice',
      ownerHandle: '@alice',
      createdBy: '@alice',
      condition: { type: 'github.pr_merged', params: { repo: 'owner/repo', number: 3 } },
    },
    1000,
  );
  store.insertLoop(applyTransition(proposed, { type: 'arm', by: '@alice', at: 1100 }));
}

function insertArmedAgentBlock(id = 'l2'): void {
  // agent_block whose waiter is its creator arms on creation
  store.insertLoop(
    createLoop(
      {
        id,
        roomId: 'room-1',
        kind: 'agent_block',
        title: 'open the PR',
        reason: 'blocked on design PR #3',
        waiterType: 'agent',
        waiterHandle: '@builder',
        ownerHandle: '@builder',
        createdBy: '@builder',
        condition: { type: 'github.pr_merged', params: { repo: 'owner/repo', number: 3 } },
      },
      1000,
    ),
  );
}

function armed(): Loop {
  const loop = store.listLoops('armed')[0];
  if (loop === undefined) throw new Error('expected an armed loop');
  return loop;
}

describe('Evaluator.checkLoop', () => {
  it('fires a merged decision loop: posts the card and marks it fired', async () => {
    insertArmedDecision();
    const poster = new FakePoster();
    const ev = new Evaluator({ store, github: githubReturning(true), poster, now: () => 9000, zone: 'Africa/Lagos', logger: silent });

    expect(await ev.checkLoop(armed())).toBe('fired');
    expect(poster.posts).toHaveLength(1);
    expect(poster.posts[0]?.content).toContain('🔔 Ready to decide: pricing decision');
    expect(poster.posts[0]?.content).toContain('https://github.com/owner/repo/pull/3');
    expect(store.getLoop('l1')?.status).toBe('fired');
  });

  it('does not fire when the PR is observed but not merged', async () => {
    insertArmedDecision();
    const poster = new FakePoster();
    const ev = new Evaluator({ store, github: githubReturning(false), poster, logger: silent });

    expect(await ev.checkLoop(armed())).toBe('not_true');
    expect(poster.posts).toHaveLength(0);
    expect(store.getLoop('l1')?.status).toBe('armed');
  });

  it('does not fire when the source is unobservable (I2)', async () => {
    insertArmedDecision();
    const poster = new FakePoster();
    const ev = new Evaluator({ store, github: githubDown(), poster, logger: silent });

    expect(await ev.checkLoop(armed())).toBe('unobserved');
    expect(poster.posts).toHaveLength(0);
    expect(store.getLoop('l1')?.status).toBe('armed');
  });

  it('fires at most once even when re-checked', async () => {
    insertArmedDecision();
    const poster = new FakePoster();
    const ev = new Evaluator({ store, github: githubReturning(true), poster, logger: silent });
    const loop = armed();

    expect(await ev.checkLoop(loop)).toBe('fired');
    expect(await ev.checkLoop(loop)).toBe('already_fired');
    expect(poster.posts).toHaveLength(1);
  });

  it('wakes a blocked agent with a wake note', async () => {
    insertArmedAgentBlock();
    const poster = new FakePoster();
    const ev = new Evaluator({ store, github: githubReturning(true), poster, logger: silent });

    expect(await ev.checkLoop(armed())).toBe('fired');
    expect(poster.posts[0]?.content).toContain("@builder you're unblocked");
  });
});

function insertArmedTimeAfter(at: string, id = 't1'): void {
  const proposed = createLoop(
    {
      id,
      roomId: 'room-1',
      kind: 'decision',
      title: 'check back on the RFC',
      reason: "we'll revisit next month",
      waiterType: 'human',
      waiterHandle: '@alice',
      ownerHandle: '@alice',
      createdBy: '@alice',
      condition: { type: 'time.after', params: { at } },
    },
    1000,
  );
  store.insertLoop(applyTransition(proposed, { type: 'arm', by: '@alice', at: 1100 }));
}

describe('Evaluator.checkLoop — time.after', () => {
  it('fires once the time has passed', async () => {
    const at = '2026-01-01T00:00:00.000Z';
    insertArmedTimeAfter(at);
    const poster = new FakePoster();
    const ev = new Evaluator({
      store,
      github: githubReturning(false),
      poster,
      now: () => Date.parse(at) + 1000,
      zone: 'UTC',
      logger: silent,
    });

    expect(await ev.checkLoop(armed())).toBe('fired');
    expect(store.getLoop('t1')?.status).toBe('fired');
    expect(poster.posts[0]?.content).toContain('check back on the RFC');
  });

  it('does not fire before the time', async () => {
    const at = '2030-01-01T00:00:00.000Z';
    insertArmedTimeAfter(at);
    const poster = new FakePoster();
    const ev = new Evaluator({
      store,
      github: githubReturning(false),
      poster,
      now: () => Date.parse(at) - 1000,
      logger: silent,
    });

    expect(await ev.checkLoop(armed())).toBe('not_true');
    expect(poster.posts).toHaveLength(0);
  });
});

describe('Evaluator.onEvent', () => {
  it('checks only loops whose condition matches the event repo + ref', async () => {
    insertArmedDecision(); // owner/repo #3
    const poster = new FakePoster();
    const ev = new Evaluator({ store, github: githubReturning(true), poster, logger: silent });

    await ev.onEvent({ repo: 'owner/other', numberOrRef: '3' });
    await ev.onEvent({ repo: 'owner/repo', numberOrRef: '99' });
    expect(poster.posts).toHaveLength(0);

    await ev.onEvent({ repo: 'owner/repo', numberOrRef: '3' });
    expect(poster.posts).toHaveLength(1);
    expect(store.getLoop('l1')?.status).toBe('fired');
  });
});
