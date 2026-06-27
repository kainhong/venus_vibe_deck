import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { config } from './config.js';

interface AuthTokenPayload {
  exp: number;
  iat: number;
}

export function getAuthStatus(req: IncomingMessage): { enabled: boolean; authenticated: boolean; expiresAt?: number } {
  if (!config.auth.enabled) return { enabled: false, authenticated: true };
  const payload = readAuthPayload(req);
  return {
    enabled: true,
    authenticated: !!payload,
    expiresAt: payload?.exp,
  };
}

export function authenticatePassword(password: string): { token: string; expiresAt: number } | null {
  if (!config.auth.enabled) {
    const expiresAt = Date.now() + getAuthTtlMs();
    return { token: createAuthToken(expiresAt), expiresAt };
  }
  if (!config.auth.password || password !== config.auth.password) return null;
  const expiresAt = Date.now() + getAuthTtlMs();
  return { token: createAuthToken(expiresAt), expiresAt };
}

export function isAuthenticatedRequest(req: IncomingMessage): boolean {
  if (!config.auth.enabled) return true;
  return !!readAuthPayload(req);
}

function readAuthPayload(req: IncomingMessage): AuthTokenPayload | null {
  const token = readBearerToken(req) ?? readQueryToken(req);
  if (!token) return null;
  return verifyAuthToken(token);
}

function readBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim();
}

function readQueryToken(req: IncomingMessage): string | undefined {
  const url = new URL(req.url ?? '/', 'http://localhost');
  return url.searchParams.get('auth')?.trim() || undefined;
}

function createAuthToken(expiresAt: number): string {
  const payload: AuthTokenPayload = { iat: Date.now(), exp: expiresAt };
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function verifyAuthToken(token: string): AuthTokenPayload | null {
  const [body, signature] = token.split('.');
  if (!body || !signature || !safeEqual(signature, sign(body))) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(body)) as AuthTokenPayload;
    if (!Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function sign(value: string): string {
  return createHmac('sha256', config.auth.tokenSecret).update(value).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getAuthTtlMs(): number {
  const days = Number.isFinite(config.auth.ttlDays) && config.auth.ttlDays > 0 ? config.auth.ttlDays : 7;
  return days * 24 * 60 * 60 * 1000;
}
