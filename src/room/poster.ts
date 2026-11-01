import { z } from 'zod';

/** A reference to a posted room message (the Switch event id). */
export interface RoomMessageRef {
  readonly id: string;
}

/** Posts a message into a room. Implementation chosen by the Day-1 spike (A won). */
export interface RoomPoster {
  post(roomId: string, content: string): Promise<RoomMessageRef>;
}

/** Minimal fetch shape, so tests can stub the network. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const postResponseSchema = z.object({ ok: z.boolean().optional(), event_id: z.string().optional() });

export interface SwitchAgentPosterConfig {
  readonly bridgeUrl: string;
  readonly agentId: string;
  readonly apiKey: string;
  readonly fetch?: FetchLike;
}

/**
 * Path A (validated in the Day-1 spike): post as the tripwire agent through the
 * Switch agent bridge's connectionless route, `POST /agents/{id}/message` with
 * `{room_id, content}` and a bearer API key. No open connection needed.
 */
export class SwitchAgentPoster implements RoomPoster {
  private readonly cfg: SwitchAgentPosterConfig;

  constructor(cfg: SwitchAgentPosterConfig) {
    this.cfg = cfg;
  }

  async post(roomId: string, content: string): Promise<RoomMessageRef> {
    const doFetch: FetchLike = this.cfg.fetch ?? ((url, init) => globalThis.fetch(url, init));
    const base = this.cfg.bridgeUrl.replace(/\/$/, '');
    const res = await doFetch(`${base}/agents/${this.cfg.agentId}/message`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, content }),
    });
    if (!res.ok) {
      throw new Error(`room post failed: HTTP ${res.status}`);
    }
    const data = postResponseSchema.parse(await res.json());
    return { id: data.event_id ?? '' };
  }
}
