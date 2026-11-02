import { resolve } from 'node:path';
import { loadConfig, loadVariants } from '../config.js';
import { ROOT } from './database.js';
import { createApi, json } from './api.js';

let handler;
export default async function vercelHandler(req, res) {
  try {
    // Lazy initialization keeps missing environment variables from breaking builds.
    if (!handler) {
      const config = loadConfig(resolve(ROOT, 'config/wedding.json'), resolve(ROOT, 'public'));
      handler = createApi({ config, variants: loadVariants(config, resolve(ROOT, 'public')), vercel: true });
    }
    await handler.ready;
    return await handler(req, res);
  } catch {
    handler = undefined;
    return json(res, 503, { error: 'Chưa cấu hình máy chủ. Vui lòng liên hệ quản trị.' });
  }
}
