import type { ConfigDoc, DirListing, HistoryDoc, SpeechResult, SpeechTranscribeRequest } from '../types';

/**
 * 前端 HTTP client —— 同源 fetch /api/*(server 单进程同源,与 WS 一致,无需 base URL)。
 * 配置/历史/目录浏览走 HTTP REST;只有 create_session 走 WS(需即时绑定 PTY 订阅)。
 */

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function sendJson<T>(method: string, url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  getConfig: () => getJson<ConfigDoc>('/api/config'),
  putConfig: (doc: ConfigDoc) => sendJson<ConfigDoc>('PUT', '/api/config', doc),
  getHistory: () => getJson<HistoryDoc>('/api/history'),
  /** 记录一次 workspace 使用(非幂等,POST) */
  addWorkspace: (path: string) => sendJson<HistoryDoc>('POST', '/api/history', { path }),
  /** 目录浏览;path 受后端白名单约束,缺省返回第一个允许根 */
  listDir: (path?: string) =>
    getJson<DirListing>(path ? `/api/dir?path=${encodeURIComponent(path)}` : '/api/dir'),
  transcribeSpeech: (req: SpeechTranscribeRequest) =>
    sendJson<SpeechResult>('POST', '/api/speech/transcribe', req),
};
