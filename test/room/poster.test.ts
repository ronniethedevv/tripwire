import { describe, expect, it, vi } from 'vitest';
import { SwitchAgentPoster, type FetchLike } from '../../src/room/index.js';

function okFetch(eventId = 'sw_1'): FetchLike {
  return async () => ({ ok: true, status: 200, json: async () => ({ ok: true, event_id: eventId }) });
}

describe('SwitchAgentPoster', () => {
  it('POSTs {room_id, content} with a bearer token and returns the event id', async () => {
    const fetch = vi.fn<FetchLike>(okFetch('sw_42'));
    const poster = new SwitchAgentPoster({
      bridgeUrl: 'http://bridge:8000/',
      agentId: 'agent-1',
      apiKey: 'secret',
      fetch,
    });

    const ref = await poster.post('room-1', 'hello room');

    expect(ref).toEqual({ id: 'sw_42' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const call = fetch.mock.calls[0];
    expect(call?.[0]).toBe('http://bridge:8000/agents/agent-1/message');
    expect(call?.[1].method).toBe('POST');
    expect(call?.[1].headers.authorization).toBe('Bearer secret');
    expect(JSON.parse(call?.[1].body ?? '{}')).toEqual({ room_id: 'room-1', content: 'hello room' });
  });

  it('throws on a non-ok response', async () => {
    const fetch: FetchLike = async () => ({ ok: false, status: 403, json: async () => ({}) });
    const poster = new SwitchAgentPoster({ bridgeUrl: 'http://bridge:8000', agentId: 'a', apiKey: 'k', fetch });
    await expect(poster.post('room', 'hi')).rejects.toThrow('HTTP 403');
  });
});
