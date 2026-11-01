import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openStore, ROOT } from '../lib/database.js';
import { snapshot, readSnapshot, importSnapshot, writeCsvExports } from '../lib/data-tools.js';

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const command = process.argv[2];
if (!['export', 'backup', 'import'].includes(command)) {
  console.error('Dùng: npm run data:export, npm run data:backup hoặc npm run data:import -- <file.sqlite|file.json>');
  process.exit(1);
}
let db;
try {
  if (command === 'import' && !process.argv[3]) throw new Error('Cần đường dẫn bản SQLite/JSON nguồn.');
  const source = command === 'import' ? readSnapshot(resolve(process.argv[3])) : null;
  db = await openStore();
  if (command === 'import') {
    const result = await importSnapshot(db, source);
    console.log(result.skipped ? 'Nguồn này đã được nhập; không tạo dòng trùng.' : `Đã nhập và kiểm tra số dòng: ${JSON.stringify(result.counts)}`);
  } else if (command === 'backup' && !db.remote) {
    const folder = resolve(ROOT, 'data/backups'); mkdirSync(folder, { recursive: true });
    const target = resolve(folder, `wedding-${stamp}.sqlite`);
    await db.backupTo(target);
    console.log(`Đã sao lưu SQLite (bao gồm WAL): ${target}`);
  } else {
    const data = await snapshot(db);
    if (command === 'backup') {
      const folder = resolve(ROOT, 'data/backups'); mkdirSync(folder, { recursive: true });
      const target = resolve(folder, `wedding-${stamp}.json`);
      writeFileSync(target, JSON.stringify(data, null, 2), { mode: 0o600 });
      console.log(`Đã sao lưu dữ liệu Turso (không gồm phiên đăng nhập): ${target}`);
    } else {
      const folder = resolve(ROOT, 'data/exports', stamp); writeCsvExports(data, folder);
      console.log(`Đã xuất CSV UTF-8: ${folder}`);
    }
  }
} catch (error) {
  console.error(db?.remote ? 'Không hoàn tất thao tác Turso. Kiểm tra kết nối, database đích trống và file nguồn. Không chia sẻ token truy cập.' : error.message);
  process.exitCode = 1;
} finally { db?.close(); }
