import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { createApp } from '../server.js';
import { openStore } from '../lib/database.js';
import { snapshot, importSnapshot, readSnapshot, writeCsvExports } from '../lib/data-tools.js';
import { createApi } from '../lib/api.js';

const password = 'test-only-password';
function folder(t) {
  const path = mkdtempSync(resolve(tmpdir(), 'invitation-test-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
async function boot(t, options = {}) {
  const app = createApp({ dbPath: resolve(folder(t), 'test.sqlite'), adminPassword: password, rateLimit: 100, publicBaseUrl: 'https://thiep.example', ...options });
  const db = await app.ready;
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const call = (path, body, cookie, headers = {}) => fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const login = async () => {
    const result = await call('/api/admin/login', { password });
    assert.equal(result.status, 200);
    return result.headers.get('set-cookie').split(';')[0];
  };
  return { app, db, call, login, base };
}

test('admin auth, sessions, source checks, secure cookies and logout', async t => {
  const { call, login, db } = await boot(t);
  assert.equal((await call('/admin')).status, 200);
  assert.equal((await call('/api/admin/invitations')).status, 401);
  assert.equal((await call('/api/admin/invitations', { name: 'A' })).status, 401);
  assert.equal((await call('/api/admin/login', { password: 'wrong' })).status, 401);
  assert.equal((await call('/api/admin/login', { password }, null, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/api/admin/login', { password }, null, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const response = await call('/api/admin/login', { password });
  const header = response.headers.get('set-cookie');
  for (const value of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Max-Age=43200', 'Path=/api/admin']) assert.ok(header.includes(value));
  const cookie = header.split(';')[0];
  const session = (await db.execute('SELECT * FROM admin_sessions')).rows[0];
  assert.ok(!cookie.includes(session.token_hash), 'only hash stored in database');
  assert.equal((await call('/api/admin/session', undefined, cookie)).status, 200);
  assert.equal((await call('/api/admin/logout', {}, cookie)).status, 200);
  assert.equal((await call('/api/admin/session', undefined, cookie)).status, 401);
  const expired = await login();
  await db.execute('UPDATE admin_sessions SET expires_at=0');
  assert.equal((await call('/api/admin/invitations', undefined, expired)).status, 401);
});

test('personal links distinguish duplicate names; RSVP uses server name and updates one row', async t => {
  const path = resolve(folder(t), 'guests.sqlite');
  const { call, login, db } = await boot(t, { dbPath: path });
  const cookie = await login();
  const names = ['Anh Tuấn và gia đình', 'Chị Hà', 'Chị Hà', '<img src=x onerror=alert(1)> & Nguyễn'];
  const guests = [];
  for (const name of names) {
    const response = await call('/api/admin/invitations', { name }, cookie);
    assert.equal(response.status, 201);
    guests.push((await response.json()).invitation);
  }
  assert.equal(new Set(guests.map(g => g.token)).size, names.length);
  assert.equal(guests[0].url, `https://thiep.example/?guest=${guests[0].token}`);
  assert.ok(!guests[0].url.includes('Tuấn'));
  const guest = guests[0];
  const lookup = await call(`/api/invitation?token=${guest.token}`);
  assert.equal(lookup.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await lookup.json(), { name: names[0], attendance: null, updatedAt: null });
  assert.equal((await call('/api/rsvp', { token: guest.token, name: 'Forged name', attendance: 'attending' })).status, 201);
  const before = (await db.execute('SELECT * FROM rsvps')).rows[0];
  assert.equal(before.name, names[0]);
  await Promise.all(Array.from({ length: 5 }, () => call('/api/rsvp', { token: guest.token, attendance: 'declined' })));
  const rows = (await db.execute('SELECT * FROM rsvps')).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].attendance, 'declined');
  assert.equal(rows[0].created_at, before.created_at); assert.ok(rows[0].updated_at);
  assert.equal((await (await call(`/api/invitation?token=${guests[1].token}`)).json()).attendance, null);
  for (const token of ['', 'bad', 'a'.repeat(48), null]) {
    assert.equal((await call('/api/rsvp', { token, name: 'Fallback forbidden', attendance: 'attending' })).status, 404);
  }
  assert.equal((await call('/api/invitation?token=bad')).status, 404);
  assert.equal((await call('/api/rsvp', { token: guest.token, attendance: 'invalid' })).status, 400);
  assert.equal((await call('/api/admin/invitations', { name: '' }, cookie)).status, 400);
  assert.equal((await call('/api/admin/invitations', { name: 'A'.repeat(101) }, cookie)).status, 400);
  const second = await boot(t, { dbPath: path });
  assert.equal((await (await second.call(`/api/invitation?token=${guest.token}`)).json()).attendance, 'declined');
  assert.equal((await second.call('/api/admin/invitations', undefined, cookie)).status, 200, 'session works across instances');
  const list = await (await second.call('/api/admin/invitations', undefined, cookie)).json();
  assert.equal(list.invitations.length, 4);
  assert.equal(list.invitations.find(i => i.token === guest.token).attendance, 'declined');
});

test('database-backed rate limits persist across server instances and ignore spoofed local IP headers', async t => {
  const path = resolve(folder(t), 'limits.sqlite');
  const a = await boot(t, { dbPath: path, rateLimit: 1, loginLimit: 1 });
  const b = await boot(t, { dbPath: path, rateLimit: 1, loginLimit: 1 });
  assert.equal((await a.call('/api/admin/login', { password: 'bad' })).status, 401);
  assert.equal((await b.call('/api/admin/login', { password }, undefined, { 'X-Forwarded-For': '1.2.3.4' })).status, 429);
  assert.equal((await a.call('/api/rsvp', { name: 'A', attendance: 'attending' })).status, 201);
  const limit = await b.call('/api/rsvp', { name: 'B', attendance: 'attending' }, undefined, { 'X-Forwarded-For': '5.6.7.8' });
  assert.equal(limit.status, 429); assert.ok(limit.headers.get('retry-after'));
});

test('old SQLite upgrade preserves records, backs up WAL, and data import is atomic/idempotent', async t => {
  const dir = folder(t), path = resolve(dir, 'legacy.sqlite');
  const old = new DatabaseSync(path);
  old.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE rsvps(id INTEGER PRIMARY KEY,name TEXT NOT NULL,attendance TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE wishes(id INTEGER PRIMARY KEY,name TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL);
    INSERT INTO rsvps VALUES (7,'Khách cũ','attending','2026-01-01T00:00:00Z');
    INSERT INTO wishes VALUES (9,'=Formula','Chúc "hạnh phúc"!','2026-01-01T00:00:00Z');`);
  const db = await openStore({ dbPath: path });
  t.after(() => db.close()); old.close();
  const data = await snapshot(db);
  assert.equal(data.tables.rsvps[0].id, 7); assert.equal(data.tables.rsvps[0].invitation_id, null);
  const backups = readdirSync(resolve(dir, 'backups'));
  assert.equal(backups.length, 1);
  assert.equal(readSnapshot(resolve(dir, 'backups', backups[0])).tables.rsvps[0].id, 7);
  const target = await openStore({ dbPath: resolve(dir, 'target.sqlite') }); t.after(() => target.close());
  const imported = await importSnapshot(target, data);
  assert.deepEqual(imported.counts, { invitations: 0, rsvps: 1, wishes: 1 });
  assert.deepEqual(await snapshot(target), data);
  assert.equal((await importSnapshot(target, data)).skipped, true);
  const different = structuredClone(data); different.tables.wishes[0].message = 'different';
  await assert.rejects(importSnapshot(target, different), /đã có dữ liệu/);
  writeCsvExports(data, resolve(dir, 'csv'));
  const csv = readFileSync(resolve(dir, 'csv/wishes.csv'), 'utf8');
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes("'=Formula")); assert.ok(csv.includes('""hạnh phúc""'));
  const empty = await openStore({ dbPath: resolve(dir, 'rollback.sqlite') }); t.after(() => empty.close());
  const broken = structuredClone(data); broken.tables.rsvps[0].invitation_id = 99;
  await assert.rejects(importSnapshot(empty, broken));
  assert.equal((await snapshot(empty)).tables.rsvps.length, 0);
  const backup = resolve(dir, 'roundtrip.sqlite'); await target.backupTo(backup);
  assert.deepEqual(readSnapshot(backup), data);
});

test('JSON cloud backup format preserves personal tokens, identities and updated RSVP', async t => {
  const dir = folder(t);
  const source = await openStore({ dbPath: resolve(dir, 'source.sqlite') }); t.after(() => source.close());
  const token = 'b'.repeat(48);
  await source.execute('INSERT INTO invitations(id,token,name) VALUES (?,?,?)', [3, token, 'Gia đình Nguyễn']);
  await source.execute('INSERT INTO rsvps(name,attendance,invitation_id,updated_at) VALUES (?,?,?,?)', ['Gia đình Nguyễn', 'declined', 3, '2026-10-30T12:00:00Z']);
  const data = await snapshot(source);
  const jsonPath = resolve(dir, 'cloud-backup.json'); writeFileSync(jsonPath, JSON.stringify(data));
  const target = await openStore({ dbPath: resolve(dir, 'target.sqlite') }); t.after(() => target.close());
  await importSnapshot(target, readSnapshot(jsonPath));
  assert.deepEqual(await snapshot(target), data);
  const guest = (await target.execute('SELECT i.name,r.attendance FROM invitations i JOIN rsvps r ON i.id=r.invitation_id WHERE i.token=?', [token])).rows[0];
  assert.equal(guest.name, 'Gia đình Nguyễn'); assert.equal(guest.attendance, 'declined');
  writeCsvExports(data, resolve(dir, 'csv'));
  assert.ok(readFileSync(resolve(dir, 'csv/invitations.csv'), 'utf8').includes('declined'));
});

test('serverless handler accepts a pre-parsed Vercel body and trusts proxy IP only in Vercel mode', async t => {
  const db = await openStore({ dbPath: resolve(folder(t), 'serverless.sqlite') });
  const api = createApi({ database: db, vercel: true, publicBaseUrl: 'https://thiep.example', adminPassword: password, rateLimit: 1 });
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length) req.body = JSON.parse(Buffer.concat(chunks).toString());
    return api(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await api.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const send = (ip, path, body) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, Origin: 'https://thiep.example' }, body: JSON.stringify(body) });
  const login = await send('1.1.1.1', '/api/admin/login', { password });
  assert.equal(login.status, 200); assert.ok(login.headers.get('set-cookie').includes('; Secure'));
  const body = { name: 'Khách thử', attendance: 'attending' };
  assert.equal((await send('1.1.1.1', '/api/rsvp', body)).status, 201);
  assert.equal((await send('1.1.1.1', '/api/rsvp', body)).status, 429);
  assert.equal((await send('2.2.2.2', '/api/rsvp', body)).status, 201);
});
