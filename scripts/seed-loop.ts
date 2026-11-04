// Seed one armed decision loop into the watcher's database, so you can see a
// real PR merge fire a reopen card before the Day-2 MCP tools exist.
//
// Usage (same DATABASE_PATH the watcher uses):
//   DATABASE_PATH=./data/tripwire.sqlite ROOM_ID=<room id> OWNER_HANDLE=@you \
//     npx tsx scripts/seed-loop.ts <owner/repo> <pr-number> [title...]
import { randomUUID } from 'node:crypto';
import { applyTransition, createLoop } from '../src/core/index.js';
import { openStore } from '../src/store/index.js';

const [repo, prArg, ...titleParts] = process.argv.slice(2);
const dbPath = process.env['DATABASE_PATH'];
const roomId = process.env['ROOM_ID'];

if (!repo || !prArg || !dbPath || !roomId) {
  console.error(
    'usage: DATABASE_PATH=... ROOM_ID=... [OWNER_HANDLE=@you] ' +
      'npx tsx scripts/seed-loop.ts <owner/repo> <pr-number> [title...]',
  );
  process.exit(2);
}

const number = Number(prArg);
if (!Number.isInteger(number) || number <= 0) {
  console.error(`pr-number must be a positive integer, got: ${prArg}`);
  process.exit(2);
}

const owner = process.env['OWNER_HANDLE'] ?? '@you';
const title = titleParts.length > 0 ? titleParts.join(' ') : `${repo} PR #${number}`;
const now = Date.now();

const store = openStore(dbPath);
try {
  const id = randomUUID();
  const proposed = createLoop(
    {
      id,
      roomId,
      kind: 'decision',
      title,
      reason: `waiting until ${repo} PR #${number} merges`,
      waiterType: 'human',
      waiterHandle: owner,
      ownerHandle: owner,
      createdBy: owner,
      condition: { type: 'github.pr_merged', params: { repo, number } },
    },
    now,
  );
  store.insertLoop(applyTransition(proposed, { type: 'arm', by: owner, at: now }));
  console.log(`armed loop ${id}: watching ${repo} PR #${number} -> room ${roomId}`);
} finally {
  store.close();
}
