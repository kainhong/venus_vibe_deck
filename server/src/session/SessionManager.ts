import { PtySession, type PtySessionOptions } from './PtySession.js';
import type { SessionInfo } from '../protocol.js';
import { createLogger } from '../logger.js';

const logger = createLogger('session-manager');

export type SessionManagerEvent =
  | { type: 'session_destroyed'; sessionId: string; sessions: SessionInfo[] }
  | { type: 'notification'; sessionId?: string; at: number; source?: string; message?: string };

/**
 * 会话管理器:维护 SessionID → PtySession 映射。
 * - create/get/destroy/list
 * - 会话进程退出后移除条目,并通知客户端刷新列表
 */
export class SessionManager {
  private readonly sessions = new Map<string, PtySession>();
  private defaultId?: string;
  private readonly listeners = new Set<(event: SessionManagerEvent) => void>();

  /** 确保默认会话存在并返回它 */
  ensureDefault(): PtySession {
    if (this.defaultId && this.sessions.has(this.defaultId)) {
      return this.sessions.get(this.defaultId)!;
    }
    const session = this.create({ name: 'default' });
    this.defaultId = session.id;
    return session;
  }

  /** 创建并注册新会话 */
  create(opts: PtySessionOptions = {}): PtySession {
    const session = new PtySession(opts);
    this.sessions.set(session.id, session);
    logger.info('session created', {
      sessionId: session.id,
      name: session.name,
      command: opts.command,
      args: opts.args,
      cwd: opts.cwd,
    });
    session.onExit(() => {
      this.remove(session.id, false);
    });
    return session;
  }

  get(id: string): PtySession | undefined {
    return this.sessions.get(id);
  }

  /** 终止并移除会话 */
  destroy(id: string): boolean {
    return this.remove(id, true);
  }

  private remove(id: string, kill: boolean): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    this.sessions.delete(id);
    if (this.defaultId === id) this.defaultId = undefined;
    if (kill) session.destroy();
    logger.info('session removed', { sessionId: id, name: session.name, killed: kill });
    this.emit({ type: 'session_destroyed', sessionId: id, sessions: this.list() });
    return true;
  }

  list(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.toInfo());
  }

  /** 关闭全部会话(优雅关闭) */
  shutdown(): void {
    for (const session of this.sessions.values()) session.destroy();
    this.sessions.clear();
    this.defaultId = undefined;
  }

  onEvent(listener: (event: SessionManagerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event: { sessionId?: string; source?: string; message?: string }): void {
    const payload = { type: 'notification' as const, at: Date.now(), ...event };
    logger.info('notification broadcast', payload);
    this.emit(payload);
  }

  private emit(event: SessionManagerEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
