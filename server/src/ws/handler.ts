import type { WebSocket, RawData } from 'ws';
import { randomUUID } from 'node:crypto';
import type { SessionManager } from '../session/SessionManager.js';
import type { ClientMessage, ServerMessage } from '../protocol.js';
import { createLogger } from '../logger.js';
import { loadConfig } from '../storage/cliConfigStore.js';
import { ensureCliHooks } from '../hooks/cliHooks.js';

const logger = createLogger('ws');

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
    logger.info('websocket connected');
    this.unsubscribeManager = manager.onEvent((event) => {
      if (event.type === 'session_destroyed') {
        if (this.currentSessionId === event.sessionId) this.detach();
        this.send({ type: 'session_destroyed', sessionId: event.sessionId });
        this.send({ type: 'session_list', sessions: event.sessions });
      }
      if (event.type === 'notification') {
        this.send({
          type: 'terminal_bell',
          sessionId: event.sessionId,
          at: event.at,
          source: event.source,
          message: event.message,
        });
        logger.info('notification sent to websocket', {
          sessionId: event.sessionId,
          currentSessionId: this.currentSessionId,
          source: event.source,
        });
      }
      if (event.type === 'cli_session_end') {
        this.send({
          type: 'cli_session_end',
          sessionId: event.sessionId,
          at: event.at,
          source: event.source,
          message: event.message,
        });
      }
    });
    ws.on('message', (raw) => {
      void this.onMessage(raw);
    });
    ws.on('close', () => this.close());
    ws.on('error', () => this.close());
  }

  private send(msg: ServerMessage): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(msg));
      if (msg.type === 'terminal_bell') {
        logger.debug('terminal bell sent', { sessionId: msg.sessionId, source: msg.source });
      }
    }
  }

  /** 绑定到指定会话:先回放缓冲,再订阅增量输出 */
  private attach(sessionId: string): void {
    this.detach();
    const session = this.manager.get(sessionId);
    if (!session) {
      logger.warn('attach failed: session not found', { sessionId });
      this.send({ type: 'error', message: `session not found: ${sessionId}` });
      return;
    }
    this.currentSessionId = sessionId;
    logger.info('websocket attached to session', { sessionId });
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
    logger.info('websocket closed', { currentSessionId: this.currentSessionId });
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

  private async onMessage(raw: RawData): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      logger.warn('invalid websocket json');
      this.send({ type: 'error', message: 'invalid JSON' });
      return;
    }

    if (msg.action === 'input') {
      // input 消息携带 sessionId,校验后写入
      const session = this.manager.get(msg.sessionId);
      if (!session) {
        logger.warn('input rejected: session not found', { sessionId: msg.sessionId });
        this.send({ type: 'error', message: `session not found: ${msg.sessionId}` });
        return;
      }
      this.currentSessionId = msg.sessionId;
      logger.debug('pty input received', { sessionId: msg.sessionId, bytes: msg.data.length });
      session.write(msg.data);
      return;
    }

    if (msg.action === 'resize') {
      // 同步终端尺寸到 PTY,使输出按真实 cols/rows 排版(换行/TUI 布局)
      this.manager.get(msg.sessionId)?.resize(msg.cols, msg.rows);
      logger.debug('pty resize received', { sessionId: msg.sessionId, cols: msg.cols, rows: msg.rows });
      return;
    }

    // action === 'system'
    switch (msg.command) {
      case 'hello': {
        const sessions = this.manager.list();
        logger.debug('hello received', { targetSessionId: msg.targetSessionId, sessionCount: sessions.length });
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
          const sessionId = randomUUID();
          const cliConfig = await this.resolveCliConfig(msg.cliConfigId);
          await ensureCliHooks({
            cliConfig,
            command: msg.command_bin,
            cwd: msg.cwd,
            sessionId,
          });
          const session = this.manager.create({
            id: sessionId,
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
          logger.error('create session failed', { err: err as Error });
          // cwd 无效/命令不存在等 spawn 失败 → 告知客户端而非抛断连接
          this.send({ type: 'error', message: `create session failed: ${(err as Error).message}` });
        }
        break;
      }
      case 'switch_session': {
        const target = this.resolveSessionId(msg.targetSessionId);
        if (target) this.attach(target);
        else {
          logger.warn('switch session failed: target not found', { targetSessionId: msg.targetSessionId });
          this.send({ type: 'error', message: `session not found: ${msg.targetSessionId}` });
        }
        break;
      }
      case 'destroy_session': {
        const destroyed = this.manager.destroy(msg.sessionId);
        if (!destroyed) {
          logger.warn('destroy session failed: session not found', { sessionId: msg.sessionId });
          this.send({ type: 'error', message: `session not found: ${msg.sessionId}` });
        }
        break;
      }
    }
  }

  private async resolveCliConfig(cliConfigId: string | undefined) {
    if (!cliConfigId) return undefined;
    try {
      const doc = await loadConfig();
      return doc.cliConfigs.find((config) => config.id === cliConfigId);
    } catch (err) {
      logger.warn('failed to load cli config for hook setup', { cliConfigId, err: err as Error });
      return undefined;
    }
  }
}
