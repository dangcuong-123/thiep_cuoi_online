import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../lib/database.js';

const path = resolve(ROOT, '.env');
const text = existsSync(path) ? readFileSync(path, 'utf8') : 'PUBLIC_BASE_URL=http://localhost:3000\nTURSO_DATABASE_URL=\nTURSO_AUTH_TOKEN=\n';
if (/^ADMIN_PASSWORD=.+$/m.test(text)) {
  console.log('Đã có ADMIN_PASSWORD trong .env. Mở file để xem hoặc thay đổi, rồi khởi động lại máy chủ.');
} else {
  const password = randomBytes(18).toString('base64url');
  const next = /^ADMIN_PASSWORD=.*$/m.test(text) ? text.replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${password}`) : `${text.trimEnd()}\nADMIN_PASSWORD=${password}\n`;
  writeFileSync(path, next, { mode: 0o600 }); chmodSync(path, 0o600);
  console.log('Đã tạo mật khẩu ngẫu nhiên trong .env (ADMIN_PASSWORD). Mở file này để lấy mật khẩu. Khởi động lại máy chủ để áp dụng.');
}
