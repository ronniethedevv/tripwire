import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { z } from 'zod';
import {
  CLOSE_REASONS,
  CONDITION_TYPES,
  LOOP_KINDS,
  LOOP_STATUSES,
  WAITER_TYPES,
  type Loop,
  type LoopStatus,
} from '../core/index.js';
import { applyMigrations } from './migrations.js';

// Row shape of the loops+conditions join, validated at the DB boundary.
const loopRowSchema = z.object({
  id: z.string(),
  room_id: z.string(),
  kind: z.enum(LOOP_KINDS),
  title: z.string(),
  reason: z.string(),
  waiter_type: z.enum(WAITER_TYPES),
  waiter_handle: z.string(),
  owner_handle: z.string(),
  source_ref: z.string().nullable(),
  status: z.enum(LOOP_STATUSES),
  created_by: z.string(),
  created_at: z.number(),
  armed_by: z.string().nullable(),
  armed_at: z.number().nullable(),
  fired_at: z.number().nullable(),
  closed_at: z.number().nullable(),
  close_reason: z.enum(CLOSE_REASONS).nullable(),
  expires_at: z.number().nullable(),
  c_type: z.enum(CONDITION_TYPES),
  c_params: z.string(),
});

const paramsSchema = z.record(z.unknown());

function rowToLoop(row: unknown): Loop {
  const r = loopRowSchema.parse(row);
  const params = paramsSchema.parse(JSON.parse(r.c_params));
  return {
    id: r.id,
    roomId: r.room_id,
    kind: r.kind,
    title: r.title,
    reason: r.reason,
    waiterType: r.waiter_type,
    waiterHandle: r.waiter_handle,
    ownerHandle: r.owner_handle,
    sourceRef: r.source_ref,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    armedBy: r.armed_by,
    armedAt: r.armed_at,
    firedAt: r.fired_at,
    closedAt: r.closed_at,
    closeReason: r.close_reason,
    expiresAt: r.expires_at,
    condition: { type: r.c_type, params },
  };
}

const eventRowSchema = z.object({
  id: z.string(),
  source: z.string(),
  type: z.string(),
  repo: z.string().nullable(),
  number_or_ref: z.string().nullable(),
  dedupe_key: z.string(),
  payload_path: z.string().nullable(),
  received_at: z.number(),
});

export interface StoredEvent {
  readonly id: string;
  readonly source: string;
  readonly type: string;
  readonly repo: string | null;
  readonly numberOrRef: string | null;
  readonly dedupeKey: string;
  readonly payloadPath: string | null;
  readonly receivedAt: number;
}

function rowToEvent(row: unknown): StoredEvent {
  const r = eventRowSchema.parse(row);
  return {
    id: r.id,
    source: r.source,
    type: r.type,
    repo: r.repo,
    numberOrRef: r.number_or_ref,
    dedupeKey: r.dedupe_key,
    payloadPath: r.payload_path,
    receivedAt: r.received_at,
  };
}

export interface InsertEventInput {
  readonly source: string;
  readonly type: string;
  readonly repo: string | null;
  readonly numberOrRef: string | null;
  readonly dedupeKey: string;
  readonly payloadPath: string | null;
  readonly receivedAt: number;
}

export type EventInsertResult = 'stored' | 'duplicate';

export type FiringResult = 'fired' | 'already_fired';

export interface RecordFiringInput {
  readonly loopId: string;
  readonly firedAt: number;
  readonly evidencePath?: string | null;
  readonly roomMessageRef?: string | null;
}

export interface AuditInput {
  readonly at: number;
  readonly actor: string;
  readonly action: string;
  readonly loopId?: string | null;
  readonly detail?: Readonly<Record<string, unknown>> | null;
}

const LOOP_SELECT = `SELECT l.*, c.type AS c_type, c.params_json AS c_params
  FROM loops l JOIN conditions c ON c.loop_id = l.id`;

export class Store {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Run fn in a transaction. better-sqlite3 is synchronous, so this is atomic. */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  insertLoop(loop: Loop): void {
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO loops (id, room_id, kind, title, reason, waiter_type, waiter_handle,
             owner_handle, source_ref, status, created_by, created_at, armed_by, armed_at,
             fired_at, closed_at, close_reason, expires_at)
           VALUES (@id, @room_id, @kind, @title, @reason, @waiter_type, @waiter_handle,
             @owner_handle, @source_ref, @status, @created_by, @created_at, @armed_by, @armed_at,
             @fired_at, @closed_at, @close_reason, @expires_at)`,
        )
        .run({
          id: loop.id,
          room_id: loop.roomId,
          kind: loop.kind,
          title: loop.title,
          reason: loop.reason,
          waiter_type: loop.waiterType,
          waiter_handle: loop.waiterHandle,
          owner_handle: loop.ownerHandle,
          source_ref: loop.sourceRef,
          status: loop.status,
          created_by: loop.createdBy,
          created_at: loop.createdAt,
          armed_by: loop.armedBy,
          armed_at: loop.armedAt,
          fired_at: loop.firedAt,
          closed_at: loop.closedAt,
          close_reason: loop.closeReason,
          expires_at: loop.expiresAt,
        });
      this.db
        .prepare(
          `INSERT INTO conditions (id, loop_id, type, params_json, last_state, last_checked_at, last_evidence_path)
           VALUES (?, ?, ?, ?, NULL, NULL, NULL)`,
        )
        .run(randomUUID(), loop.id, loop.condition.type, JSON.stringify(loop.condition.params));
    });
  }

  getLoop(id: string): Loop | null {
    const row = this.db.prepare(`${LOOP_SELECT} WHERE l.id = ?`).get(id);
    return row === undefined ? null : rowToLoop(row);
  }

  listLoops(status?: LoopStatus): Loop[] {
    const rows = status
      ? this.db.prepare(`${LOOP_SELECT} WHERE l.status = ? ORDER BY l.created_at ASC`).all(status)
      : this.db.prepare(`${LOOP_SELECT} ORDER BY l.created_at ASC`).all();
    return rows.map(rowToLoop);
  }

  /**
   * Fire a loop at most once (I1). Inserts the firing row (unique loop_id); on the
   * first insert it marks the loop fired and writes an audit row, and reports
   * 'fired'. A conflicting insert changes nothing and reports 'already_fired'.
   * One transaction, so the firing row and the status move commit together.
   */
  recordFiring(input: RecordFiringInput): FiringResult {
    return this.transaction<FiringResult>(() => {
      const res = this.db
        .prepare(
          `INSERT OR IGNORE INTO firings (loop_id, fired_at, evidence_path, room_message_ref)
           VALUES (?, ?, ?, ?)`,
        )
        .run(input.loopId, input.firedAt, input.evidencePath ?? null, input.roomMessageRef ?? null);
      if (res.changes === 0) {
        return 'already_fired';
      }
      this.db
        .prepare(`UPDATE loops SET status = 'fired', fired_at = ? WHERE id = ?`)
        .run(input.firedAt, input.loopId);
      this.appendAudit({ at: input.firedAt, actor: 'watcher', action: 'fire', loopId: input.loopId });
      return 'fired';
    });
  }

  /**
   * Store a normalised source event, deduped on dedupe_key (the webhook delivery
   * id). A repeated delivery is ignored and reported as 'duplicate'. (I3: the
   * webhook handler only validates, stores and returns — no checking here.)
   */
  insertEvent(input: InsertEventInput): EventInsertResult {
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO events (id, source, type, repo, number_or_ref, dedupe_key, payload_path, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.source,
        input.type,
        input.repo,
        input.numberOrRef,
        input.dedupeKey,
        input.payloadPath,
        input.receivedAt,
      );
    return res.changes === 0 ? 'duplicate' : 'stored';
  }

  getEventByDedupeKey(dedupeKey: string): StoredEvent | null {
    const row = this.db.prepare('SELECT * FROM events WHERE dedupe_key = ?').get(dedupeKey);
    return row === undefined ? null : rowToEvent(row);
  }

  appendAudit(input: AuditInput): void {
    this.db
      .prepare(`INSERT INTO audit (id, at, actor, action, loop_id, detail_json) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(
        randomUUID(),
        input.at,
        input.actor,
        input.action,
        input.loopId ?? null,
        input.detail == null ? null : JSON.stringify(input.detail),
      );
  }

  close(): void {
    this.db.close();
  }
}

/** Open (or create) the database at `filename`, set WAL + foreign keys, and migrate. */
export function openStore(filename: string): Store {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  return new Store(db);
}
