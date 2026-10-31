import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sign } from '@octokit/webhooks-methods';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStore, type Store } from '../../src/store/index.js';
import { createWebhookApp, normalizeGithubEvent } from '../../src/watcher/githubWebhook.js';

describe('normalizeGithubEvent', () => {
  it('normalizes a pull_request event', () => {
    expect(
      normalizeGithubEvent('pull_request', { number: 3, repository: { full_name: 'o/r' } }),
    ).toEqual({ type: 'pull_request', repo: 'o/r', numberOrRef: '3' });
  });

  it('normalizes an issues event', () => {
    expect(
      normalizeGithubEvent('issues', { issue: { number: 7 }, repository: { full_name: 'o/r' } }),
    ).toEqual({ type: 'issues', repo: 'o/r', numberOrRef: '7' });
  });

  it('normalizes a check_suite event to its head sha', () => {
    expect(
      normalizeGithubEvent('check_suite', { check_suite: { head_sha: 'abc' }, repository: { full_name: 'o/r' } }),
    ).toEqual({ type: 'check_suite', repo: 'o/r', numberOrRef: 'abc' });
  });

  it('returns null for an unindexed event type', () => {
    expect(normalizeGithubEvent('ping', { zen: 'hi' })).toBeNull();
  });

  it('returns null for a malformed payload rather than throwing', () => {
    expect(normalizeGithubEvent('pull_request', { nope: true })).toBeNull();
  });
});

const SECRET = 'test-secret';
const silent = pino({ level: 'silent' });

let dir: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tripwire-webhook-'));
  store = openStore(join(dir, 'test.sqlite'));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

function app() {
  return createWebhookApp({ secret: SECRET, store, evidenceDir: dir, now: () => 1234, logger: silent });
}

async function post(body: string, headers: Record<string, string>) {
  return app().request('/webhooks/github', { method: 'POST', body, headers });
}

async function signedHeaders(body: string, event: string, delivery: string) {
  return {
    'x-hub-signature-256': await sign(SECRET, body),
    'x-github-event': event,
    'x-github-delivery': delivery,
    'content-type': 'application/json',
  };
}

describe('createWebhookApp', () => {
  it('stores a valid, signed pull_request event and returns 200', async () => {
    const body = JSON.stringify({ number: 3, repository: { full_name: 'o/r' }, action: 'closed' });
    const res = await post(body, await signedHeaders(body, 'pull_request', 'd-1'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, indexed: true, duplicate: false });

    const stored = store.getEventByDedupeKey('d-1');
    expect(stored?.type).toBe('pull_request');
    expect(stored?.repo).toBe('o/r');
    expect(stored?.numberOrRef).toBe('3');
    expect(stored?.receivedAt).toBe(1234);
    // storage segregation: the raw payload is on disk, referenced by path
    expect(stored?.payloadPath).not.toBeNull();
    expect(readFileSync(stored?.payloadPath ?? '', 'utf8')).toBe(body);
  });

  it('rejects a bad signature with 401 and stores nothing', async () => {
    const body = JSON.stringify({ number: 3, repository: { full_name: 'o/r' } });
    const res = await post(body, {
      'x-hub-signature-256': 'sha256=deadbeef',
      'x-github-event': 'pull_request',
      'x-github-delivery': 'd-2',
      'content-type': 'application/json',
    });

    expect(res.status).toBe(401);
    expect(store.getEventByDedupeKey('d-2')).toBeNull();
  });

  it('dedupes a repeated delivery id', async () => {
    const body = JSON.stringify({ number: 3, repository: { full_name: 'o/r' } });
    const headers = await signedHeaders(body, 'pull_request', 'd-3');

    const first = await post(body, headers);
    const second = await post(body, headers);

    expect(await first.json()).toMatchObject({ duplicate: false });
    expect(await second.json()).toMatchObject({ indexed: true, duplicate: true });
    // still exactly one row
    expect(store.getEventByDedupeKey('d-3')).not.toBeNull();
  });

  it('accepts but does not index an unknown event type', async () => {
    const body = JSON.stringify({ zen: 'hello' });
    const res = await post(body, await signedHeaders(body, 'ping', 'd-4'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, indexed: false });
    expect(store.getEventByDedupeKey('d-4')).toBeNull();
  });

  it('returns 400 when required headers are missing', async () => {
    const res = await post('{}', { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });
});
