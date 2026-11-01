import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.js';
import { loadConfig } from '../config.js';
import { calendar, countdown, displayDate, eventTime } from '../public/core.js';

test('dates, countdown and calendar derive from Vietnam event time', () => {
  const iso = '2027-10-20T09:00:00+07:00';
  assert.equal(displayDate(iso), '20/10/2027');
  assert.equal(eventTime(iso), '09H00 THỨ TƯ');
  assert.deepEqual(countdown(iso, new Date(iso).getTime() - 90061000), [1, 1, 1, 1]);
  assert.deepEqual(countdown(iso, new Date(iso).getTime() + 1000), [0, 0, 0, 0]);
  assert.equal(calendar(iso).cells.length, 35);
  assert.equal(calendar(iso).cells.filter(x => x === 20).length, 1);
  assert.equal(calendar('2028-02-29T00:30:00+07:00').selected, 29);
  assert.equal(calendar('2028-02-29T00:30:00+07:00').cells.filter(Boolean).length, 29);
  assert.equal(displayDate('2027-10-19T18:30:00Z'), '20/10/2027');
  assert.equal(calendar('2027-11-01T00:00:00+07:00').cells[0], 1);
});

const temporary = t => {
  const folder = mkdtempSync(resolve(tmpdir(), 'wedding-test-'));
  t.after(() => { if (resolve(folder).startsWith(resolve(tmpdir()) + '\\') || resolve(folder).startsWith(resolve(tmpdir()) + '/')) { if (basename(folder).startsWith('wedding-test-')) rmSync(folder, { recursive: true, force: true }); } });
  return folder;
};
const listen = app => new Promise(resolve => app.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${app.address().port}`)));
const close = app => new Promise((resolve, reject) => app.close(error => error ? reject(error) : resolve()));
const post = (url, path, body, headers = {}) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('configuration validates fields, calendar dates and asset paths', t => {
  const folder = temporary(t), path = resolve(folder, 'config.json');
  const good = JSON.parse(readFileSync('config/wedding.json', 'utf8'));
  assert.equal(loadConfig('config/wedding.json', resolve('public')).couple.groom, good.couple.groom);
  const qrOnly = structuredClone(good);
  qrOnly.gifts = [{ title: 'Mừng cưới', qrImage: '/assets/qr-will-be-added-later.png' }];
  writeFileSync(path, JSON.stringify(qrOnly));
  assert.equal(loadConfig(path, resolve('public')).gifts[0].qrImage, qrOnly.gifts[0].qrImage);
  qrOnly.gifts[0].qrImage = '/assets/../../data/wedding.sqlite';
  writeFileSync(path, JSON.stringify(qrOnly));
  assert.throws(() => loadConfig(path, resolve('public')), /gifts\[0\].qrImage/);
  const bad = structuredClone(good);
  bad.events[0].startsAt = '2027-02-30T09:00:00+07:00';
  bad.photos.cover = '/assets/../../server.js';
  bad.couple.groom = '';
  writeFileSync(path, JSON.stringify(bad));
  assert.throws(() => loadConfig(path, resolve('public')), error => {
    assert.match(error.message, /events\[0\].startsAt/); assert.match(error.message, /photos.cover/); assert.match(error.message, /couple.groom/); return true;
  });
});

test('RSVP and wishes persist after restart; validation and private data boundaries', async t => {
  const dbPath = resolve(temporary(t), 'wedding.sqlite');
  let app = createApp({ dbPath, rateLimit: 100 });
  let url = await listen(app);
  try {
    assert.equal((await fetch(url)).status, 200);
    const config = await (await fetch(url + '/api/config')).json();
    assert.ok(config.events.length);
    assert.equal((await post(url, '/api/rsvp', { name: "  O'Brien Nguyễn  ", attendance: 'attending' })).status, 201);
    assert.equal((await post(url, '/api/rsvp', { name: 'Khách bận', attendance: 'declined' })).status, 201);
    assert.equal((await post(url, '/api/wishes', { name: '<script>alert(1)</script>', message: 'Chúc hai bạn hạnh phúc!\n❤️' })).status, 201);
    for (const body of [{ name: '', attendance: 'attending' }, { name: 'A', attendance: 'invalid' }, { name: 'x'.repeat(101), attendance: 'attending' }]) assert.equal((await post(url, '/api/rsvp', body)).status, 400);
    assert.equal((await post(url, '/api/wishes', { name: 'A', message: '' })).status, 400);
    assert.equal((await post(url, '/api/wishes', { name: 'A', message: 'x'.repeat(2001) })).status, 400);
    assert.equal((await post(url, '/api/wishes', '{broken')).status, 400);
    assert.equal((await post(url, '/api/wishes', 'a'.repeat(9000))).status, 413);
    assert.equal((await post(url, '/api/wishes', {}, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post(url, '/api/rsvp', { name: 'A', attendance: 'attending' }, { Origin: 'https://another.example' })).status, 403);
    assert.equal((await fetch(url + '/api/wishes')).status, 405);
    for (const path of ['/data/wedding.sqlite', '/config/wedding.json', '/server.js', '/api/rsvps', '/%2e%2e%5cserver.js']) assert.equal((await fetch(url + path)).status, 404, path);
    assert.equal((await fetch(url + '/%ZZ')).status, 400);
    const range = await fetch(url + config.music, { headers: { Range: 'bytes=0-99' } });
    assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 100);
    assert.equal((await fetch(url + config.music, { headers: { Range: 'bytes=999999999999-' } })).status, 416);
    await close(app);
    app = createApp({ dbPath }); url = await listen(app);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rsvps = db.prepare('SELECT * FROM rsvps ORDER BY id').all();
      assert.equal(rsvps.length, 2); assert.equal(rsvps[0].name, "O'Brien Nguyễn"); assert.equal(rsvps[1].attendance, 'declined'); assert.ok(rsvps[0].created_at.endsWith('Z'));
      const wishes = db.prepare('SELECT * FROM wishes').all();
      assert.equal(wishes.length, 1); assert.equal(wishes[0].message, 'Chúc hai bạn hạnh phúc!\n❤️');
    } finally { db.close(); }
  } finally { await close(app); }
});

test('submission rate limit returns 429 and expires', async t => {
  const app = createApp({ dbPath: resolve(temporary(t), 'wedding.sqlite'), rateLimit: 1, rateWindow: 100 });
  const url = await listen(app);
  try {
    const body = { name: 'Khách', attendance: 'attending' };
    assert.equal((await post(url, '/api/rsvp', body)).status, 201);
    const limited = await post(url, '/api/rsvp', body);
    assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after'));
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal((await post(url, '/api/rsvp', body)).status, 201);
  } finally { await close(app); }
});
