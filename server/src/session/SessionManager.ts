import { PtySession, type PtySessionOptions } from './PtySession.js';
import type { SessionInfo } from '../protocol.js';

/**
 * 会话管理器:维护 SessionID → PtySession 映射。
 * - 启动时确保存在一个默认会话
 * - create/get/destroy/list
 * - 会话进程退出后保留条目(标记 not alive),供前端展示
 */
export class SessionManager {
  private readonly sessions = new Map<string, PtySession>();
  private defaultId?: string;

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
    return session;
  }

  get(id: string): PtySession | undefined {
    return this.sessions.get(id);
  }

  /** 终止并移除会话 */
  destroy(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.destroy();
    this.sessions.delete(id);
    if (this.defaultId === id) this.defaultId = undefined;
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
}
