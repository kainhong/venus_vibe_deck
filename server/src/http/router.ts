import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig, saveConfig, type ConfigDoc } from '../storage/cliConfigStore.js';
import { addWorkspace, loadHistory } from '../storage/workspaceHistoryStore.js';
import { listDir } from './listDir.js';
import { PathForbiddenError } from '../util/pathGuard.js';

/**
 * HTTP API 路由分发。
 * 命中 /api/* → 处理并返回 true;未命中 → 返回 false 交给静态托管。
 * **必须在 serveStatic 之前调用**:static.ts 的 SPA fallback 会吞掉任何未命中路径。
 *
 * 资源:
 * - GET/PUT /api/config   — CLI 配置(整体读写)
 * - GET/POST /api/history — workspace 历史(POST 记录一次使用,非幂等)
 * - GET /api/dir?path=    — 目录浏览(白名单约束)
 */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url ?? '/';
  if (!url.startsWith('/api/')) return false;

  const { pathname, searchParams } = new URL(url, 'http://localhost');
  const method = req.method ?? 'GET';

  try {
    if (pathname === '/api/config') {
      if (method === 'GET') return json(res, 200, await loadConfig());
      if (method === 'PUT') {
        await saveConfig(await readBody<ConfigDoc>(req));
        return json(res, 200, await loadConfig()); // 返回归一化后的最新 doc
      }
      return json(res, 405, { error: 'method not allowed' });
    }

    if (pathname === '/api/history') {
      if (method === 'GET') return json(res, 200, await loadHistory());
      if (method === 'POST') {
        const { path } = await readBody<{ path: string }>(req);
        if (!path) return json(res, 400, { error: 'path required' });
        return json(res, 200, await addWorkspace(path));
      }
      return json(res, 405, { error: 'method not allowed' });
    }

    if (pathname === '/api/dir') {
      if (method !== 'GET') return json(res, 405, { error: 'method not allowed' });
      return json(res, 200, await listDir(searchParams.get('path') ?? undefined));
    }

    return json(res, 404, { error: 'not found' });
  } catch (err) {
    if (err instanceof PathForbiddenError) return json(res, 403, { error: err.message });
    return json(res, 400, { error: (err as Error).message });
  }
}

function json(res: ServerResponse, status: number, body: unknown): boolean {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
  return true;
}

/** 读取并解析 JSON 请求体;空 body 抛错(由 catch 转 400) */
async function readBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) throw new Error('empty body');
  return JSON.parse(raw) as T;
}
