import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig, saveConfig, type ConfigDoc } from '../storage/cliConfigStore.js';
import { addWorkspace, loadHistory } from '../storage/workspaceHistoryStore.js';
import { listDir } from './listDir.js';
import { prepareWorktree, type PrepareWorktreeRequest } from './worktree.js';
import { PathForbiddenError } from '../util/pathGuard.js';
import { transcribeSpeech } from '../speech/speechService.js';
import { synthesize } from '../speech/tts.js';
import type { SpeechTranscribeRequest } from '../speech/types.js';
import type { SessionManager } from '../session/SessionManager.js';
import { createLogger } from '../logger.js';
import { getWebPushPublicKey, subscribePush, unsubscribePush } from '../push/pushService.js';
import type webPush from 'web-push';

const logger = createLogger('http');

interface NotificationRequest {
  sessionId?: string;
  source?: string;
  message?: string;
}

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
export async function handleApi(req: IncomingMessage, res: ServerResponse, manager: SessionManager): Promise<boolean> {
  const url = req.url ?? '/';
  if (!url.startsWith('/api/')) return false;

  const { pathname, searchParams } = new URL(url, 'http://localhost');
  const method = req.method ?? 'GET';
  const startedAt = Date.now();

  try {
    if (pathname === '/api/config') {
      if (method === 'GET') return respond(req, res, startedAt, 200, await loadConfig());
      if (method === 'PUT') {
        await saveConfig(await readBody<ConfigDoc>(req));
        return respond(req, res, startedAt, 200, await loadConfig()); // 返回归一化后的最新 doc
      }
      return respond(req, res, startedAt, 405, { error: 'method not allowed' });
    }

    if (pathname === '/api/history') {
      if (method === 'GET') return respond(req, res, startedAt, 200, await loadHistory());
      if (method === 'POST') {
        const { path } = await readBody<{ path: string }>(req);
        if (!path) return respond(req, res, startedAt, 400, { error: 'path required' });
        return respond(req, res, startedAt, 200, await addWorkspace(path));
      }
      return respond(req, res, startedAt, 405, { error: 'method not allowed' });
    }

    if (pathname === '/api/dir') {
      if (method !== 'GET') return respond(req, res, startedAt, 405, { error: 'method not allowed' });
      return respond(req, res, startedAt, 200, await listDir(searchParams.get('path') ?? undefined));
    }

    if (pathname === '/api/worktree/prepare') {
      if (method !== 'POST') return respond(req, res, startedAt, 405, { error: 'method not allowed' });
      return respond(req, res, startedAt, 200, await prepareWorktree(await readBody<PrepareWorktreeRequest>(req)));
    }

    if (pathname === '/api/speech/transcribe') {
      if (method !== 'POST') return respond(req, res, startedAt, 405, { error: 'method not allowed' });
      logger.info('speech transcription requested', { remoteAddress: req.socket.remoteAddress });
      return respond(req, res, startedAt, 200, await transcribeSpeech(await readBody<SpeechTranscribeRequest>(req, 6 * 1024 * 1024)));
    }

    if (pathname === '/api/push/public-key') {
      if (method !== 'GET') return respond(req, res, startedAt, 405, { error: 'method not allowed' });
      return respond(req, res, startedAt, 200, { publicKey: getWebPushPublicKey() });
    }

    if (pathname === '/api/push/subscribe') {
      if (method !== 'POST' && method !== 'DELETE') return respond(req, res, startedAt, 405, { error: 'method not allowed' });
      const subscription = await readBody<webPush.PushSubscription>(req, 64 * 1024);
      const count = method === 'POST'
        ? await subscribePush(subscription)
        : await unsubscribePush(subscription.endpoint);
      return respond(req, res, startedAt, 200, { ok: true, count });
    }

    if (pathname === '/api/notification' || pathname === '/api/hooks/notification') {
      if (method !== 'POST') return respond(req, res, startedAt, 405, { error: 'method not allowed' });
      if (!isLocalRequest(req)) {
        logger.warn('notification rejected: non-local request', { remoteAddress: req.socket.remoteAddress });
        return respond(req, res, startedAt, 403, { error: 'local requests only' });
      }
      const body = await readBody<NotificationRequest>(req, 64 * 1024);
      const event = {
        sessionId: typeof body.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : undefined,
        source: typeof body.source === 'string' && body.source.trim() ? body.source.trim() : undefined,
        message: typeof body.message === 'string' && body.message.trim() ? body.message.trim() : undefined,
      };
      logger.info('notification received', { ...event, remoteAddress: req.socket.remoteAddress });
      manager.notify(event);
      return respond(req, res, startedAt, 200, { ok: true });
    }

    if (pathname === '/api/tts') {
      if (method !== 'POST') return respond(req, res, startedAt, 405, { error: 'method not allowed' });
      const { text } = await readBody<{ text: string }>(req, 64 * 1024);
      if (!text || !text.trim()) return respond(req, res, startedAt, 400, { error: 'text required' });
      const audio = await synthesize(text);
      if (!audio) return respond(req, res, startedAt, 503, { error: 'tts unavailable or disabled' });
      logger.info('tts response sent', { textLength: text.length, audioBytes: audio.length, durationMs: Date.now() - startedAt });
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audio.length.toString(),
        'Cache-Control': 'no-store',
      });
      res.end(audio);
      return true;
    }

    return respond(req, res, startedAt, 404, { error: 'not found' });
  } catch (err) {
    if (err instanceof PathForbiddenError) return respond(req, res, startedAt, 403, { error: err.message });
    logger.warn('api request failed', { method, pathname, err: err as Error });
    return respond(req, res, startedAt, 400, { error: (err as Error).message });
  }
}

function isLocalRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function json(res: ServerResponse, status: number, body: unknown): boolean {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
  return true;
}

function respond(req: IncomingMessage, res: ServerResponse, startedAt: number, status: number, body: unknown): boolean {
  const method = req.method ?? 'GET';
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  logger.debug('api response', {
    method,
    pathname,
    status,
    durationMs: Date.now() - startedAt,
    remoteAddress: req.socket.remoteAddress,
  });
  return json(res, status, body);
}

/** 读取并解析 JSON 请求体;空 body 抛错(由 catch 转 400) */
async function readBody<T>(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > maxBytes) throw new Error('request body too large');
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) throw new Error('empty body');
  return JSON.parse(raw) as T;
}
