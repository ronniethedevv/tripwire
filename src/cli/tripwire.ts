// Tripwire CLI: drive the real loop tools from the terminal and post the
// proposal/armed/ledger cards into the room as tripwire. Shares the SQLite file
// with the watcher, so loops armed here fire from there. Run:
//   DATABASE_PATH=./data/tripwire.sqlite ROOM_ID=... HUMAN_HANDLES=@you \
//   SWITCH_BRIDGE_URL=... SWITCH_AGENT_ID=... SWITCH_AGENT_API_KEY=... \
//   npm run cli -- propose --title "pricing decision" --condition pr --repo o/r --number 2
import { parseArgs } from 'node:util';
import { LOOP_STATUSES, type LoopKind, type LoopStatus, type WaiterType } from '../core/index.js';
import { LoopService, type ListFilter } from '../mcp/service.js';
import {
  SwitchAgentPoster,
  renderArmed,
  renderLedger,
  renderProposal,
  type RoomPoster,
} from '../room/index.js';
import { openStore } from '../store/index.js';
import { conditionFromFlags } from './args.js';

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

function requireFlag(value: string | undefined, name: string): string {
  return value ?? die(`--${name} is required`);
}

function buildPoster(): RoomPoster | null {
  const bridgeUrl = process.env['SWITCH_BRIDGE_URL'];
  const agentId = process.env['SWITCH_AGENT_ID'];
  const apiKey = process.env['SWITCH_AGENT_API_KEY'];
  if (!bridgeUrl || !agentId || !apiKey) {
    return null;
  }
  return new SwitchAgentPoster({ bridgeUrl, agentId, apiKey });
}

async function emit(poster: RoomPoster | null, roomId: string | undefined, text: string): Promise<void> {
  console.log(text);
  if (poster !== null && roomId !== undefined) {
    try {
      const ref = await poster.post(roomId, text);
      console.log(`\n(posted to room ${roomId} — ${ref.id})`);
    } catch (error) {
      console.error(`\n(room post failed: ${error instanceof Error ? error.message : String(error)})`);
    }
  } else {
    console.log('\n(not posted — set SWITCH_BRIDGE_URL / SWITCH_AGENT_ID / SWITCH_AGENT_API_KEY and ROOM_ID to post)');
  }
}

function asStatus(value: string | undefined): LoopStatus | undefined {
  return value !== undefined && (LOOP_STATUSES as readonly string[]).includes(value)
    ? (value as LoopStatus)
    : undefined;
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      title: { type: 'string' },
      reason: { type: 'string' },
      owner: { type: 'string' },
      waiter: { type: 'string' },
      kind: { type: 'string' },
      room: { type: 'string' },
      status: { type: 'string' },
      condition: { type: 'string' },
      repo: { type: 'string' },
      number: { type: 'string' },
      ref: { type: 'string' },
      needle: { type: 'string' },
      repos: { type: 'string' },
      threshold: { type: 'string' },
      at: { type: 'string' },
      by: { type: 'string' },
      outcome: { type: 'string' },
    },
  });

  const command = positionals[0];
  const loopId = positionals[1];
  const dbPath = process.env['DATABASE_PATH'] ?? die('set DATABASE_PATH (the same file the watcher uses)');
  const zone = process.env['ROOM_ZONE'] ?? 'Africa/Lagos';
  const roomEnv = process.env['ROOM_ID'];
  const humanHandles = new Set(
    (process.env['HUMAN_HANDLES'] ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter((h) => h.length > 0),
  );
  const defaultActor = [...humanHandles][0] ?? '@you';

  const store = openStore(dbPath);
  const service = new LoopService({ store, humanHandles });
  const poster = buildPoster();

  try {
    switch (command) {
      case 'propose': {
        const roomId = values.room ?? roomEnv ?? die('propose needs --room or ROOM_ID');
        const owner = values.owner ?? defaultActor;
        const kind: LoopKind = values.kind === 'agent_block' ? 'agent_block' : 'decision';
        const waiterHandle = values.waiter ?? owner;
        const waiterType: WaiterType = kind === 'agent_block' ? 'agent' : 'human';
        const loop = service.propose({
          roomId,
          kind,
          title: requireFlag(values.title, 'title'),
          reason: values.reason ?? '(no reason given)',
          waiterType,
          waiterHandle,
          ownerHandle: owner,
          createdBy: owner,
          condition: conditionFromFlags(values),
        });
        await emit(poster, roomId, loop.status === 'armed' ? renderArmed(loop) : renderProposal(loop));
        console.log(`\nloop_id: ${loop.id}`);
        break;
      }
      case 'arm': {
        const loop = service.arm(requireFlag(loopId, 'loop id'), values.by ?? defaultActor);
        await emit(poster, loop.roomId, renderArmed(loop));
        break;
      }
      case 'open':
      case 'list': {
        const status = asStatus(values.status ?? (command === 'open' ? 'armed' : undefined));
        const room = values.room ?? roomEnv;
        const filter: ListFilter = {
          ...(status !== undefined ? { status } : {}),
          ...(room !== undefined ? { roomId: room } : {}),
        };
        const text = renderLedger(service.list(filter), zone);
        if (command === 'open') {
          await emit(poster, room, text);
        } else {
          console.log(text);
        }
        break;
      }
      case 'cancel': {
        const loop = service.cancel(requireFlag(loopId, 'loop id'), values.by ?? defaultActor, values.reason ?? 'cancelled');
        console.log(`✅ cancelled ${loop.id}`);
        break;
      }
      case 'resolve': {
        const loop = service.resolve(requireFlag(loopId, 'loop id'), values.by ?? defaultActor, values.outcome ?? 'resolved');
        console.log(`✅ resolved ${loop.id}`);
        break;
      }
      case 'explain': {
        console.log(JSON.stringify(service.explain(requireFlag(loopId, 'loop id')), null, 2));
        break;
      }
      default:
        console.log('usage: tripwire <propose|arm|open|list|cancel|resolve|explain> [loop_id] [--flags]');
    }
  } finally {
    store.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
