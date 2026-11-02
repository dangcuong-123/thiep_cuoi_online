import { loadConfig, loadVariants } from '../config.js';
import { ROOT } from '../lib/database.js';
import { resolve } from 'node:path';
const variants = loadVariants(loadConfig(resolve(ROOT, 'config/wedding.json'), resolve(ROOT, 'public')), resolve(ROOT, 'public'));
console.log('Cấu hình thiệp và tài nguyên hợp lệ.');
for (const variant of variants) console.log(`${variant.label}: ${variant.enabled ? 'sẵn sàng' : 'chưa bật; cần hoàn thiện thông tin trước khi tạo link'}`);
