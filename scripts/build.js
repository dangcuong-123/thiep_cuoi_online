import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadVariants } from '../config.js';
import { publicCatalog } from '../lib/public-config.js';
import { renderShareMeta } from '../lib/share-meta.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');
const variants = loadVariants(loadConfig(resolve(root, 'config/wedding.json'), publicDir), publicDir);
writeFileSync(resolve(publicDir, 'invitation-config.json'), JSON.stringify(publicCatalog(variants)));
const config = variants.find(v => v.enabled).config;
const cover = readFileSync(resolve(publicDir, config.photos.cover.slice(1)));
const { data: thumbnail, info } = await sharp(cover).rotate()
  .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
const version = createHash('sha256').update(thumbnail).digest('hex').slice(0, 16);
writeFileSync(resolve(publicDir, 'assets/share-cover.jpg'), thumbnail);
const baseUrl = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}` : process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
if (process.env.VERCEL && !baseUrl.startsWith('https://')) throw new Error('Cần PUBLIC_BASE_URL HTTPS để chia sẻ thiệp trên Vercel.');
const htmlPath = resolve(publicDir, 'index.html');
writeFileSync(htmlPath, renderShareMeta(readFileSync(htmlPath, 'utf8'), config, baseUrl, {
  path: `/assets/share-cover.jpg?v=${version}`, type: 'image/jpeg', width: info.width, height: info.height,
}));
console.log('Đã kiểm tra và tạo nội dung thiệp tĩnh cho Vercel.');
console.log('Đã tạo thumbnail từ ảnh bìa và thông tin chia sẻ trong HTML.');
