import type { WebSocket, RawData } from 'ws';
import type { SessionManager } from '../session/SessionManager.js';
import type { ClientMessage, ServerMessage } from '../protocol.js';

/**
 * 单个客户端连接:绑定到一个会话,路由消息。
 * - 收到 input → 写入当前会话 PTY
 * - 收到 system(hello/create/switch/destroy)→ 管理 会话绑定
 * - 当前会话的 PTY 输出 → 推送 terminal_out(attach 时先回放 scrollback)
 */
export class ClientConnection {
  private currentSessionId: string | undefined;
  private unsubscribe: (() => void) | undefined;
  private unsubscribeManager: (() => void) | undefined;

  constructor(
    private readonly ws: WebSocket,
    private readonly manager: SessionManager,
  ) {
    this.unsubscribeManager = manager.onEvent((event) => {
      if (event.type === 'session_destroyed') {
        if (this.currentSessionId === event.sessionId) this.detach();
        this.send({ type: 'session_destroyed', sessionId: event.sessionId });
        this.send({ type: 'session_list', sessions: event.sessions });
      }
    });
    ws.on('message', (raw) => this.onMessage(raw));
    ws.on('close', () => this.close());
    ws.on('error', () => this.close());
  }

  private send(msg: ServerMessage): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** 绑定到指定会话:先回放缓冲,再订阅增量输出 */
  private attach(sessionId: string): void {
    this.detach();
    const session = this.manager.get(sessionId);
    if (!session) {
      this.send({ type: 'error', message: `session not found: ${sessionId}` });
      return;
    }
    this.currentSessionId = sessionId;
    // 回放已有输出,确保客户端能看到连接前的内容
    const scrollback = session.getScrollback();
    if (scrollback) this.send({ type: 'terminal_out', sessionId, data: scrollback });
    this.unsubscribe = session.onData((data) => {
      this.send({ type: 'terminal_out', sessionId, data });
    });
  }

  private detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private close(): void {
    this.detach();
    this.unsubscribeManager?.();
    this.unsubscribeManager = undefined;
  }

  private resolveSessionId(token: string | undefined): string | undefined {
    if (!token) return undefined;
    const sessions = this.manager.list();
    if (sessions.some((s) => s.id === token)) return token;
    const matches = sessions.filter((s) => s.id.startsWith(token));
    return matches.length === 1 ? matches[0].id : undefined;
  }

  private onMessage(raw: RawData): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      this.send({ type: 'error', message: 'invalid JSON' });
      return;
    }

    if (msg.action === 'input') {
      // input 消息携带 sessionId,校验后写入
      const session = this.manager.get(msg.sessionId);
      if (!session) {
        this.send({ type: 'error', message: `session not found: ${msg.sessionId}` });
        return;
      }
      this.currentSessionId = msg.sessionId;
      session.write(msg.data);
      return;
    }

    if (msg.action === 'resize') {
      // 同步终端尺寸到 PTY,使输出按真实 cols/rows 排版(换行/TUI 布局)
      this.manager.get(msg.sessionId)?.resize(msg.cols, msg.rows);
      return;
    }

    // action === 'system'
    switch (msg.command) {
      case 'hello': {
        const sessions = this.manager.list();
        this.send({ type: 'session_list', sessions });
        const target = this.resolveSessionId(msg.targetSessionId) ?? this.currentSessionId ?? sessions[0]?.id;
        if (target) this.attach(target);
        break;
      }
      case 'create_session': {
        try {
          // resume 拼装:resumeArg 必须在前 → claude -c --xxx(spec-ui §4)
          const baseArgs = msg.args ?? [];
          const finalArgs = msg.resume && msg.resumeArg ? [msg.resumeArg, ...baseArgs] : baseArgs;
          const session = this.manager.create({
            name: msg.name ?? msg.command_bin,
            command: msg.command_bin,
            args: finalArgs,
            cwd: msg.cwd,
          });
          // 先通知 session_created(客户端记录 sid),再 attach 回放 scrollback;
          // 否则 scrollback 在 session_created 之前到达,客户端因 sid 未知而丢弃初始输出
          this.send({ type: 'session_created', sessionId: session.id, name: session.name });
          this.attach(session.id);
          this.send({ type: 'session_list', sessions: this.manager.list() });
        } catch (err) {
          // cwd 无效/命令不存在等 spawn 失败 → 告知客户端而非抛断连接
          this.send({ type: 'error', message: `create session failed: ${(err as Error).message}` });
        }
        break;
      }
      case 'switch_session': {
        const target = this.resolveSessionId(msg.targetSessionId);
        if (target) this.attach(target);
        else this.send({ type: 'error', message: `session not found: ${msg.targetSessionId}` });
        break;
      }
      case 'destroy_session': {
        const destroyed = this.manager.destroy(msg.sessionId);
        if (!destroyed) {
          this.send({ type: 'error', message: `session not found: ${msg.sessionId}` });
        }
        break;
      }
    }
  }
}
