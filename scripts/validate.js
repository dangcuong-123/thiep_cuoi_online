import { loadConfig } from '../config.js';
import { ROOT } from '../lib/database.js';
import { resolve } from 'node:path';
loadConfig(resolve(ROOT, 'config/wedding.json'), resolve(ROOT, 'public'));
console.log('Cấu hình thiệp và tài nguyên hợp lệ.');
