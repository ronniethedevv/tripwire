import type Database from 'better-sqlite3';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

// Ordered, append-only. Each migration runs once, inside a transaction.
// Schema mirrors architecture.md. Fire-once (I1) is the firings.loop_id PRIMARY
// KEY; one-condition-per-loop is the conditions.loop_id UNIQUE; webhook dedupe
// (I3, unit 4) is the events.dedupe_key UNIQUE.
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE loops (
        id            TEXT PRIMARY KEY,
        room_id       TEXT NOT NULL,
        kind          TEXT NOT NULL,
        title         TEXT NOT NULL,
        reason        TEXT NOT NULL,
        waiter_type   TEXT NOT NULL,
        waiter_handle TEXT NOT NULL,
        owner_handle  TEXT NOT NULL,
        source_ref    TEXT,
        status        TEXT NOT NULL,
        created_by    TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        armed_by      TEXT,
        armed_at      INTEGER,
        fired_at      INTEGER,
        closed_at     INTEGER,
        close_reason  TEXT,
        expires_at    INTEGER
      );

      CREATE TABLE conditions (
        id                 TEXT PRIMARY KEY,
        loop_id            TEXT NOT NULL UNIQUE REFERENCES loops(id) ON DELETE CASCADE,
        type               TEXT NOT NULL,
        params_json        TEXT NOT NULL,
        last_state         TEXT,
        last_checked_at    INTEGER,
        last_evidence_path TEXT
      );

      CREATE TABLE events (
        id            TEXT PRIMARY KEY,
        source        TEXT NOT NULL,
        type          TEXT NOT NULL,
        repo          TEXT,
        number_or_ref TEXT,
        dedupe_key    TEXT NOT NULL UNIQUE,
        payload_path  TEXT,
        received_at   INTEGER NOT NULL
      );

      CREATE TABLE firings (
        loop_id          TEXT PRIMARY KEY REFERENCES loops(id) ON DELETE CASCADE,
        fired_at         INTEGER NOT NULL,
        evidence_path    TEXT,
        room_message_ref TEXT
      );

      CREATE TABLE audit (
        id          TEXT PRIMARY KEY,
        at          INTEGER NOT NULL,
        actor       TEXT NOT NULL,
        action      TEXT NOT NULL,
        loop_id     TEXT,
        detail_json TEXT
      );

      CREATE INDEX idx_loops_status ON loops(status);
      CREATE INDEX idx_events_repo_ref ON events(repo, number_or_ref);
    `,
  },
];

/** Create the ledger, then apply every migration newer than the recorded version. */
export function applyMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as
    | { v: number | null }
    | undefined;
  const current = row?.v ?? 0;

  const pending = migrations
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);

  const record = db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)');
  const runAll = db.transaction(() => {
    for (const m of pending) {
      db.exec(m.sql);
      record.run(m.version, Date.now());
    }
  });
  runAll();
}
