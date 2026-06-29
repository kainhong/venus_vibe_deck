import type { AuthLoginResponse, AuthStatus, ConfigDoc, DirListing, HistoryDoc, PrepareWorktreeRequest, PrepareWorktreeResponse, SpeechInterpretRequest, SpeechResult, SpeechTranscribeRequest } from '../types';

/**
 * 前端 HTTP client —— 同源 fetch /api/*(server 单进程同源,与 WS 一致,无需 base URL)。
 * 配置/历史/目录浏览走 HTTP REST;只有 create_session 走 WS(需即时绑定 PTY 订阅)。
 */

const AUTH_TOKEN_STORAGE_KEY = 'venus-vibe-deck.auth-token.v1';

export function getAuthToken(): string {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // 登录态持久化失败时,本次页面仍按接口返回继续。
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function sendJson<T>(method: string, url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function sendBlob(method: string, url: string, body: unknown, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(url, {
    method,
    signal,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return await res.blob();
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  getAuthStatus: () => getJson<AuthStatus>('/api/auth/status'),
  login: (password: string) => sendJson<AuthLoginResponse>('POST', '/api/auth/login', { password }),
  getConfig: () => getJson<ConfigDoc>('/api/config'),
  putConfig: (doc: ConfigDoc) => sendJson<ConfigDoc>('PUT', '/api/config', doc),
  getHistory: () => getJson<HistoryDoc>('/api/history'),
  /** 记录一次 workspace 使用(非幂等,POST) */
  addWorkspace: (path: string) => sendJson<HistoryDoc>('POST', '/api/history', { path }),
  /** 目录浏览;path 受后端白名单约束,缺省返回第一个允许根 */
  listDir: (path?: string) =>
    getJson<DirListing>(path ? `/api/dir?path=${encodeURIComponent(path)}` : '/api/dir'),
  prepareWorktree: (req: PrepareWorktreeRequest) =>
    sendJson<PrepareWorktreeResponse>('POST', '/api/worktree/prepare', req),
  transcribeSpeech: (req: SpeechTranscribeRequest) =>
    sendJson<SpeechResult>('POST', '/api/speech/transcribe', req),
  interpretSpeech: (req: SpeechInterpretRequest) =>
    sendJson<SpeechResult>('POST', '/api/speech/interpret', req),
  getPushPublicKey: () => getJson<{ publicKey: string }>('/api/push/public-key'),
  subscribePush: (subscription: PushSubscriptionJSON) =>
    sendJson<{ ok: boolean; count: number }>('POST', '/api/push/subscribe', subscription),
  synthesizeTts: (text: string, signal?: AbortSignal) => sendBlob('POST', '/api/tts', { text }, signal),
};
