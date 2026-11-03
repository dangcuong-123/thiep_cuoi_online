import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { openStore, limit } from './database.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const failure = (status, message) => Object.assign(new Error(message), { status });
const TOKEN = /^[a-f0-9]{48}$/;
const SESSION_MS = 12 * 60 * 60 * 1000;
export const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};
export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; media-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw failure(415, 'Cần gửi application/json.');
  let raw = '';
  if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
  else {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8192) throw failure(413, 'Nội dung quá dài.');
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(raw) > 8192) throw failure(413, 'Nội dung quá dài.');
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw failure(400, 'JSON không hợp lệ.'); }
}

function nameOf(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) throw failure(400, 'Họ tên cần từ 1 đến 100 ký tự và không chứa ký tự điều khiển.');
  return name;
}

export function createApi({ config, variants, dbPath, database, rateLimit = 10, rateWindow = 60000,
  adminPassword = process.env.ADMIN_PASSWORD || '', publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  vercel = Boolean(process.env.VERCEL), loginLimit = 5, loginWindow = 15 * 60000 } = {}) {
  const base = new URL(publicBaseUrl);
  const catalog = variants ?? [
    { side: 'bride', label: 'Nhà gái', enabled: true, config },
    { side: 'groom', label: 'Nhà trai', enabled: false, config },
  ];
  const variantInfo = catalog.map(({ side, label, enabled }) => ({ side, label, enabled }));
  const selectVariant = side => {
    const variant = catalog.find(item => item.side === side);
    if (!variant) throw failure(400, 'Loại thiệp không hợp lệ. Chọn nhà trai hoặc nhà gái.');
    if (!variant.enabled) throw failure(409, `Thiệp ${variant.label.toLocaleLowerCase('vi')} đang chờ cập nhật ngày giờ, địa điểm và lời mời. Vui lòng liên hệ người gửi.`);
    return variant;
  };
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('PUBLIC_BASE_URL phải là địa chỉ gốc của website.');
  if (vercel && (!process.env.PUBLIC_BASE_URL && publicBaseUrl === 'http://localhost:3000' || base.protocol !== 'https:')) throw new Error('Cấu hình PUBLIC_BASE_URL HTTPS trên Vercel.');
  let ready;
  const getDatabase = () => {
    if (!ready) {
      ready = database ? Promise.resolve(database) : openStore({ dbPath });
      ready.catch(() => {}); // Surfaced as a generic 503; never log credentials.
    }
    return ready;
  };
  let cleanedAt = 0;
  const cookie = (req, token, maxAge) => `wedding_admin=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${vercel || req.socket?.encrypted || base.protocol === 'https:' ? '; Secure' : ''}`;
  const sessionToken = req => (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('wedding_admin='))?.slice(14) || '';
  const authenticated = async (req, db) => {
    const token = sessionToken(req);
    if (!TOKEN.test(token)) throw failure(401, 'Vui lòng đăng nhập quản trị.');
    const { rows } = await db.execute('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>?', [hash(token), Date.now()]);
    if (!rows.length) throw failure(401, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    return token;
  };
  const invitation = async (db, token) => {
    if (typeof token !== 'string' || !TOKEN.test(token)) throw failure(404, 'Link thiệp không hợp lệ. Vui lòng liên hệ người gửi.');
    const { rows } = await db.execute(`SELECT i.id,i.name,i.side,r.attendance,r.updated_at FROM invitations i
      LEFT JOIN rsvps r ON r.invitation_id=i.id WHERE i.token=?`, [token]);
    if (!rows.length) throw failure(404, 'Link thiệp không hợp lệ. Vui lòng liên hệ người gửi.');
    return rows[0];
  };
  const routes = {
    '/api/config': ['GET'], '/api/invitation': ['GET'], '/api/rsvp': ['POST'], '/api/wishes': ['POST'],
    '/api/admin/login': ['POST'], '/api/admin/logout': ['POST'], '/api/admin/session': ['GET'], '/api/admin/invitations': ['GET', 'POST'],
  };
  const handle = async (req, res) => {
    for (const [key, value] of Object.entries(securityHeaders)) res.setHeader(key, value);
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      const methods = routes[path];
      if (!methods) return json(res, 404, { error: 'Không tìm thấy.' });
      if (!methods.includes(req.method)) return json(res, 405, { error: 'Phương thức không hỗ trợ.' }, { Allow: methods.join(', ') });
      if (req.method === 'POST') {
        const origin = req.headers.origin;
        const requestOrigin = `${vercel || req.socket?.encrypted ? 'https' : 'http'}://${req.headers.host}`;
        if (req.headers['sec-fetch-site'] === 'cross-site' || origin && ![requestOrigin, base.origin].includes(origin)) throw failure(403, 'Nguồn gửi không hợp lệ.');
      }
      if (path === '/api/config') return json(res, 200, selectVariant(url.searchParams.get('side') ?? 'bride').config);
      let db;
      try { db = await getDatabase(); } catch { throw failure(503, 'Chưa kết nối được database. Vui lòng liên hệ quản trị.'); }
      const now = Date.now();
      if (req.method === 'POST' && now - cleanedAt > 60000) {
        cleanedAt = now;
        await db.execute('DELETE FROM admin_sessions WHERE expires_at<=?', [now]);
        await db.execute('DELETE FROM rate_limits WHERE expires_at<=?', [now]);
      }
      // Vercel replaces X-Forwarded-For. Local servers use the socket address only.
      const ip = vercel ? String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
      const ipKey = hash(ip);
      if (path === '/api/invitation') {
        const guest = await invitation(db, url.searchParams.get('token'));
        return json(res, 200, { name: guest.name, side: guest.side, attendance: guest.attendance, updatedAt: guest.updated_at });
      }
      if (path === '/api/admin/login') {
        if (!adminPassword) throw failure(503, 'Chưa đặt ADMIN_PASSWORD. Hãy chạy npm run admin:setup trên máy hoặc cấu hình biến môi trường trên Vercel.');
        await limit(db, `login:${ipKey}`, loginLimit, loginWindow);
        const body = await readJson(req);
        const provided = typeof body.password === 'string' ? body.password : '';
        if (!timingSafeEqual(Buffer.from(hash(provided), 'hex'), Buffer.from(hash(adminPassword), 'hex'))) throw failure(401, 'Mật khẩu không đúng.');
        const token = randomBytes(24).toString('hex');
        await db.execute('INSERT INTO admin_sessions(token_hash,expires_at) VALUES (?,?)', [hash(token), now + SESSION_MS]);
        return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, token, SESSION_MS / 1000) });
      }
      if (path.startsWith('/api/admin/')) {
        const token = await authenticated(req, db);
        if (path === '/api/admin/logout') {
          await readJson(req);
          await db.execute('DELETE FROM admin_sessions WHERE token_hash=?', [hash(token)]);
          return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
        }
        if (path === '/api/admin/session') return json(res, 200, { ok: true, baseUrl: base.origin, variants: variantInfo });
        if (req.method === 'POST') {
          await limit(db, `admin-create:${hash(token)}`, 60, 60000);
          const body = await readJson(req);
          const name = nameOf(body.name);
          const { side } = selectVariant(body.side === undefined ? 'bride' : body.side);
          const guestToken = randomBytes(24).toString('hex');
          const { rows } = await db.execute('INSERT INTO invitations(token,name,side) VALUES (?,?,?) RETURNING id,name,created_at,side', [guestToken, name, side]);
          return json(res, 201, { invitation: { ...rows[0], token: guestToken, attendance: null, updated_at: null, url: `${base.origin}/?guest=${guestToken}` } });
        }
        const { rows } = await db.execute(`SELECT i.id,i.token,i.name,i.created_at,i.side,r.attendance,r.updated_at
          FROM invitations i LEFT JOIN rsvps r ON r.invitation_id=i.id ORDER BY i.id DESC`);
        return json(res, 200, { invitations: rows.map(row => ({ ...row, url: `${base.origin}/?guest=${row.token}` })) });
      }
      await limit(db, `submit:${ipKey}`, rateLimit, rateWindow);
      const body = await readJson(req);
      if (path === '/api/rsvp') {
        if (!['attending', 'declined'].includes(body.attendance)) throw failure(400, 'Vui lòng chọn trạng thái tham dự.');
        if (Object.hasOwn(body, 'token')) {
          const guest = await invitation(db, body.token);
          await db.execute(`INSERT INTO rsvps(name,attendance,invitation_id,updated_at) VALUES (?,?,?,?)
            ON CONFLICT(invitation_id) DO UPDATE SET name=excluded.name,attendance=excluded.attendance,updated_at=excluded.updated_at`,
          [guest.name, body.attendance, guest.id, new Date().toISOString()]);
        } else {
          await db.execute('INSERT INTO rsvps(name,attendance,updated_at) VALUES (?,?,?)', [nameOf(body.name), body.attendance, new Date().toISOString()]);
        }
      } else {
        const name = nameOf(body.name);
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        if (!message || message.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) throw failure(400, 'Lời chúc cần từ 1 đến 2000 ký tự và không chứa ký tự điều khiển.');
        await db.execute('INSERT INTO wishes(name,message) VALUES (?,?)', [name, message]);
      }
      return json(res, 201, { ok: true });
    } catch (error) {
      if (res.headersSent) return res.destroy();
      const status = error.status || (error instanceof URIError ? 400 : 500);
      // Error details may contain SQL args, passwords or invite tokens. Do not log them.
      json(res, status, { error: status === 500 ? 'Chưa lưu được dữ liệu. Vui lòng thử lại.' : error.message }, error.headers);
    }
  };
  Object.defineProperty(handle, 'ready', { get: getDatabase });
  handle.close = async () => { try { (await ready).close(); } catch {} };
  return handle;
}
