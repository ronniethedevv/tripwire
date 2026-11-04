import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStore, type Store } from '../../src/store/index.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { LoopService } from '../../src/mcp/service.js';

let dir: string;
let store: Store;
let client: Client;
let seq = 0;

const proposeArgs = {
  room_id: 'room-1',
  kind: 'decision',
  title: 'pricing-page decision',
  reason: 'until design PR #3 merges',
  waiter_type: 'human',
  waiter_handle: '@alice',
  owner_handle: '@alice',
  created_by: '@alice',
  condition: { type: 'github.pr_merged', params: { repo: 'owner/repo', number: 3 } },
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tripwire-mcpserver-'));
  store = openStore(join(dir, 'db.sqlite'));
  seq = 0;
  const service = new LoopService({ store, humanHandles: new Set(['@alice']), now: () => 1000, idFactory: () => `loop-${++seq}` });
  const server = createMcpServer(service, { zone: 'Africa/Lagos' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> }).content ?? [];
  return content.map((c) => c.text ?? '').join('\n');
}

describe('MCP server', () => {
  it('lists the tripwire tools', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'arm_loop',
      'cancel_loop',
      'explain_loop',
      'list_loops',
      'propose_loop',
      'propose_loops',
      'resolve_loop',
    ]);
  });

  it('propose_loop stores a proposed loop and returns the proposal card', async () => {
    const result = await client.callTool({ name: 'propose_loop', arguments: proposeArgs });
    expect(textOf(result)).toContain('Proposed hold: pricing-page decision');
    expect(textOf(result)).toContain('loop_id: loop-1');
    expect(store.getLoop('loop-1')?.status).toBe('proposed');
  });

  it('arm_loop arms a proposed decision loop for a human', async () => {
    await client.callTool({ name: 'propose_loop', arguments: proposeArgs });
    const result = await client.callTool({
      name: 'arm_loop',
      arguments: { loop_id: 'loop-1', confirmed_by: '@alice' },
    });
    expect(textOf(result)).toContain('⏳ Holding: pricing-page decision');
    expect(store.getLoop('loop-1')?.status).toBe('armed');
  });

  it('arm_loop refuses a non-human on a decision loop (isError)', async () => {
    await client.callTool({ name: 'propose_loop', arguments: proposeArgs });
    const result = await client.callTool({
      name: 'arm_loop',
      arguments: { loop_id: 'loop-1', confirmed_by: '@builder' },
    });
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(textOf(result)).toContain('requires a human');
    expect(store.getLoop('loop-1')?.status).toBe('proposed');
  });

  it('list_loops renders the ledger', async () => {
    await client.callTool({ name: 'propose_loop', arguments: proposeArgs });
    await client.callTool({ name: 'arm_loop', arguments: { loop_id: 'loop-1', confirmed_by: '@alice' } });
    const result = await client.callTool({ name: 'list_loops', arguments: { status: 'armed' } });
    expect(textOf(result)).toContain('Open loops in this room (1):');
    expect(textOf(result)).toContain('pricing-page decision');
  });
});
