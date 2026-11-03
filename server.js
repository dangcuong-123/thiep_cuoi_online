import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, loadVariants } from './config.js';
import { createApi, json, securityHeaders } from './lib/api.js';
import { publicCatalog } from './lib/public-config.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.woff': 'font/woff' };

export function createApp(options = {}) {
  const config = loadConfig(options.configPath || resolve(ROOT, 'config/wedding.json'), PUBLIC);
  const variants = loadVariants(config, PUBLIC);
  const api = createApi({ ...options, config, variants });
  const server = createServer(async (req, res) => {
    for (const [key, value] of Object.entries(securityHeaders)) res.setHeader(key, value);
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/invitation-config.json' && ['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(publicCatalog(variants)));
      }
      if (pathname.startsWith('/api/')) return api(req, res);
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Phương thức không hỗ trợ.' }, { Allow: 'GET, HEAD' });
      const filename = resolve(PUBLIC, pathname === '/' ? 'index.html' : pathname === '/admin' || pathname === '/admin/' ? 'admin.html' : '.' + pathname);
      if (!filename.startsWith(PUBLIC + sep) || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) return json(res, 404, { error: 'Không tìm thấy.' });
      let stat;
      try { stat = statSync(filename); } catch { return json(res, 404, { error: 'Không tìm thấy.' }); }
      if (!stat.isFile()) return json(res, 404, { error: 'Không tìm thấy.' });
      const type = MIME[extname(filename).toLowerCase()] || 'application/octet-stream';
      const headers = { 'Content-Type': type, 'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=3600' : 'no-cache', 'Accept-Ranges': 'bytes' };
      let start = 0, end = stat.size - 1, status = 200;
      if (req.headers.range) {
        const range = req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
        if (range && (range[1] || range[2])) {
          if (!range[1]) start = Math.max(0, stat.size - Number(range[2]));
          else { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), end); }
        }
        if (!range || (!range[1] && !range[2]) || start > end || start >= stat.size || stat.size === 0) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end();
        }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = Math.max(0, end - start + 1);
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || stat.size === 0) return res.end();
      const stream = createReadStream(filename, { start, end });
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      json(res, error instanceof URIError ? 400 : 500, { error: 'Không thể xử lý yêu cầu.' });
    }
  });
  server.ready = api.ready;
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('close', () => { void api.close(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const port = Number(process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT phải nằm trong khoảng 1–65535.');
    const server = createApp();
    await server.ready;
    server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Cổng ${port} đang được sử dụng. Đổi PORT hoặc tắt tiến trình cũ.` : error.message); process.exitCode = 1; server.close(); });
    server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Thiệp cưới: http://localhost:${port}\nNội dung: config/wedding.json\nDữ liệu: data/wedding.sqlite`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
