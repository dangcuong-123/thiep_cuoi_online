import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TABLES } from './database.js';

const normalizeRow = (table, row) => Object.fromEntries(TABLES[table].map(key => [key,
  table === 'invitations' && key === 'side' ? row[key] ?? 'bride'
    : table === 'invitations' && key === 'view_count' ? row[key] ?? 0 : row[key] ?? null]));

export async function snapshot(db) {
  const tx = await db.transaction();
  try {
    const tables = {};
    for (const table of Object.keys(TABLES)) tables[table] = (await tx.execute({ sql: `SELECT * FROM ${table} ORDER BY id` })).rows.map(row => normalizeRow(table, row));
    await tx.commit();
    return { version: 3, tables };
  } finally { tx.close(); }
}

export function readSnapshot(path) {
  if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'));
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    if (!names.has('rsvps') || !names.has('wishes')) throw new Error('File nguồn không phải database thiệp cưới.');
    const tables = {};
    for (const [table, columns] of Object.entries(TABLES)) tables[table] = names.has(table)
      ? db.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map(row => normalizeRow(table, row)) : [];
    return { version: 3, tables };
  } finally { db.close(); }
}

export async function importSnapshot(db, data) {
  if (![1, 2, 3].includes(data.version) || !data.tables || Object.keys(TABLES).some(table => !Array.isArray(data.tables[table]))) throw new Error('Bản sao lưu không đúng định dạng.');
  const tables = {};
  for (const table of Object.keys(TABLES)) tables[table] = data.tables[table].map(row => normalizeRow(table, row));
  const fingerprint = createHash('sha256').update(JSON.stringify(tables)).digest('hex');
  // Older import receipts did not include the side column. Recognize them after upgrade.
  const v2Tables = { ...tables, invitations: tables.invitations.map(({ view_count, last_viewed_at, ...row }) => row) };
  const hasNoViews = tables.invitations.every(row => row.view_count === 0 && row.last_viewed_at === null);
  const v2Fingerprint = hasNoViews ? createHash('sha256').update(JSON.stringify(v2Tables)).digest('hex') : fingerprint;
  const legacyTables = { ...tables, invitations: v2Tables.invitations.map(({ side, ...row }) => row) };
  const legacyFingerprint = hasNoViews && tables.invitations.every(row => row.side === 'bride')
    ? createHash('sha256').update(JSON.stringify(legacyTables)).digest('hex') : fingerprint;
  const tx = await db.transaction();
  try {
    if ((await tx.execute({ sql: 'SELECT 1 FROM data_imports WHERE source_hash IN (?,?,?)', args: [fingerprint, v2Fingerprint, legacyFingerprint] })).rows.length) {
      await tx.commit(); return { skipped: true };
    }
    for (const table of Object.keys(TABLES)) {
      const n = (await tx.execute({ sql: `SELECT count(*) AS n FROM ${table}` })).rows[0].n;
      if (n) throw new Error('Database đích đã có dữ liệu. Chỉ nhập vào database trống để tránh ghi đè phản hồi.');
    }
    const counts = {};
    for (const [table, columns] of Object.entries(TABLES)) {
      for (let start = 0; start < tables[table].length; start += 100) {
        const chunk = tables[table].slice(start, start + 100);
        await tx.execute({ sql: `INSERT INTO ${table} (${columns.join(',')}) VALUES ${chunk.map(() => `(${columns.map(() => '?').join(',')})`).join(',')}`,
          args: chunk.flatMap(row => columns.map(key => row[key])) });
      }
      counts[table] = Number((await tx.execute({ sql: `SELECT count(*) AS n FROM ${table}` })).rows[0].n);
      if (counts[table] !== tables[table].length) throw new Error(`Số dòng ${table} không khớp; đã hủy nhập.`);
    }
    await tx.execute({ sql: 'INSERT INTO data_imports(source_hash,imported_at) VALUES (?,?)', args: [fingerprint, new Date().toISOString()] });
    await tx.commit(); return { skipped: false, counts };
  } finally { tx.close(); }
}

export function writeCsvExports(data, folder) {
  mkdirSync(folder, { recursive: true });
  const cell = value => {
    let text = String(value ?? '');
    if (/^\s*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  for (const [table, fields] of Object.entries(TABLES)) {
    const columns = table === 'invitations' ? [...fields, 'attendance', 'updated_at'] : fields;
    const rows = data.tables[table].map(row => table === 'invitations' ? { ...row, ...Object.fromEntries(['attendance', 'updated_at'].map(key => [key, data.tables.rsvps.find(r => r.invitation_id === row.id)?.[key] ?? null])) } : row);
    const csv = [columns.map(cell).join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n');
    writeFileSync(resolve(folder, `${table}.csv`), '\uFEFF' + csv, { encoding: 'utf8', mode: 0o600 });
  }
}
