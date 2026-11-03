import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadVariants } from '../config.js';
import { publicCatalog } from '../lib/public-config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');
const variants = loadVariants(loadConfig(resolve(root, 'config/wedding.json'), publicDir), publicDir);
writeFileSync(resolve(publicDir, 'invitation-config.json'), JSON.stringify(publicCatalog(variants)));
console.log('Đã kiểm tra và tạo nội dung thiệp tĩnh cho Vercel.');
