import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

// client/dist 的位置:相对 server 源码(src)或编译产物(dist)都是 ../../client/dist
// (src 和 dist 都在 server/ 下一层,故两种运行模式解析到同一目录)
const ROOT = fileURLToPath(new URL('../../client/dist/', import.meta.url));

/**
 * 托管 client 静态产物(SPA)。命中文件则返回,未命中回退 index.html。
 * 路径穿越校验防止跳出 dist 目录。返回 true 表示已处理该请求。
 */
export async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const safe = normalize(join(ROOT, urlPath));
  if (!safe.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('forbidden');
    return true;
  }

  try {
    const info = await stat(safe);
    const filePath = info.isDirectory() ? join(safe, 'index.html') : safe;
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
    return true;
  } catch {
    // SPA fallback:任何未命中的路径回 index.html(前端单页,无路由)
    try {
      const index = await readFile(join(ROOT, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(index);
      return true;
    } catch {
      // client/dist 尚未构建 — 给出明确提示
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('client/dist not found. Run `npm run build` (or `npm run dev`) first.');
      return true;
    }
  }
}
