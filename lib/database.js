import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TABLES = {
  invitations: ['id', 'token', 'name', 'created_at', 'side', 'view_count', 'last_viewed_at'],
  rsvps: ['id', 'name', 'attendance', 'created_at', 'invitation_id', 'updated_at'],
  wishes: ['id', 'name', 'message', 'created_at'],
};

const schema = [
  `CREATE TABLE IF NOT EXISTS invitations (
    id INTEGER PRIMARY KEY, token TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    side TEXT NOT NULL DEFAULT 'bride' CHECK(side IN ('bride','groom')),
    view_count INTEGER NOT NULL DEFAULT 0 CHECK(view_count>=0), last_viewed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS rsvps (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL,
    attendance TEXT NOT NULL CHECK(attendance IN ('attending','declined')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    invitation_id INTEGER REFERENCES invitations(id), updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS wishes (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS data_imports (source_hash TEXT PRIMARY KEY, imported_at TEXT NOT NULL)`,
];

// All callers use the same asynchronous interface for SQLite and Turso.
export async function openDatabase({ dbPath, url, authToken } = {}) {
  const remoteUrl = url ?? (dbPath ? '' : process.env.TURSO_DATABASE_URL);
  if (remoteUrl) {
    if (!/^(libsql|https):\/\//.test(remoteUrl)) throw new Error('TURSO_DATABASE_URL phải là địa chỉ libsql:// hoặc https://.');
    const token = authToken ?? process.env.TURSO_AUTH_TOKEN;
    if (!token) throw new Error('Thiếu TURSO_AUTH_TOKEN.');
    const { createClient } = await import('@libsql/client/web');
    const client = createClient({ url: remoteUrl, authToken: token, intMode: 'number' });
    return { execute: (sql, args = []) => client.execute({ sql, args }),
      transaction: () => client.transaction('write'), close: () => client.close(), remote: true };
  }
  if (process.env.VERCEL && !dbPath) throw new Error('Cần cấu hình Turso trên Vercel; không lưu SQLite vào ổ đĩa tạm.');
  const path = resolve(dbPath || resolve(ROOT, 'data/wedding.sqlite'));
  mkdirSync(dirname(path), { recursive: true });
  const existed = existsSync(path);
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  const execute = (sql, args = []) => {
    const stmt = db.prepare(sql);
    if (stmt.columns().length) return { rows: stmt.all(...args) };
    const r = stmt.run(...args);
    return { rows: [], rowsAffected: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
  };
  return {
    execute: async (...args) => execute(...args), remote: false,
    async transaction() {
      db.exec('BEGIN IMMEDIATE');
      let done = false;
      return { execute: async ({ sql, args = [] }) => execute(sql, args),
        async commit() { db.exec('COMMIT'); done = true; },
        async rollback() { if (!done) { db.exec('ROLLBACK'); done = true; } },
        close() { if (!done) { db.exec('ROLLBACK'); done = true; } } };
    },
    async backupTo(target) { await backup(db, target); },
    async backupBeforeUpgrade() {
      if (!existed) return;
      const { rows } = execute('PRAGMA table_info(rsvps)');
      const invitations = execute('PRAGMA table_info(invitations)').rows;
      if (rows.length && !rows.some(c => c.name === 'invitation_id') || invitations.length && (!invitations.some(c => c.name === 'side') || !invitations.some(c => c.name === 'view_count'))) {
        const target = resolve(dirname(path), 'backups', `before-invitations-${Date.now()}.sqlite`);
        mkdirSync(dirname(target), { recursive: true });
        await backup(db, target);
      }
    },
    close: () => db.close(),
  };
}

export async function migrate(db) {
  // Turso rejects writes to PRAGMA user_version. Use a regular table, supported
  // by both local SQLite and remote libSQL, and only migrate unmarked databases.
  try {
    const version = await db.execute('SELECT version FROM schema_migrations WHERE version=2');
    if (version.rows.length) return;
  } catch (error) {
    if (!String(error.message).includes('no such table: schema_migrations')) throw error;
  }
  await db.backupBeforeUpgrade?.();
  const tx = await db.transaction();
  try {
    for (const sql of schema) await tx.execute({ sql });
    const invitations = (await tx.execute({ sql: 'PRAGMA table_info(invitations)' })).rows;
    if (!invitations.some(c => c.name === 'side')) await tx.execute({ sql: "ALTER TABLE invitations ADD COLUMN side TEXT NOT NULL DEFAULT 'bride' CHECK(side IN ('bride','groom'))" });
    if (!invitations.some(c => c.name === 'view_count')) await tx.execute({ sql: 'ALTER TABLE invitations ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0 CHECK(view_count>=0)' });
    if (!invitations.some(c => c.name === 'last_viewed_at')) await tx.execute({ sql: 'ALTER TABLE invitations ADD COLUMN last_viewed_at TEXT' });
    const { rows } = await tx.execute({ sql: 'PRAGMA table_info(rsvps)' });
    if (!rows.some(c => c.name === 'invitation_id')) await tx.execute({ sql: 'ALTER TABLE rsvps ADD COLUMN invitation_id INTEGER REFERENCES invitations(id)' });
    if (!rows.some(c => c.name === 'updated_at')) await tx.execute({ sql: 'ALTER TABLE rsvps ADD COLUMN updated_at TEXT' });
    await tx.execute({ sql: 'CREATE UNIQUE INDEX IF NOT EXISTS rsvps_invitation ON rsvps(invitation_id)' });
    await tx.execute({ sql: 'CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY)' });
    await tx.execute({ sql: 'INSERT OR IGNORE INTO schema_migrations(version) VALUES (2)' });
    await tx.commit();
  } finally { tx.close(); }
}

export async function openStore(options) {
  const db = await openDatabase(options);
  try { await migrate(db); return db; }
  catch (error) { db.close(); throw error; }
}

export async function limit(db, key, maximum, windowMs) {
  const now = Date.now();
  const { rows } = await db.execute(`INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
      expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END
    RETURNING count,expires_at`, [key, now + windowMs, now, now]);
  if (rows[0].count > maximum) throw Object.assign(new Error('Bạn đã gửi nhiều lần. Vui lòng thử lại sau.'), {
    status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((rows[0].expires_at - now) / 1000))) },
  });
}
