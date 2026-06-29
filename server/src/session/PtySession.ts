import { spawn, type IPty } from 'node-pty';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import type { SessionInfo } from '../protocol.js';
import { createLogger } from '../logger.js';

const logger = createLogger('pty');

export interface PtySessionOptions {
  id?: string;
  command?: string;
  args?: string[];
  name?: string;
  /** 工作区路径,PTY 以此为 cwd;缺失回退 HOME/cwd(向后兼容 ensureDefault) */
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

/**
 * 单个 PTY 会话:封装 node-pty 进程。
 * - spawn 真实 TTY 进程(默认 bash,可配置为 claude 等)
 * - stdout(onData)→ 广播给所有订阅者 + 写入滚动缓冲
 * - write() 接收客户端输入
 * - 断线不销毁:进程持续运行,缓冲供重连回放
 *
 * 注:本类只懂进程,不懂 CLI 语义(resume 拼装在 ws/handler,保持单一职责)。
 */
export class PtySession {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  alive = true;

  private readonly pty: IPty;
  private buffer = '';
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<(info: { exitCode: number; signal?: number }) => void>();

  constructor(opts: PtySessionOptions = {}) {
    this.id = opts.id ?? randomUUID();
    this.name = opts.name ?? `session-${this.id.slice(0, 8)}`;
    this.createdAt = Date.now();

    // node-pty 要求 env 为 Record<string,string>,过滤掉 undefined
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }
    // 强制 TERM 兼容,确保 ANSI/256 色正确还原
    env.TERM = env.TERM ?? 'xterm-256color';
    env.VENUS_SESSION_ID = this.id;
    env.VENUS_NOTIFICATION_URL = `http://127.0.0.1:${config.port}/api/notification`;
    env.VENUS_HOOK_URL = `http://127.0.0.1:${config.port}/api/hooks/cli-event`;
    for (const [k, v] of Object.entries(opts.env ?? {})) {
      env[k] = v;
    }

    const command = opts.command ?? config.defaultCommand;
    const args = opts.args ?? config.defaultArgs;
    const cwd = opts.cwd ?? process.env.HOME ?? process.cwd();
    logger.info('pty spawn', { sessionId: this.id, name: this.name, command, args, cwd });

    this.pty = spawn(command, args, {
      name: 'xterm-256color',
      cols: opts.cols ?? config.cols,
      rows: opts.rows ?? config.rows,
      // 优先 workspace,缺失回退(向后兼容 ensureDefault 的默认 bash)
      cwd,
      env,
    });

    this.pty.onData((data) => {
      this.appendBuffer(data);
      for (const cb of this.dataListeners) cb(data);
    });
    this.pty.onExit(({ exitCode, signal }) => {
      this.alive = false;
      logger.info('pty exited', { sessionId: this.id, name: this.name, exitCode, signal });
      for (const cb of this.exitListeners) cb({ exitCode, signal });
    });
  }

  /** 向 PTY 写入输入(键码或文本) */
  write(data: string): void {
    this.pty.write(data);
  }

  /** 订阅输出流,返回取消订阅函数 */
  onData(cb: (data: string) => void): () => void {
    this.dataListeners.add(cb);
    return () => this.dataListeners.delete(cb);
  }

  /** 订阅进程退出 */
  onExit(cb: (info: { exitCode: number; signal?: number }) => void): () => void {
    this.exitListeners.add(cb);
    return () => this.exitListeners.delete(cb);
  }

  /** 当前滚动缓冲(供断线重连回放) */
  getScrollback(): string {
    return this.buffer;
  }

  /** 调整终端尺寸(窗口/横竖屏变化) */
  resize(cols: number, rows: number): void {
    try {
      this.pty.resize(cols, rows);
    } catch {
      // 进程已退出时 resize 会抛错,忽略
    }
  }

  /**
   * 终止 PTY 进程:用 SIGKILL 替代默认 SIGHUP。
   * SIGHUP 杀不掉 trap '' HUP / nohup / daemon 的进程(session-lifecycle.md §4 盲点 A);
   * SIGKILL 不可被忽略。优先杀 PTY 进程组,再兜底杀主进程。
   */
  destroy(): void {
    this.alive = false;
    logger.info('pty destroy requested', { sessionId: this.id, name: this.name, pid: this.pty.pid });
    try {
      process.kill(-this.pty.pid, 'SIGKILL');
    } catch {
      // 平台不支持负 pid / 进程组已退出时兜底杀主进程
    }
    try {
      this.pty.kill('SIGKILL');
    } catch {
      // 已退出则忽略
    }
  }

  toInfo(): SessionInfo {
    return { id: this.id, name: this.name, createdAt: this.createdAt, alive: this.alive };
  }

  private appendBuffer(data: string): void {
    this.buffer += data;
    if (this.buffer.length > config.scrollbackBytes) {
      this.buffer = this.buffer.slice(-config.scrollbackBytes);
    }
  }
}
